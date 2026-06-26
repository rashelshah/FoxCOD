/**
 * App Settings Page — Tabbed: Pixels | Fraud Protection | Branding
 * Route: /app/app-settings
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLoaderData, useSubmit, useActionData, useNavigation, Link, useSearchParams } from 'react-router';
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { useAppBridge } from '@shopify/app-bridge-react';
import {
    Text, InlineStack, BlockStack,
    TextField, Checkbox, Badge, Banner, Select, Divider,
    Button, RadioButton, Tabs, Page, Card, DropZone,
    Thumbnail, RangeSlider, Layout, ChoiceList
} from '@shopify/polaris';
import { DeleteIcon } from '@shopify/polaris-icons';
import { authenticate } from '../shopify.server';
import { getPixelSettings, savePixelSettings, deletePixelSettings, syncPixelsToMetafield } from '../services/pixel-tracking.server';
import type { PixelTrackingSettings, PixelProvider } from '../config/pixel-tracking.types';
import { PIXEL_PROVIDERS, DEFAULT_PIXEL_SETTINGS } from '../config/pixel-tracking.types';
import {
    getFraudProtectionSettings,
    saveFraudProtectionSettings,
    syncFraudSettingsToMetafield,
} from '../services/fraud-protection.server';
import type { FraudProtectionSettings } from '../config/fraud-protection.types';
import { DEFAULT_FRAUD_SETTINGS } from '../config/fraud-protection.types';
import { getBrandingSettings, saveBrandingSettings } from '../config/supabase.server';
import type { Branding, BrandingCheckoutRedirect } from '../config/branding.types';
import { DEFAULT_BRANDING } from '../config/branding.types';

// ── LOADER ──
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const [pixels, fraudSettings, branding] = await Promise.all([
        getPixelSettings(shopDomain),
        getFraudProtectionSettings(shopDomain),
        getBrandingSettings(shopDomain),
    ]);
    return { pixels, fraudSettings, branding, shopDomain };
};

// ── SHOPIFY FILES UPLOAD HELPER ──
async function uploadLogoToShopify(admin: any, file: File): Promise<string> {
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

    let fileId = createdFile.id;
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

// ── BRANDING METAFIELD SYNC ──
async function syncBrandingToMetafield(admin: any, shopDomain: string, branding: Branding): Promise<void> {
    const shopRes = await admin.graphql(`query { shop { id } }`);
    const shopGid = (await shopRes.json())?.data?.shop?.id;
    if (!shopGid) throw new Error('Could not resolve shop GID for metafield sync');

    await admin.graphql(`
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                metafields { key }
                userErrors { field message }
            }
        }
    `, {
        variables: {
            metafields: [{
                ownerId: shopGid,
                namespace: 'fox_cod',
                key: 'branding_json',
                value: JSON.stringify(branding),
                type: 'json',
            }],
        },
    });
}

// ── ACTION ──
export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const formData = await request.formData();
    const intent = formData.get('intent') as string;

    try {
        // Pixel actions
        if (intent === 'save_pixels') {
            const pixelsJson = formData.get('pixels') as string;
            const pixels: PixelTrackingSettings[] = JSON.parse(pixelsJson);
            for (const px of pixels) {
                await savePixelSettings({ ...px, shop_domain: shopDomain });
            }
            await syncPixelsToMetafield(admin, shopDomain);
            return { success: true, message: 'Pixel settings saved!' };
        }
        if (intent === 'delete_pixel') {
            const pixelId = formData.get('pixelId') as string;
            await deletePixelSettings(pixelId, shopDomain);
            await syncPixelsToMetafield(admin, shopDomain);
            return { success: true, message: 'Pixel deleted!' };
        }

        // Fraud actions
        if (intent === 'save_fraud') {
            const settingsJson = formData.get('settings') as string;
            const settings: FraudProtectionSettings = JSON.parse(settingsJson);
            settings.shop_domain = shopDomain;
            await saveFraudProtectionSettings(settings);
            await syncFraudSettingsToMetafield(admin, shopDomain);
            return { success: true, message: 'Fraud protection settings saved!' };
        }

        // Branding actions
        if (intent === 'save_branding') {
            const brandingJson = formData.get('branding') as string;
            const logoFile = formData.get('logo_file') as File | null;

            let branding: Branding = JSON.parse(brandingJson);

            // Upload new logo if provided
            if (logoFile && logoFile.size > 0) {
                // Validate file type
                const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
                if (!ALLOWED_TYPES.includes(logoFile.type)) {
                    return { success: false, message: `Invalid file type: ${logoFile.type}. Allowed: PNG, JPG, JPEG, SVG, WEBP.` };
                }
                // Validate file size (5MB)
                if (logoFile.size > 5 * 1024 * 1024) {
                    return { success: false, message: 'Logo file is too large. Maximum size is 5 MB.' };
                }

                console.log('[Branding] Uploading logo to Shopify Files...', logoFile.name, logoFile.size, 'bytes');
                const logoUrl = await uploadLogoToShopify(admin, logoFile);
                branding = {
                    ...branding,
                    checkout_redirect: {
                        ...branding.checkout_redirect,
                        logo_url: logoUrl,
                        display_mode: 'custom_logo',
                        enabled: true,
                    },
                };
                console.log('[Branding] Logo uploaded successfully:', logoUrl);
            }

            // Save to Supabase
            await saveBrandingSettings(shopDomain, branding);

            // Sync to Shopify metafield (storefront-accessible)
            await syncBrandingToMetafield(admin, shopDomain, branding);

            return { success: true, message: 'Branding settings saved!', branding };
        }

        return { success: false, message: 'Unknown action' };
    } catch (error: any) {
        console.error('[Settings] Action error:', error);
        return { success: false, message: error.message || 'Something went wrong' };
    }
};

// ── TABS ──
const TABS = [
    { id: 'pixels', content: 'Pixels' },
    { id: 'fraud', content: 'Fraud Protection' },
    { id: 'branding', content: 'Branding' },
];

type TabId = 'pixels' | 'fraud' | 'branding';

// ── COMPONENT ──
export default function AppSettingsPage() {
    const { pixels: initialPixels, fraudSettings: initialFraud, branding: initialBranding, shopDomain } = useLoaderData<any>();
    const actionData = useActionData<any>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const isSaving = navigation.state === 'submitting';

    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = (searchParams.get('tab') as TabId) || 'pixels';
    const [activeTab, setActiveTab] = useState<TabId>(TABS.some(t => t.id === initialTab) ? initialTab : 'pixels');

    // Update URL when tab changes
    const handleTabChange = (idx: number) => {
        const newTab = TABS[idx].id as TabId;
        setActiveTab(newTab);
        setSearchParams({ tab: newTab }, { replace: true });
    };

    // ═══════════ PIXEL STATE ═══════════
    const [pixels, setPixels] = useState<PixelTrackingSettings[]>(initialPixels || []);
    const [pixelChanges, setPixelChanges] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => { if (initialPixels) { setPixels(initialPixels); setPixelChanges(false); } }, [initialPixels]);

    const updatePixel = useCallback((id: string, updates: Partial<PixelTrackingSettings>) => {
        setPixels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
        setPixelChanges(true);
    }, []);

    const addNewPixel = useCallback(() => {
        const newPixel: PixelTrackingSettings = { id: `new_${Date.now()}`, shop_domain: shopDomain, provider: 'facebook' as PixelProvider, ...DEFAULT_PIXEL_SETTINGS };
        setPixels(prev => [...prev, newPixel]);
        setExpandedId(newPixel.id!);
        setPixelChanges(true);
    }, [shopDomain]);

    const removePixel = useCallback((id: string) => {
        if (id.startsWith('new_')) { setPixels(prev => prev.filter(p => p.id !== id)); setPixelChanges(true); }
        else { const fd = new FormData(); fd.set('intent', 'delete_pixel'); fd.set('pixelId', id); submit(fd, { method: 'post' }); }
    }, [submit]);

    const savePixels = useCallback(() => {
        const fd = new FormData();
        fd.set('intent', 'save_pixels');
        fd.set('pixels', JSON.stringify(pixels.map(p => ({ ...p, id: p.id?.startsWith('new_') ? undefined : p.id }))));
        submit(fd, { method: 'post' });
    }, [pixels, submit]);

    const discardPixels = useCallback(() => { setPixels(initialPixels || []); setPixelChanges(false); }, [initialPixels]);

    // ═══════════ FRAUD STATE ═══════════
    const [fraud, setFraud] = useState<FraudProtectionSettings>(initialFraud || { ...DEFAULT_FRAUD_SETTINGS, shop_domain: shopDomain });
    const [fraudChanges, setFraudChanges] = useState(false);
    const [phoneText, setPhoneText] = useState((initialFraud?.blocked_phone_numbers || []).join('\n'));
    const [emailText, setEmailText] = useState((initialFraud?.blocked_emails || []).join('\n'));
    const [blockedIpText, setBlockedIpText] = useState((initialFraud?.blocked_ip_addresses || []).join('\n'));
    const [allowedIpText, setAllowedIpText] = useState((initialFraud?.allowed_ip_addresses || []).join('\n'));
    const [postalText, setPostalText] = useState((initialFraud?.postal_codes || []).join('\n'));

    useEffect(() => {
        if (initialFraud) {
            setFraud(initialFraud);
            setPhoneText((initialFraud.blocked_phone_numbers || []).join('\n'));
            setEmailText((initialFraud.blocked_emails || []).join('\n'));
            setBlockedIpText((initialFraud.blocked_ip_addresses || []).join('\n'));
            setAllowedIpText((initialFraud.allowed_ip_addresses || []).join('\n'));
            setPostalText((initialFraud.postal_codes || []).join('\n'));
            setFraudChanges(false);
        }
    }, [initialFraud]);

    const updateFraud = useCallback((u: Partial<FraudProtectionSettings>) => { setFraud(prev => ({ ...prev, ...u })); setFraudChanges(true); }, []);
    const textToArray = (t: string) => t.split('\n').map(s => s.trim()).filter(Boolean);

    const saveFraud = useCallback(() => {
        const fd = new FormData();
        fd.set('intent', 'save_fraud');
        fd.set('settings', JSON.stringify({ ...fraud, blocked_phone_numbers: textToArray(phoneText), blocked_emails: textToArray(emailText), blocked_ip_addresses: textToArray(blockedIpText), allowed_ip_addresses: textToArray(allowedIpText), postal_codes: textToArray(postalText) }));
        submit(fd, { method: 'post' });
    }, [fraud, phoneText, emailText, blockedIpText, allowedIpText, postalText, submit]);

    const discardFraud = useCallback(() => {
        setFraud(initialFraud || { ...DEFAULT_FRAUD_SETTINGS, shop_domain: shopDomain });
        setPhoneText((initialFraud?.blocked_phone_numbers || []).join('\n'));
        setEmailText((initialFraud?.blocked_emails || []).join('\n'));
        setBlockedIpText((initialFraud?.blocked_ip_addresses || []).join('\n'));
        setAllowedIpText((initialFraud?.allowed_ip_addresses || []).join('\n'));
        setPostalText((initialFraud?.postal_codes || []).join('\n'));
        setFraudChanges(false);
    }, [initialFraud, shopDomain]);

    // ═══════════ BRANDING STATE ═══════════
    const mergedBranding: Branding = {
        ...DEFAULT_BRANDING,
        ...(initialBranding || {}),
        checkout_redirect: {
            ...DEFAULT_BRANDING.checkout_redirect,
            ...((initialBranding as Branding)?.checkout_redirect || {}),
        },
    };
    const [branding, setBranding] = useState<Branding>(mergedBranding);
    const [brandingChanges, setBrandingChanges] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>(mergedBranding.checkout_redirect.logo_url || '');
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialBranding) {
            const merged: Branding = {
                ...DEFAULT_BRANDING,
                ...initialBranding,
                checkout_redirect: { ...DEFAULT_BRANDING.checkout_redirect, ...(initialBranding.checkout_redirect || {}) },
            };
            setBranding(merged);
            setPreviewUrl(merged.checkout_redirect.logo_url || '');
            setBrandingChanges(false);
        }
    }, [initialBranding]);

    const updateCheckoutRedirect = useCallback((updates: Partial<BrandingCheckoutRedirect>) => {
        setBranding(prev => ({
            ...prev,
            checkout_redirect: { ...prev.checkout_redirect, ...updates },
        }));
        setBrandingChanges(true);
    }, []);

    const handleFileSelect = useCallback((file: File) => {
        setSelectedFile(file);
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        updateCheckoutRedirect({ display_mode: 'custom_logo', enabled: true });
    }, [updateCheckoutRedirect]);

    const handleDropZoneDrop = useCallback((_dropFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
        if (acceptedFiles.length > 0) handleFileSelect(acceptedFiles[0]);
    }, [handleFileSelect]);

    const handleRemoveLogo = useCallback(() => {
        setSelectedFile(null);
        setPreviewUrl('');
        updateCheckoutRedirect({ logo_url: '', display_mode: 'lock_icon', enabled: false });
    }, [updateCheckoutRedirect]);

    const saveBranding = useCallback(() => {
        const fd = new FormData();
        fd.set('intent', 'save_branding');
        fd.set('branding', JSON.stringify(branding));
        if (selectedFile) fd.set('logo_file', selectedFile);
        submit(fd, { method: 'post', encType: 'multipart/form-data' });
    }, [branding, selectedFile, submit]);

    const discardBranding = useCallback(() => {
        const merged: Branding = {
            ...DEFAULT_BRANDING,
            ...(initialBranding || {}),
            checkout_redirect: { ...DEFAULT_BRANDING.checkout_redirect, ...((initialBranding as Branding)?.checkout_redirect || {}) },
        };
        setBranding(merged);
        setSelectedFile(null);
        setPreviewUrl(merged.checkout_redirect.logo_url || '');
        setBrandingChanges(false);
    }, [initialBranding]);

    const resetBrandingToDefault = useCallback(() => {
        setBranding(DEFAULT_BRANDING);
        setSelectedFile(null);
        setPreviewUrl('');
        setBrandingChanges(true);
    }, []);

    // Update URL if logo was saved successfully
    useEffect(() => {
        if (actionData?.success && actionData?.branding) {
            const savedBranding = actionData.branding as Branding;
            setBranding(savedBranding);
            setPreviewUrl(savedBranding.checkout_redirect.logo_url || '');
            setSelectedFile(null);
            setBrandingChanges(false);
        }
    }, [actionData]);

    // ═══════════ SAVE BAR ═══════════
    const hasChanges = (activeTab === 'pixels' && pixelChanges) || (activeTab === 'fraud' && fraudChanges) || (activeTab === 'branding' && brandingChanges);
    useEffect(() => {
        if (hasChanges) shopify.saveBar.show('app-settings-save-bar')?.catch(() => {});
        else shopify.saveBar.hide('app-settings-save-bar')?.catch(() => {});
    }, [hasChanges]);

    const handleSave = () => {
        if (activeTab === 'pixels') savePixels();
        else if (activeTab === 'fraud') saveFraud();
        else if (activeTab === 'branding') saveBranding();
    };
    const handleDiscard = () => {
        if (activeTab === 'pixels') discardPixels();
        else if (activeTab === 'fraud') discardFraud();
        else if (activeTab === 'branding') discardBranding();
        shopify.saveBar.hide('app-settings-save-bar')?.catch(() => {});
    };

    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, { isError: !actionData.success });
            if (actionData.success) { setPixelChanges(false); setFraudChanges(false); setBrandingChanges(false); shopify.saveBar.hide('app-settings-save-bar')?.catch(() => {}); }
        }
    }, [actionData]);

    const getProviderMeta = (key: PixelProvider) => PIXEL_PROVIDERS.find(p => p.key === key) || PIXEL_PROVIDERS[0];

    // ── Branding Redirect Preview ──
    const cr = branding.checkout_redirect;
    const showCustomLogo = cr.display_mode === 'custom_logo' && (previewUrl || cr.logo_url);
    const logoUrl = previewUrl || cr.logo_url;
    const logoSize = cr.logo_size || 72;

    const logoShapeBorderRadius = cr.logo_shape === 'circle' ? '50%' : cr.logo_shape === 'rounded' ? '14px' : '0px';
    const logoBg = cr.show_background
        ? 'background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.12); border-radius: 14px; padding: 10px;'
        : '';

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: styles }} />
            <ui-save-bar id="app-settings-save-bar">
                <button variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
                <button onClick={handleDiscard} disabled={isSaving}>Discard</button>
            </ui-save-bar>

            <div className="as-page">
                <div className="as-body">
                    <div className="page-header">
                        <div className="page-header-left">
                            <Link to="/app" className="back-btn">←</Link>
                            <div className="page-title">
                                <h1>Settings</h1>
                                <p>Pixels, Fraud Protection & Branding</p>
                            </div>
                        </div>
                    </div>
                    {/* Custom Tabs */}
                    <div className="tabs">
                        {TABS.map((tab, idx) => (
                            <button
                                key={tab.id}
                                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => handleTabChange(idx)}
                            >
                                {tab.content}
                            </button>
                        ))}
                    </div>

                    <div className="tab-content">
                        <div>
                            {/* ── PIXELS TAB ── */}
                            {activeTab === 'pixels' && (
                                <div className="as-section">
                                    <div className="as-section-top">
                                        <div>
                                            <Text variant="headingMd" as="h2">Tracking Pixels</Text>
                                            <Text variant="bodySm" tone="subdued" as="p">Add pixels to track form opens, purchases, and more</Text>
                                        </div>
                                        <Button variant="primary" onClick={addNewPixel}>+ Add new Pixel</Button>
                                    </div>

                                    {pixels.length === 0 ? (
                                        <div className="as-empty">
                                            <h3>No Pixels Configured</h3>
                                            <p>Add tracking pixels to track form opens, purchases, and more.</p>
                                            <Button variant="primary" onClick={addNewPixel}>+ Add new Pixel</Button>
                                        </div>
                                    ) : (
                                        <BlockStack gap="400">
                                            {pixels.map((px) => {
                                                const meta = getProviderMeta(px.provider);
                                                const isExpanded = expandedId === px.id;
                                                return (
                                                    <div key={px.id} className="as-card">
                                                        <div className="as-card-click" onClick={() => setExpandedId(isExpanded ? null : px.id!)}>
                                                            <InlineStack gap="300" blockAlign="center">
                                                                <span style={{ fontSize: 20 }}>{meta.icon}</span>
                                                                <Text variant="bodyMd" fontWeight="semibold" as="span">{meta.label}</Text>
                                                                {px.pixel_id && <Text variant="bodySm" tone="subdued" as="span">({px.pixel_id})</Text>}
                                                            </InlineStack>
                                                            <InlineStack gap="200" blockAlign="center">
                                                                <Badge tone={px.enabled ? 'success' : 'critical'}>{px.enabled ? 'Active' : 'Disabled'}</Badge>
                                                                <div onClick={(e) => e.stopPropagation()}><Button icon={DeleteIcon} variant="plain" tone="critical" accessibilityLabel="Delete pixel" onClick={() => removePixel(px.id!)} /></div>
                                                            </InlineStack>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="as-card-body">
                                                                <Divider />
                                                                <div style={{ paddingTop: 16 }}>
                                                                    <BlockStack gap="400">
                                                                        <InlineStack gap="400" wrap={false}>
                                                                            <div style={{ flex: 1 }}>
                                                                                <Select label="Pixel type" value={px.provider}
                                                                                    options={PIXEL_PROVIDERS.map(p => ({ label: `${p.icon} ${p.label}`, value: p.key }))}
                                                                                    onChange={(val) => updatePixel(px.id!, { provider: val as PixelProvider })} />
                                                                            </div>
                                                                            <div style={{ flex: 1 }}>
                                                                                <TextField label={meta.idLabel} value={px.pixel_id || ''} placeholder={meta.idLabel}
                                                                                    onChange={(val) => updatePixel(px.id!, { pixel_id: val })} autoComplete="off" />
                                                                            </div>
                                                                        </InlineStack>
                                                                        {meta.hasConversionApi && (
                                                                            <TextField label="Conversion API Token" value={px.conversion_api_token || ''} placeholder="Enter your Conversion API token"
                                                                                onChange={(val) => updatePixel(px.id!, { conversion_api_token: val })} autoComplete="off" />
                                                                        )}
                                                                        <TextField label="Pixel label (optional)" value={px.label || ''} placeholder="e.g. Main Facebook Pixel"
                                                                            onChange={(val) => updatePixel(px.id!, { label: val })} autoComplete="off" />
                                                                        <Divider />
                                                                        <Text variant="headingSm" as="h3">Tracked Events</Text>
                                                                        <Checkbox label="Track InitiateCheckout / form opened" checked={px.track_initiate_checkout} onChange={(val) => updatePixel(px.id!, { track_initiate_checkout: val })} />
                                                                        <Checkbox label="Track Purchase / order submitted" checked={px.track_purchase} onChange={(val) => updatePixel(px.id!, { track_purchase: val })} />
                                                                        <Checkbox label="Track AddToCart" checked={px.track_add_to_cart} onChange={(val) => updatePixel(px.id!, { track_add_to_cart: val })} />
                                                                        <Checkbox label="Track AddPaymentInfo" checked={px.track_add_payment_info} onChange={(val) => updatePixel(px.id!, { track_add_payment_info: val })} />
                                                                        <Checkbox label="Track ViewContent" checked={px.track_view_content} onChange={(val) => updatePixel(px.id!, { track_view_content: val })} />
                                                                        <Divider />
                                                                        <Checkbox label="Enable this pixel" checked={px.enabled} onChange={(val) => updatePixel(px.id!, { enabled: val })} />
                                                                    </BlockStack>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </BlockStack>
                                    )}

                                    {/* Events reference */}
                                    <div className="as-card" style={{ marginTop: 16 }}>
                                        <div style={{ padding: '16px 20px' }}>
                                            <Text variant="headingSm" as="h3">Tracked Events Reference</Text>
                                        </div>
                                        <div className="as-events-table">
                                            <table>
                                                <thead><tr><th>Pixel</th><th>Events Tracked</th></tr></thead>
                                                <tbody>
                                                    {PIXEL_PROVIDERS.map(p => (
                                                        <tr key={p.key}><td><strong>{p.icon} {p.label}</strong></td><td>• {p.events.join(', ')}</td></tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── FRAUD PROTECTION TAB ── */}
                            {activeTab === 'fraud' && (
                                <div className="as-section">
                                    <BlockStack gap="500">
                                        {/* Order Limits */}
                                        <div className="as-card">
                                            <div className="as-card-hdr"><div className="as-icon as-icon-orders"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 17V5h2v12H3zm4 0V8h2v9H7zm4 0V3h2v14h-2zm4 0V10h2v7h-2z" fill="#7c3aed" /></svg></div><div><Text variant="headingMd" as="h2">Order Limits</Text><Text variant="bodySm" tone="subdued" as="p">Limit orders per customer within a time window</Text></div></div>
                                            <div className="as-card-inner">
                                                <Checkbox label={<Text variant="bodyMd" fontWeight="semibold" as="span">Only allow X orders per IP address, phone or email within X hours</Text>} checked={fraud.limit_orders_enabled} onChange={(val) => updateFraud({ limit_orders_enabled: val })} />
                                                {fraud.limit_orders_enabled && (
                                                    <div className="as-row">
                                                        <div className="as-col"><TextField label="Maximum orders" type="number" value={String(fraud.max_orders || '')} placeholder="e.g. 3" onChange={(val) => updateFraud({ max_orders: val ? parseInt(val) : undefined })} autoComplete="off" helpText="Max orders per customer" /></div>
                                                        <div className="as-col"><TextField label="Time window (hours)" type="number" value={String(fraud.limit_hours || '')} placeholder="e.g. 24" onChange={(val) => updateFraud({ limit_hours: val ? parseInt(val) : undefined })} autoComplete="off" helpText="Reset after this many hours" /></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quantity Limit */}
                                        <div className="as-card">
                                            <div className="as-card-hdr"><div className="as-icon as-icon-qty"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="12" rx="2" stroke="#d97706" strokeWidth="1.5" fill="none" /><path d="M3 9h14M8 5V3m4 2V3" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" /></svg></div><div><Text variant="headingMd" as="h2">Quantity Limit</Text><Text variant="bodySm" tone="subdued" as="p">Prevent large quantity orders</Text></div></div>
                                            <div className="as-card-inner">
                                                <Checkbox label={<Text variant="bodyMd" fontWeight="semibold" as="span">Block orders if quantity is more than X</Text>} checked={fraud.limit_quantity_enabled} onChange={(val) => updateFraud({ limit_quantity_enabled: val })} />
                                                {fraud.limit_quantity_enabled && (
                                                    <div className="as-row"><div className="as-col"><TextField label="Maximum quantity" type="number" value={String(fraud.max_quantity || '')} placeholder="e.g. 10" onChange={(val) => updateFraud({ max_quantity: val ? parseInt(val) : undefined })} autoComplete="off" /></div></div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Block Lists */}
                                        <div className="as-card">
                                            <div className="as-card-hdr"><div className="as-icon as-icon-block"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="#dc2626" strokeWidth="1.5" /><line x1="5.5" y1="5.5" x2="14.5" y2="14.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" /></svg></div><div><Text variant="headingMd" as="h2">Block Lists</Text><Text variant="bodySm" tone="subdued" as="p">Block specific phone numbers, emails or IPs</Text></div></div>
                                            <div className="as-card-inner">
                                                <Banner tone="info">Enter one item per line. Press Enter to add a new line.</Banner>
                                                <div className="as-row">
                                                    <div className="as-col"><TextField label="Phone numbers to block" value={phoneText} onChange={(v) => { setPhoneText(v); setFraudChanges(true); }} multiline={4} placeholder={"+916238833221\n+576949130303"} helpText="Include country code" autoComplete="off" /></div>
                                                    <div className="as-col"><TextField label="Emails to block" value={emailText} onChange={(v) => { setEmailText(v); setFraudChanges(true); }} multiline={4} placeholder={"spam@example.com\nscammer.com"} helpText="Use domain to block all from it" autoComplete="off" /></div>
                                                </div>
                                                <div className="as-row">
                                                    <div className="as-col"><TextField label="Blocked IP Addresses" value={blockedIpText} onChange={(v) => { setBlockedIpText(v); setFraudChanges(true); }} multiline={4} placeholder={"219.109.22.2\n12.109.22.3"} helpText="These IPs will be blocked" autoComplete="off" /></div>
                                                    <div className="as-col"><TextField label="Allowed IP Addresses (override)" value={allowedIpText} onChange={(v) => { setAllowedIpText(v); setFraudChanges(true); }} multiline={4} placeholder={"219.109.22.2"} helpText="Always allow these IPs" autoComplete="off" /></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Postal Code */}
                                        <div className="as-card">
                                            <div className="as-card-hdr"><div className="as-icon as-icon-postal"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2C7.24 2 5 4.24 5 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z" stroke="#2563eb" strokeWidth="1.5" fill="none" /><circle cx="10" cy="7" r="2" stroke="#2563eb" strokeWidth="1.5" /></svg></div><div><Text variant="headingMd" as="h2">Postal Code Restrictions</Text><Text variant="bodySm" tone="subdued" as="p">Restrict COD by postal/zip code</Text></div></div>
                                            <div className="as-card-inner">
                                                <Checkbox label={<Text variant="bodyMd" fontWeight="semibold" as="span">Limit COD availability by postal code</Text>} checked={fraud.postal_code_mode !== 'none'} onChange={(c) => updateFraud({ postal_code_mode: c ? 'block_only' : 'none' })} />
                                                {fraud.postal_code_mode !== 'none' && (
                                                    <BlockStack gap="300">
                                                        <div className="as-radio-group">
                                                            <RadioButton label="Exclude these postal codes (block list)" checked={fraud.postal_code_mode === 'block_only'} id="p-block" name="pmode" onChange={() => updateFraud({ postal_code_mode: 'block_only' })} />
                                                            <RadioButton label="Only allow these postal codes (allow list)" checked={fraud.postal_code_mode === 'allow_only'} id="p-allow" name="pmode" onChange={() => updateFraud({ postal_code_mode: 'allow_only' })} />
                                                        </div>
                                                        <TextField label="Postal codes (one per line)" value={postalText} onChange={(v) => { setPostalText(v); setFraudChanges(true); }} multiline={4} placeholder={"110001\n400001"} autoComplete="off" />
                                                    </BlockStack>
                                                )}
                                            </div>
                                        </div>

                                        {/* Block Message */}
                                        <div className="as-card">
                                            <div className="as-card-hdr"><div className="as-icon as-icon-msg"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 5a2 2 0 012-2h8a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3V5z" stroke="#059669" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div><div><Text variant="headingMd" as="h2">Block Message</Text><Text variant="bodySm" tone="subdued" as="p">Custom message for blocked customers</Text></div></div>
                                            <div className="as-card-inner">
                                                <TextField label="Message to display" value={fraud.blocked_message} onChange={(val) => updateFraud({ blocked_message: val })} multiline={2} placeholder="Sorry, you are not allowed to place orders." autoComplete="off" />
                                            </div>
                                        </div>

                                        <Banner tone="warning">
                                            <Text variant="bodySm" as="p"><strong>Note:</strong> Phone, email, postal code, and quantity rules are enforced on both storefront and server. IP and order frequency rules are server-side only.</Text>
                                        </Banner>
                                    </BlockStack>
                                </div>
                            )}

                            {/* ── BRANDING TAB ── */}
                            {activeTab === 'branding' && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '32px', alignItems: 'start' }}>
                                    <div>
                                        <BlockStack gap="400">
                                            {/* Section Header */}
                                            <BlockStack gap="200">
                                                <Text variant="headingLg" as="h2">Checkout Redirect Branding</Text>
                                                <Text variant="bodySm" tone="subdued" as="p">Customize the loading screen shown before customers are redirected to Shopify Checkout</Text>
                                            </BlockStack>

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

                                                    {/* Logo Shape */}
                                                    <Card>
                                                        <BlockStack gap="400">
                                                            <Text variant="headingMd" as="h2">Logo Shape</Text>
                                                            <Text variant="bodySm" tone="subdued" as="p">Visual clipping for the logo container</Text>
                                                            <ChoiceList
                                                                title="Logo Shape"
                                                                titleHidden
                                                                choices={[
                                                                    { label: 'Original', value: 'original' },
                                                                    { label: 'Rounded', value: 'rounded' },
                                                                    { label: 'Circle', value: 'circle' }
                                                                ]}
                                                                selected={[cr.logo_shape]}
                                                                onChange={(selected) => updateCheckoutRedirect({ logo_shape: selected[0] as 'original' | 'rounded' | 'circle' })}
                                                            />
                                                        </BlockStack>
                                                    </Card>

                                                    {/* Logo Background */}
                                                    <Card>
                                                        <InlineStack align="space-between" blockAlign="center">
                                                            <BlockStack gap="200">
                                                                <Text variant="headingMd" as="h2">Logo Background</Text>
                                                                <Text variant="bodySm" tone="subdued" as="p">Add white background with shadow for transparent logos</Text>
                                                            </BlockStack>
                                                            <Checkbox
                                                                label="Enable Background"
                                                                labelHidden
                                                                checked={cr.show_background}
                                                                onChange={(v) => updateCheckoutRedirect({ show_background: v })}
                                                            />
                                                        </InlineStack>
                                                    </Card>

                                                    {/* Logo Animation */}
                                                    <Card>
                                                        <InlineStack align="space-between" blockAlign="center">
                                                            <BlockStack gap="200">
                                                                <Text variant="headingMd" as="h2">Logo Animation</Text>
                                                                <Text variant="bodySm" tone="subdued" as="p">Make the logo smoothly animate up and down</Text>
                                                            </BlockStack>
                                                            <Checkbox
                                                                label="Enable Animation"
                                                                labelHidden
                                                                checked={cr.animate_logo}
                                                                onChange={(v) => updateCheckoutRedirect({ animate_logo: v })}
                                                            />
                                                        </InlineStack>
                                                    </Card>
                                                </>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px' }}>
                                                <Button tone="critical" onClick={resetBrandingToDefault}>Reset to default</Button>
                                            </div>
                                        </BlockStack>
                                    </div>

                                    {/* RIGHT COLUMN — Live Preview */}
                                    <div>
                                        <div style={{ position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <BlockStack gap="200">
                                                <Text variant="headingSm" as="h3">Live Preview</Text>
                                                <Text variant="bodySm" tone="subdued" as="p">Updates instantly as you change settings</Text>
                                            </BlockStack>

                                            <div className="preview-phone">
                                                <div className="preview-phone-screen preview-compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', background: 'white', minHeight: '380px' }}>
                                                    <div className="brd-preview-bg" style={{ width: '100%' }}>
                                                        {/* Center icon */}
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {showCustomLogo ? (() => {
                                                                const shapeRadius = cr.logo_shape === 'circle' ? '50%' : cr.logo_shape === 'rounded' ? '24px' : '0px';
                                                                const zoomScale = cr.logo_zoom ? cr.logo_zoom / 100 : 1;
                                                                const imgSize = Math.round(logoSize * zoomScale);
                                                                const bgPadding = cr.show_background ? 16 : 0;
                                                                const containerSize = imgSize + (bgPadding * 2);
                                                                const bgStyle = cr.show_background ? { background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)' } : { background: 'transparent' };
                                                                const animStyle = cr.animate_logo ? { animation: 'foxcodLogoFloat 2s ease-in-out infinite' } : {};

                                                                return (
                                                                    <div style={{ padding: `${bgPadding}px`, borderRadius: shapeRadius, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', width: `${containerSize}px`, height: `${containerSize}px`, boxSizing: 'border-box', margin: '0 auto', ...bgStyle, ...animStyle }}>
                                                                        <img
                                                                            src={logoUrl}
                                                                            alt="Logo preview"
                                                                            style={{ display: 'block', width: '100%', height: '100%', objectFit: cr.logo_shape === 'circle' ? 'cover' : 'contain', borderRadius: shapeRadius }}
                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                        />
                                                                    </div>
                                                                );
                                                            })() : (
                                                                <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)', padding: '24px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', boxSizing: 'border-box', margin: '0 auto' }}>
                                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Text */}
                                                        <div style={{ textAlign: 'center', marginTop: '12px' }}>
                                                            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Redirecting to secure checkout</div>
                                                            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>Please wait while we prepare your Shopify checkout…</div>
                                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '24px' }}>
                                                                <div className="foxcod-dot-preview"></div>
                                                                <div className="foxcod-dot-preview" style={{ animationDelay: '-0.16s' }}></div>
                                                                <div className="foxcod-dot-preview" style={{ animationDelay: '0s' }}></div>
                                                            </div>
                                                        </div>
                                                        {/* Bottom Badges Container (Side by side) */}
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '12px' }}>
                                                            {/* 100% Secured Badge */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '6px 14px' }}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 11 2 2 4-4"/></svg>
                                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#166534', whiteSpace: 'nowrap' }}>100% Secured</span>
                                                            </div>

                                                            {/* Powered by Foxly COD */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#eff6ff', padding: '4px 14px 4px 6px', borderRadius: 999, border: '1px solid #bfdbfe', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, background: '#ffffff', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                                                                    <img src="/foxly-logo.jpeg" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>
                                                                    <span style={{ fontSize: 8, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Powered by</span>
                                                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8', letterSpacing: '-0.3px' }}>Foxly COD</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Preview legend */}
                                            <div className="brd-preview-legend" style={{ display: 'flex', justifyContent: 'center', marginTop: '8px', gap: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span className={`brd-legend-dot ${cr.display_mode === 'lock_icon' ? 'active' : ''}`} />
                                                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Default lock icon</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span className={`brd-legend-dot ${cr.display_mode === 'custom_logo' ? 'active' : ''}`} />
                                                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Custom logo</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

// ── STYLES ──
const styles = `
    .preview-phone { background: #1f2937; border-radius: 32px; padding: 6px; max-width: 350px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
    .preview-phone-screen { background: white; border-radius: 24px; overflow-y: auto; height: 550px; }
    .preview-phone-screen.preview-compact { min-height: auto; max-height: none; padding: 20px 16px; }

    @keyframes brd-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes foxcodBouncingDotsPreview { 0%, 80%, 100% { transform: scale(0); opacity: 0.3; } 40% { transform: scale(1); opacity: 1; } }
    @keyframes foxcodLogoFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    .foxcod-dot-preview { width: 8px; height: 8px; background-color: #2563eb; border-radius: 50%; animation: foxcodBouncingDotsPreview 1.4s infinite ease-in-out both; }
    .foxcod-dot-preview:nth-child(1) { animation-delay: -0.32s; }

    .as-page { display: flex; flex-direction: column; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f6f6f7; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    @media (max-width: 640px) { .page-header { padding: 0; } }
    .page-header-left { display: flex; align-items: center; gap: 16px; }
    .back-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: 1px solid #e5e7eb; border-radius: 10px; background: white; text-decoration: none; color: #374151; transition: all 0.2s ease; }
    .back-btn:hover { background: #f9fafb; }
    .page-title { display: flex; flex-direction: column; }
    .page-title h1 { font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 4px 0; }
    .page-title p { font-size: 14px; color: #6b7280; margin: 0; }

    /* Body */
    .as-body { padding: 24px 0; flex: 1; max-width: 900px; margin: 0 auto; width: 100%; }

    /* Section */
    .as-section-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }

    /* Cards */
    .as-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; transition: box-shadow 0.2s; }
    .as-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .as-card-click { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 16px 20px; }
    .as-card-body { padding: 0 20px 20px; }
    .as-del { background: none; border: none; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
    .as-del:hover { background: #fee2e2; }

    /* Fraud card headers */
    .as-card-hdr { display: flex; align-items: center; gap: 14px; padding: 18px 22px; background: #fafbfc; border-bottom: 1px solid #f0f0f0; flex-wrap: wrap; }
    .as-icon { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
    .as-icon-orders { background: linear-gradient(135deg, #ede9fe, #ddd6fe); }
    .as-icon-qty { background: linear-gradient(135deg, #fef3c7, #fde68a); }
    .as-icon-block { background: linear-gradient(135deg, #fee2e2, #fecaca); }
    .as-icon-postal { background: linear-gradient(135deg, #dbeafe, #bfdbfe); }
    .as-icon-msg { background: linear-gradient(135deg, #d1fae5, #a7f3d0); }
    .as-card-inner { padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }

    /* Grid */
    .as-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .as-col { min-width: 0; }
    .as-radio-group { display: flex; flex-direction: column; gap: 6px; }

    /* Empty */
    .as-empty { text-align: center; padding: 60px 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; }
    .as-empty h3 { font-size: 18px; margin: 0 0 8px; }
    .as-empty p { color: #6b7280; margin: 0 0 16px; }

    /* Events table */
    .as-events-table table { width: 100%; border-collapse: collapse; }
    .as-events-table th { background: #1f2937; color: #fff; padding: 10px 16px; text-align: left; font-size: 13px; font-weight: 600; }
    .as-events-table th:first-child { border-radius: 0; }
    .as-events-table td { padding: 10px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    .as-events-table tr:last-child td { border-bottom: none; }
    .as-events-table tr:hover td { background: #f9fafb; }

    /* Tabs */
    .tabs { display: flex; gap: 4px; margin-bottom: 24px; background: #ffffff; padding: 6px; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); }
    .tab { flex: 1; padding: 10px 16px; border: none; background: transparent; border-radius: 6px; font-size: 13px; font-weight: 500; color: #4b5563; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease; }
    .tab:hover { background: #f9fafb; color: #111827; }
    .tab.active { background: #f3f4f6; color: #111827; box-shadow: none; font-weight: 600; }

    /* ── BRANDING STYLES ── */

    /* Hero section */
    .brd-hero { display: flex; align-items: center; gap: 16px; padding: 20px 24px; background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%); border: 1px solid #e0e7ff; border-radius: 14px; }
    .brd-hero-icon { width: 52px; height: 52px; background: white; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(99,102,241,0.15); flex-shrink: 0; }

    /* Two-column layout */
    .brd-grid { display: grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start; }
    @media (max-width: 860px) { .brd-grid { grid-template-columns: 1fr; } }

    /* Controls column */
    .brd-controls { display: flex; flex-direction: column; gap: 16px; }

    /* Dropzone */
    .brd-dropzone { border: 2px dashed #d1d5db; border-radius: 12px; padding: 36px 20px; text-align: center; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .brd-dropzone:hover, .brd-dropzone.drag-over { border-color: #6366f1; background: #eef2ff; }
    .brd-drop-title { font-size: 14px; font-weight: 600; color: #374151; margin: 0; }
    .brd-drop-sub { font-size: 12px; color: #9ca3af; margin: 0; }

    /* Logo preview */
    .brd-logo-preview { display: flex; align-items: center; gap: 20px; padding: 12px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb; }
    .brd-logo-thumb { width: 80px; height: 80px; object-fit: contain; border-radius: 10px; border: 1px solid #e5e7eb; background: white; padding: 6px; }
    .brd-logo-actions { display: flex; flex-direction: column; gap: 8px; }
    .brd-btn-replace { padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    .brd-btn-replace:hover { background: #4f46e5; }
    .brd-btn-remove { padding: 8px 16px; background: white; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .brd-btn-remove:hover { background: #fee2e2; }

    /* Display Mode */
    .brd-mode-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .brd-mode-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 12px; border: 2px solid #e5e7eb; border-radius: 12px; cursor: pointer; transition: all 0.2s; text-align: center; font-size: 13px; font-weight: 500; color: #374151; }
    .brd-mode-card input { display: none; }
    .brd-mode-card.selected { border-color: #6366f1; background: #eef2ff; color: #4f46e5; }
    .brd-mode-icon { width: 42px; height: 42px; background: #f3f4f6; border-radius: 10px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
    .brd-mode-card.selected .brd-mode-icon { background: #e0e7ff; }

    /* Logo Slider */
    .brd-slider-row { display: flex; align-items: center; gap: 12px; }
    .brd-slider { flex: 1; accent-color: #6366f1; height: 6px; }
    .brd-slider-label { font-size: 12px; color: #6b7280; font-weight: 500; min-width: 36px; }

    /* Logo Shape */
    .brd-shape-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .brd-shape-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; border: 2px solid #e5e7eb; border-radius: 12px; cursor: pointer; transition: all 0.2s; font-size: 12px; font-weight: 500; color: #374151; }
    .brd-shape-card input { display: none; }
    .brd-shape-card.selected { border-color: #6366f1; background: #eef2ff; color: #4f46e5; }
    .brd-shape-thumb { width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #8b5cf6); }

    /* Logo Background Toggle */
    .brd-toggle { width: 44px; height: 24px; background: #d1d5db; border-radius: 99px; position: relative; cursor: pointer; transition: background 0.25s; margin-left: auto; flex-shrink: 0; }
    .brd-toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; background: white; border-radius: 50%; transition: transform 0.25s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .brd-toggle.on { background: #6366f1; }
    .brd-toggle.on::after { transform: translateX(20px); }

    /* Live Preview */
    .brd-preview-col { position: relative; }
    .brd-preview-sticky { position: sticky; top: 24px; display: flex; flex-direction: column; gap: 12px; }
    .brd-preview-frame { border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .brd-preview-bg { background: rgba(255,255,255,0.96); backdrop-filter: blur(8px); padding: 32px 24px; display: flex; flex-direction: column; align-items: center; gap: 18px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .brd-preview-legend { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; }
    .brd-legend-dot { width: 8px; height: 8px; border-radius: 50%; background: #d1d5db; display: inline-block; flex-shrink: 0; }
    .brd-legend-dot.active { background: #6366f1; }

    /* Responsive */
    @media (max-width: 640px) {
        .as-row { grid-template-columns: 1fr; }
        .as-body { padding: 16px; }
        .tabs { flex-wrap: wrap; }
        .brd-mode-options { grid-template-columns: 1fr; }
        .brd-shape-options { grid-template-columns: repeat(3, 1fr); }
    }
`;
