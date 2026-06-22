const fs = require('fs');
const path = '/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/app/routes/app.app-settings.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Zoom and Reset UI
const uiStart = `                                            {/* Section Header */}`;
const uiEnd = `                                                    {/* Logo Shape */}`;

const oldUI = content.substring(content.indexOf(uiStart), content.indexOf(uiEnd));

const newUI = `                                            {/* Section Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <BlockStack gap="200">
                                                    <Text variant="headingLg" as="h2">Checkout Redirect Branding</Text>
                                                    <Text variant="bodySm" tone="subdued" as="p">Customize the loading screen shown before customers are redirected to Shopify Checkout</Text>
                                                </BlockStack>
                                                <Button tone="critical" variant="plain" onClick={resetBrandingToDefault}>Reset to default</Button>
                                            </div>

                                            {/* Display Mode */}
                                            <Card>
                                                <BlockStack gap="400">
                                                    <Text variant="headingMd" as="h2">Display Mode</Text>
                                                    <ChoiceList
                                                        title="Choose what icon appears on the redirect screen"
                                                        titleHidden
                                                        choices={[
                                                            { label: 'Shopify Lock Icon', value: 'lock_icon' },
                                                            { label: 'Custom Logo', value: 'custom_logo' }
                                                        ]}
                                                        selected={[cr.display_mode]}
                                                        onChange={(selected) => updateCheckoutRedirect({ display_mode: selected[0] as 'lock_icon' | 'custom_logo' })}
                                                    />
                                                    {cr.display_mode === 'custom_logo' && !logoUrl && (
                                                        <Banner tone="warning">Upload a logo below to use custom branding.</Banner>
                                                    )}
                                                </BlockStack>
                                            </Card>

                                            {/* Logo Upload */}
                                            <Card>
                                                <BlockStack gap="400">
                                                    <Text variant="headingMd" as="h2">Checkout Logo</Text>
                                                    <Text variant="bodySm" tone="subdued" as="p">PNG, JPG, SVG, WEBP · Max 5 MB · Recommended 300×300 px</Text>
                                                    
                                                    {logoUrl ? (
                                                        <InlineStack gap="400" align="start" blockAlign="center">
                                                            <div style={{ width: 80, height: 80, border: '1px solid #e5e7eb', borderRadius: 8, padding: 4, background: 'white' }}>
                                                                <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                            </div>
                                                            <BlockStack gap="200">
                                                                <div style={{ width: 200 }}>
                                                                    <DropZone allowMultiple={false} onDrop={handleDropZoneDrop} accept="image/png, image/jpeg, image/svg+xml, image/webp">
                                                                        <DropZone.FileUpload actionTitle="Replace Logo" />
                                                                    </DropZone>
                                                                </div>
                                                                <Button tone="critical" variant="plain" onClick={handleRemoveLogo}>Remove</Button>
                                                            </BlockStack>
                                                        </InlineStack>
                                                    ) : (
                                                        <DropZone allowMultiple={false} onDrop={handleDropZoneDrop} accept="image/png, image/jpeg, image/svg+xml, image/webp">
                                                            <DropZone.FileUpload />
                                                        </DropZone>
                                                    )}
                                                </BlockStack>
                                            </Card>

                                            {cr.display_mode === 'custom_logo' && (
                                                <>
                                                    {/* Logo Size */}
                                                    <Card>
                                                        <BlockStack gap="400">
                                                            <Text variant="headingMd" as="h2">Logo Size: {logoSize}px</Text>
                                                            <RangeSlider
                                                                label="Logo Size"
                                                                labelHidden
                                                                min={40}
                                                                max={120}
                                                                step={4}
                                                                value={logoSize}
                                                                onChange={(v) => updateCheckoutRedirect({ logo_size: v })}
                                                                output
                                                            />
                                                        </BlockStack>
                                                    </Card>

                                                    {/* Logo Zoom */}
                                                    <Card>
                                                        <BlockStack gap="400">
                                                            <Text variant="headingMd" as="h2">Image Zoom: {cr.logo_zoom || 100}%</Text>
                                                            <Text variant="bodySm" tone="subdued" as="p">Scale the image up or down to fit perfectly inside the logo container.</Text>
                                                            <RangeSlider
                                                                label="Image Zoom"
                                                                labelHidden
                                                                min={50}
                                                                max={200}
                                                                step={5}
                                                                value={cr.logo_zoom || 100}
                                                                onChange={(v) => updateCheckoutRedirect({ logo_zoom: v })}
                                                                output
                                                            />
                                                        </BlockStack>
                                                    </Card>

`;

if (content.includes(uiStart)) {
    content = content.replace(oldUI, newUI);
} else {
    console.error("Could not find UI block to replace.");
}

// 2. Add Zoom scale to Live Preview image
const oldPreviewImg = `<img
                                                                            src={logoUrl}
                                                                            alt="Logo preview"
                                                                            style={{ width: cr.show_background ? '100%' : logoSize * 0.55, height: cr.show_background ? '100%' : logoSize * 0.55, objectFit: cr.logo_shape === 'circle' ? 'cover' : 'contain', borderRadius: logoShapeBorderRadius, display: 'block' }}
                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                        />`;
const newPreviewImg = `const zoomScale = cr.logo_zoom ? cr.logo_zoom / 100 : 1;
                                                                    <img
                                                                            src={logoUrl}
                                                                            alt="Logo preview"
                                                                            style={{ width: cr.show_background ? '100%' : logoSize * 0.55, height: cr.show_background ? '100%' : logoSize * 0.55, objectFit: cr.logo_shape === 'circle' ? 'cover' : 'contain', borderRadius: logoShapeBorderRadius, display: 'block', transform: \`scale(\${cr.logo_zoom ? cr.logo_zoom / 100 : 1})\` }}
                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                        />`;

if (content.includes(oldPreviewImg.replace('const zoomScale = cr.logo_zoom ? cr.logo_zoom / 100 : 1;\n', ''))) { // the const is not in the original
   content = content.replace(oldPreviewImg, newPreviewImg.replace('const zoomScale = cr.logo_zoom ? cr.logo_zoom / 100 : 1;\n                                                                    ', ''));
} else {
   console.error("Could not find Live Preview image tag.");
}

fs.writeFileSync(path, content, 'utf8');
console.log('Update 2 complete.');
