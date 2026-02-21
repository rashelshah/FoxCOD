/**
 * Fraud Protection Admin Page
 * Allows sellers to configure fraud protection rules for the COD form
 */
import { useState, useEffect, useCallback } from 'react';
import { useLoaderData, useSubmit, useActionData, useNavigation, Link } from 'react-router';
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { useAppBridge } from '@shopify/app-bridge-react';
import {
    Page, Card, Text, InlineStack, BlockStack,
    TextField, Checkbox, Banner, Divider, Box,
    RadioButton, Badge,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import {
    getFraudProtectionSettings,
    saveFraudProtectionSettings,
    syncFraudSettingsToMetafield,
} from '../services/fraud-protection.server';
import type { FraudProtectionSettings } from '../config/fraud-protection.types';
import { DEFAULT_FRAUD_SETTINGS } from '../config/fraud-protection.types';

// =============================================
// LOADER
// =============================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const settings = await getFraudProtectionSettings(shopDomain);
    return { settings, shopDomain };
};

// =============================================
// ACTION
// =============================================
export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const formData = await request.formData();
    const intent = formData.get('intent') as string;

    try {
        if (intent === 'save') {
            const settingsJson = formData.get('settings') as string;
            const settings: FraudProtectionSettings = JSON.parse(settingsJson);
            settings.shop_domain = shopDomain;

            await saveFraudProtectionSettings(settings);
            await syncFraudSettingsToMetafield(admin, shopDomain);

            return { success: true, message: 'Fraud protection settings saved!' };
        }

        return { success: false, message: 'Unknown action' };
    } catch (error: any) {
        console.error('[FraudProtection] Action error:', error);
        return { success: false, message: error.message || 'Something went wrong' };
    }
};

// =============================================
// COMPONENT
// =============================================
export default function FraudProtectionPage() {
    const { settings: initialSettings, shopDomain } = useLoaderData<any>();
    const actionData = useActionData<any>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const isSaving = navigation.state === 'submitting';

    const [settings, setSettings] = useState<FraudProtectionSettings>(
        initialSettings || { ...DEFAULT_FRAUD_SETTINGS, shop_domain: shopDomain }
    );
    const [hasChanges, setHasChanges] = useState(false);

    // Raw textarea text state — kept separately to allow newlines without stripping
    const [phoneText, setPhoneText] = useState((initialSettings?.blocked_phone_numbers || []).join('\n'));
    const [emailText, setEmailText] = useState((initialSettings?.blocked_emails || []).join('\n'));
    const [blockedIpText, setBlockedIpText] = useState((initialSettings?.blocked_ip_addresses || []).join('\n'));
    const [allowedIpText, setAllowedIpText] = useState((initialSettings?.allowed_ip_addresses || []).join('\n'));
    const [postalText, setPostalText] = useState((initialSettings?.postal_codes || []).join('\n'));

    // Sync from loader when data refreshes
    useEffect(() => {
        if (initialSettings) {
            setSettings(initialSettings);
            setPhoneText((initialSettings.blocked_phone_numbers || []).join('\n'));
            setEmailText((initialSettings.blocked_emails || []).join('\n'));
            setBlockedIpText((initialSettings.blocked_ip_addresses || []).join('\n'));
            setAllowedIpText((initialSettings.allowed_ip_addresses || []).join('\n'));
            setPostalText((initialSettings.postal_codes || []).join('\n'));
            setHasChanges(false);
        }
    }, [initialSettings]);

    // Toast on action result
    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, { isError: !actionData.success });
            if (actionData.success) {
                setHasChanges(false);
                shopify.saveBar.hide('fraud-protection-save-bar');
            }
        }
    }, [actionData]);

    // Save bar
    useEffect(() => {
        if (hasChanges) {
            shopify.saveBar.show('fraud-protection-save-bar');
        } else {
            shopify.saveBar.hide('fraud-protection-save-bar');
        }
    }, [hasChanges]);

    const update = useCallback((updates: Partial<FraudProtectionSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }));
        setHasChanges(true);
    }, []);

    // Convert raw text to array (only at save time)
    const textToArray = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);

    const handleSave = useCallback(() => {
        const settingsToSave = {
            ...settings,
            blocked_phone_numbers: textToArray(phoneText),
            blocked_emails: textToArray(emailText),
            blocked_ip_addresses: textToArray(blockedIpText),
            allowed_ip_addresses: textToArray(allowedIpText),
            postal_codes: textToArray(postalText),
        };
        const fd = new FormData();
        fd.set('intent', 'save');
        fd.set('settings', JSON.stringify(settingsToSave));
        submit(fd, { method: 'post' });
    }, [settings, phoneText, emailText, blockedIpText, allowedIpText, postalText, submit]);

    const handleDiscard = useCallback(() => {
        setSettings(initialSettings || { ...DEFAULT_FRAUD_SETTINGS, shop_domain: shopDomain });
        setPhoneText((initialSettings?.blocked_phone_numbers || []).join('\n'));
        setEmailText((initialSettings?.blocked_emails || []).join('\n'));
        setBlockedIpText((initialSettings?.blocked_ip_addresses || []).join('\n'));
        setAllowedIpText((initialSettings?.allowed_ip_addresses || []).join('\n'));
        setPostalText((initialSettings?.postal_codes || []).join('\n'));
        setHasChanges(false);
        shopify.saveBar.hide('fraud-protection-save-bar');
    }, [initialSettings, shopDomain, shopify]);

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: styles }} />

            <ui-save-bar id="fraud-protection-save-bar">
                <button variant="primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={handleDiscard} disabled={isSaving}>Discard</button>
            </ui-save-bar>

            <div className="fp-page">
                {/* Header */}
                <div className="fp-header">
                    <div className="fp-header-left">
                        <Link to="/app" className="fp-back-btn">←</Link>
                        <div>
                            <h1>Fraud Protection</h1>
                            <p className="fp-subtitle">
                                Prevent abuse by blocking suspicious customers based on IP, phone, email, or postal code
                            </p>
                        </div>
                    </div>
                </div>

                <div className="fp-body">
                    <BlockStack gap="500">

                        {/* ── Section 1: Order Limits ── */}
                        <div className="fp-card">
                            <div className="fp-card-header">
                                <div className="fp-card-icon fp-icon-orders">📊</div>
                                <div>
                                    <Text variant="headingMd" as="h2">Order Limits</Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                        Limit how many orders a customer can place within a time window
                                    </Text>
                                </div>
                            </div>

                            <div className="fp-card-body">
                                <Checkbox
                                    label={
                                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                                            Only allow X orders per IP address, phone or email within X hours
                                        </Text>
                                    }
                                    checked={settings.limit_orders_enabled}
                                    onChange={(val) => update({ limit_orders_enabled: val })}
                                />

                                {settings.limit_orders_enabled && (
                                    <div className="fp-fields-row">
                                        <div className="fp-field">
                                            <TextField
                                                label="Maximum orders"
                                                type="number"
                                                value={String(settings.max_orders || '')}
                                                placeholder="e.g. 3"
                                                onChange={(val) => update({ max_orders: val ? parseInt(val) : undefined })}
                                                autoComplete="off"
                                                helpText="Max orders per customer"
                                            />
                                        </div>
                                        <div className="fp-field">
                                            <TextField
                                                label="Time window (hours)"
                                                type="number"
                                                value={String(settings.limit_hours || '')}
                                                placeholder="e.g. 24"
                                                onChange={(val) => update({ limit_hours: val ? parseInt(val) : undefined })}
                                                autoComplete="off"
                                                helpText="Reset after this many hours"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Section 2: Quantity Limit ── */}
                        <div className="fp-card">
                            <div className="fp-card-header">
                                <div className="fp-card-icon fp-icon-qty">📦</div>
                                <div>
                                    <Text variant="headingMd" as="h2">Quantity Limit</Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                        Prevent customers from ordering too many items at once
                                    </Text>
                                </div>
                            </div>

                            <div className="fp-card-body">
                                <Checkbox
                                    label={
                                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                                            Block orders if the combined product quantity is more than X
                                        </Text>
                                    }
                                    checked={settings.limit_quantity_enabled}
                                    onChange={(val) => update({ limit_quantity_enabled: val })}
                                />

                                {settings.limit_quantity_enabled && (
                                    <div className="fp-fields-row">
                                        <div className="fp-field">
                                            <TextField
                                                label="Maximum quantity per order"
                                                type="number"
                                                value={String(settings.max_quantity || '')}
                                                placeholder="e.g. 10"
                                                onChange={(val) => update({ max_quantity: val ? parseInt(val) : undefined })}
                                                autoComplete="off"
                                                helpText="Orders exceeding this will be blocked"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Section 3: Block Lists ── */}
                        <div className="fp-card">
                            <div className="fp-card-header">
                                <div className="fp-card-icon fp-icon-block">🚫</div>
                                <div>
                                    <Text variant="headingMd" as="h2">Block Lists</Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                        Block specific phone numbers, emails, or IP addresses from placing orders
                                    </Text>
                                </div>
                            </div>

                            <div className="fp-card-body">
                                <Banner tone="info">
                                    Enter one item per line. Press Enter to add a new line.
                                </Banner>

                                <div className="fp-fields-row">
                                    <div className="fp-field">
                                        <TextField
                                            label="Phone numbers to block"
                                            value={phoneText}
                                            onChange={(val) => { setPhoneText(val); setHasChanges(true); }}
                                            multiline={4}
                                            placeholder={"+916238833221\n+576949130303\n+1399384413"}
                                            helpText="Include country code (e.g. +91...)"
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="fp-field">
                                        <TextField
                                            label="Email addresses to block"
                                            value={emailText}
                                            onChange={(val) => { setEmailText(val); setHasChanges(true); }}
                                            multiline={4}
                                            placeholder={"spam@example.com\njohn.doe@hotmail.com\nscammer.com"}
                                            helpText="Use domain (e.g. scammer.com) to block all emails from that domain"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>

                                <div className="fp-fields-row">
                                    <div className="fp-field">
                                        <TextField
                                            label="Blocked IP Addresses"
                                            value={blockedIpText}
                                            onChange={(val) => { setBlockedIpText(val); setHasChanges(true); }}
                                            multiline={4}
                                            placeholder={"219.109.22.2\n12.109.22.3\n109.109.22.4"}
                                            helpText="These IPs will be blocked from placing any orders"
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="fp-field">
                                        <TextField
                                            label="Allowed IP Addresses (override)"
                                            value={allowedIpText}
                                            onChange={(val) => { setAllowedIpText(val); setHasChanges(true); }}
                                            multiline={4}
                                            placeholder={"219.109.22.2\n12.109.22.3"}
                                            helpText="Always allow these IPs, even if other rules block them"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Section 4: Postal Code Restrictions ── */}
                        <div className="fp-card">
                            <div className="fp-card-header">
                                <div className="fp-card-icon fp-icon-postal">📍</div>
                                <div>
                                    <Text variant="headingMd" as="h2">Postal Code Restrictions</Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                        Restrict COD availability by postal/zip code
                                    </Text>
                                </div>
                            </div>

                            <div className="fp-card-body">
                                <Checkbox
                                    label={
                                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                                            Limit where Cash on Delivery is available by postal code
                                        </Text>
                                    }
                                    checked={settings.postal_code_mode !== 'none'}
                                    onChange={(checked) => {
                                        update({ postal_code_mode: checked ? 'block_only' : 'none' });
                                    }}
                                />

                                {settings.postal_code_mode !== 'none' && (
                                    <div className="fp-postal-options">
                                        <BlockStack gap="300">
                                            <div className="fp-radio-group">
                                                <RadioButton
                                                    label="Exclude these postal codes (block list)"
                                                    checked={settings.postal_code_mode === 'block_only'}
                                                    id="postal-block"
                                                    name="postal_mode"
                                                    onChange={() => update({ postal_code_mode: 'block_only' })}
                                                />
                                                <RadioButton
                                                    label="Only allow these postal codes (allow list)"
                                                    checked={settings.postal_code_mode === 'allow_only'}
                                                    id="postal-allow"
                                                    name="postal_mode"
                                                    onChange={() => update({ postal_code_mode: 'allow_only' })}
                                                />
                                            </div>

                                            <TextField
                                                label="Postal codes (one per line)"
                                                value={postalText}
                                                onChange={(val) => { setPostalText(val); setHasChanges(true); }}
                                                multiline={4}
                                                placeholder={"110001\n400001\n560001"}
                                                helpText={
                                                    settings.postal_code_mode === 'allow_only'
                                                        ? 'Only these postal codes will be able to place orders'
                                                        : 'These postal codes will be blocked from placing orders'
                                                }
                                                autoComplete="off"
                                            />
                                        </BlockStack>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Section 5: Block Message ── */}
                        <div className="fp-card">
                            <div className="fp-card-header">
                                <div className="fp-card-icon fp-icon-msg">💬</div>
                                <div>
                                    <Text variant="headingMd" as="h2">Block Message</Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                        Custom message shown when a customer is blocked
                                    </Text>
                                </div>
                            </div>

                            <div className="fp-card-body">
                                <TextField
                                    label="Message to display"
                                    value={settings.blocked_message}
                                    onChange={(val) => update({ blocked_message: val })}
                                    multiline={2}
                                    placeholder="Sorry, you are not allowed to place orders. Please try again later."
                                    helpText="This message will appear when a blocked customer tries to submit an order"
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        {/* Info banner */}
                        <Banner tone="warning">
                            <Text variant="bodySm" as="p">
                                <strong>Note:</strong> Phone, email, postal code, and quantity rules are enforced both on the storefront (instant feedback)
                                and on the server (prevents API bypass). IP address and order frequency rules are enforced server-side only.
                            </Text>
                        </Banner>

                    </BlockStack>
                </div>
            </div>
        </>
    );
}

// =============================================
// STYLES
// =============================================
const styles = `
    .fp-page {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: #f6f6f7;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* Header */
    .fp-header {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px 24px;
        background: #fff;
        border-bottom: 1px solid #e5e7eb;
    }
    .fp-header-left {
        display: flex;
        align-items: center;
        gap: 14px;
    }
    .fp-back-btn {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        border: 1px solid #e5e7eb;
        background: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        text-decoration: none;
        color: #374151;
        transition: all 0.2s ease;
        flex-shrink: 0;
    }
    .fp-back-btn:hover {
        background: #f3f4f6;
        border-color: #d1d5db;
    }
    .fp-header h1 {
        font-size: 20px;
        font-weight: 700;
        margin: 0;
        color: #1f2937;
    }
    .fp-subtitle {
        font-size: 13px;
        color: #6b7280;
        margin: 2px 0 0;
        line-height: 1.4;
    }

    /* Body */
    .fp-body {
        padding: 24px;
        flex: 1;
        max-width: 820px;
        margin: 0 auto;
        width: 100%;
    }

    /* Cards */
    .fp-card {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        overflow: hidden;
        transition: box-shadow 0.2s ease;
    }
    .fp-card:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.04);
    }
    .fp-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px 22px;
        background: #fafbfc;
        border-bottom: 1px solid #f0f0f0;
    }
    .fp-card-icon {
        width: 42px;
        height: 42px;
        border-radius: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
    }
    .fp-icon-orders { background: linear-gradient(135deg, #ede9fe, #ddd6fe); }
    .fp-icon-qty { background: linear-gradient(135deg, #fef3c7, #fde68a); }
    .fp-icon-block { background: linear-gradient(135deg, #fee2e2, #fecaca); }
    .fp-icon-postal { background: linear-gradient(135deg, #dbeafe, #bfdbfe); }
    .fp-icon-msg { background: linear-gradient(135deg, #d1fae5, #a7f3d0); }

    .fp-card-body {
        padding: 20px 22px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    /* Field rows */
    .fp-fields-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-top: 4px;
    }
    .fp-field { min-width: 0; }

    .fp-postal-options {
        padding-left: 28px;
        margin-top: 4px;
    }
    .fp-radio-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    /* Responsive */
    @media (max-width: 640px) {
        .fp-fields-row {
            grid-template-columns: 1fr;
        }
        .fp-body {
            padding: 16px;
        }
    }
`;
