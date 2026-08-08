/**
 * Shared helper for uploading merchant-provided images (logos, etc.) to
 * Shopify Files via the staged-upload flow, used by both the checkout
 * redirect Branding tab (app.app-settings.tsx) and the Form Builder's
 * custom form logo (app.settings.tsx).
 */
export async function uploadImageToShopify(admin: any, file: File): Promise<string> {
    // 1. Get staged upload URL from Shopify
    const stagedRes = await admin.graphql(`
        mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
                stagedTargets {
                    url
                    resourceUrl
                    parameters { name value }
                }
                userErrors { field message }
            }
        }
    `, {
        variables: {
            input: [{
                filename: file.name,
                mimeType: file.type,
                resource: 'FILE',
                fileSize: String(file.size),
                httpMethod: 'POST',
            }],
        },
    });

    const stagedData = await stagedRes.json();
    const userErrors = stagedData?.data?.stagedUploadsCreate?.userErrors;
    if (userErrors?.length) throw new Error(`Shopify staged upload error: ${userErrors[0].message}`);

    const target = stagedData?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) throw new Error('Failed to get staged upload target from Shopify');

    // 2. Upload file bytes to Shopify S3
    const uploadForm = new FormData();
    for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
    }
    const fileBuffer = await file.arrayBuffer();
    uploadForm.append('file', new Blob([fileBuffer], { type: file.type }), file.name);

    const uploadRes = await fetch(target.url, { method: 'POST', body: uploadForm });
    if (!uploadRes.ok) {
        throw new Error(`Failed to upload to Shopify CDN: ${uploadRes.status} ${uploadRes.statusText}`);
    }

    // 3. Create the file record in Shopify Files
    const fileCreateRes = await admin.graphql(`
        mutation FileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
                files {
                    id
                    fileStatus
                    alt
                    ... on MediaImage {
                        image {
                            url
                        }
                    }
                }
                userErrors { field message }
            }
        }
    `, {
        variables: {
            files: [{
                originalSource: target.resourceUrl,
                contentType: 'IMAGE',
            }],
        },
    });

    const fileCreateData = await fileCreateRes.json();
    const fileUserErrors = fileCreateData?.data?.fileCreate?.userErrors;
    if (fileUserErrors?.length) throw new Error(`Shopify fileCreate error: ${fileUserErrors[0].message}`);

    const createdFile = fileCreateData?.data?.fileCreate?.files?.[0];
    if (!createdFile) throw new Error('No file returned from fileCreate');

    const fileId = createdFile.id;
    let finalUrl = createdFile.image?.url;
    let status = createdFile.fileStatus;
    let attempts = 0;

    // 4. Poll until the file is READY and has a URL
    while ((status !== 'READY' || !finalUrl) && attempts < 15) {
        await new Promise(res => setTimeout(res, 1000));
        const pollRes = await admin.graphql(`
            query {
                node(id: "${fileId}") {
                    ... on MediaImage {
                        fileStatus
                        image { url }
                    }
                }
            }
        `);
        const pollData = await pollRes.json();
        const node = pollData?.data?.node;
        if (node) {
            status = node.fileStatus;
            finalUrl = node.image?.url;
        }
        attempts++;
    }

    if (!finalUrl) {
        throw new Error('Timeout waiting for Shopify to process the uploaded image.');
    }

    return finalUrl;
}
