/**
 * App Settings Page — Tabbed: Pixels | Fraud Protection
 * Route: /app/app-settings
 */
import { useState, useEffect, useCallback } from 'react';
import { useLoaderData, useSubmit, useActionData, useNavigation, Link, useSearchParams } from 'react-router';
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { useAppBridge } from '@shopify/app-bridge-react';
import {
    Text, InlineStack, BlockStack,
    TextField, Checkbox, Badge, Banner, Select, Divider, LegacyCard,
    Button, RadioButton, Tabs, Page,
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

// ── LOADER ──
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const [pixels, fraudSettings] = await Promise.all([
        getPixelSettings(shopDomain),
        getFraudProtectionSettings(shopDomain),
    ]);
    return { pixels, fraudSettings, shopDomain };
};

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
];

type TabId = 'pixels' | 'fraud';

// ── COMPONENT ──
export default function AppSettingsPage() {
    const { pixels: initialPixels, fraudSettings: initialFraud, shopDomain } = useLoaderData<any>();
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

    // ═══════════ SAVE BAR ═══════════
    const hasChanges = (activeTab === 'pixels' && pixelChanges) || (activeTab === 'fraud' && fraudChanges);
    useEffect(() => {
        if (hasChanges) shopify.saveBar.show('app-settings-save-bar');
        else shopify.saveBar.hide('app-settings-save-bar');
    }, [hasChanges]);

    const handleSave = () => { if (activeTab === 'pixels') savePixels(); else saveFraud(); };
    const handleDiscard = () => { if (activeTab === 'pixels') discardPixels(); else discardFraud(); shopify.saveBar.hide('app-settings-save-bar'); };

    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, { isError: !actionData.success });
            if (actionData.success) { setPixelChanges(false); setFraudChanges(false); shopify.saveBar.hide('app-settings-save-bar'); }
        }
    }, [actionData]);

    const getProviderMeta = (key: PixelProvider) => PIXEL_PROVIDERS.find(p => p.key === key) || PIXEL_PROVIDERS[0];

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
                                <p>Manage your Tracking Pixels and Fraud Protection</p>
                            </div>
                        </div>
                    </div>
                    {/* Polaris Tabs */}
                    <Tabs
                        tabs={TABS}
                        selected={TABS.findIndex(t => t.id === activeTab)}
                        onSelect={handleTabChange}
                        fitted
                    >
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
                        </div>
                    </Tabs>
                </div>
            </div>
        </>
    );
}

// ── STYLES ──
const styles = `
    .as-page { display: flex; flex-direction: column; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f6f6f7; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding: 0 24px; }
    @media (max-width: 640px) { .page-header { padding: 0; } }
    .page-header-left { display: flex; align-items: center; gap: 16px; }
    .back-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: 1px solid #e5e7eb; border-radius: 10px; background: white; text-decoration: none; color: #374151; transition: all 0.2s ease; }
    .back-btn:hover { background: #f9fafb; }
    .page-title { display: flex; flex-direction: column; }
    .page-title h1 { font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 4px 0; }
    .page-title p { font-size: 14px; color: #6b7280; margin: 0; }

    /* Body */
    .as-body { padding: 24px 0; flex: 1; max-width: 820px; margin: 0 auto; width: 100%; }

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
    .as-card-hdr { display: flex; align-items: center; gap: 14px; padding: 18px 22px; background: #fafbfc; border-bottom: 1px solid #f0f0f0; }
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

    /* Responsive */
    @media (max-width: 640px) {
        .as-row { grid-template-columns: 1fr; }
        .as-body { padding: 16px; }
    }
`;
