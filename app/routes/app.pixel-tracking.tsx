/**
 * Pixel Tracking Admin Page
 * Allows sellers to add/configure tracking pixels and fire events from the COD form
 */
import { useState, useEffect, useCallback } from 'react';
import { useLoaderData, useSubmit, useActionData, useNavigation } from 'react-router';
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { useAppBridge } from '@shopify/app-bridge-react';
import {
    Page, Card, Button, Text, InlineStack, BlockStack,
    TextField, Checkbox, Badge, Banner, Select, Divider, LegacyCard,
} from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import { getPixelSettings, savePixelSettings, deletePixelSettings, syncPixelsToMetafield } from '../services/pixel-tracking.server';
import type { PixelTrackingSettings, PixelProvider } from '../config/pixel-tracking.types';
import { PIXEL_PROVIDERS, DEFAULT_PIXEL_SETTINGS } from '../config/pixel-tracking.types';

// =============================================
// LOADER
// =============================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const pixels = await getPixelSettings(shopDomain);
    return { pixels, shopDomain };
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
            const pixelsJson = formData.get('pixels') as string;
            const pixels: PixelTrackingSettings[] = JSON.parse(pixelsJson);

            // Save each pixel
            for (const px of pixels) {
                await savePixelSettings({ ...px, shop_domain: shopDomain });
            }

            // Sync to metafield
            await syncPixelsToMetafield(admin, shopDomain);

            return { success: true, message: 'Pixel settings saved!' };
        }

        if (intent === 'delete') {
            const pixelId = formData.get('pixelId') as string;
            await deletePixelSettings(pixelId, shopDomain);
            await syncPixelsToMetafield(admin, shopDomain);
            return { success: true, message: 'Pixel deleted!' };
        }

        return { success: false, message: 'Unknown action' };
    } catch (error: any) {
        console.error('[Pixels] Action error:', error);
        return { success: false, message: error.message || 'Something went wrong' };
    }
};

// =============================================
// COMPONENT
// =============================================
export default function PixelTrackingPage() {
    const { pixels: initialPixels, shopDomain } = useLoaderData<any>();
    const actionData = useActionData<any>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const isSaving = navigation.state === 'submitting';

    const [pixels, setPixels] = useState<PixelTrackingSettings[]>(initialPixels || []);
    const [hasChanges, setHasChanges] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Sync from loader when data refreshes
    useEffect(() => {
        if (initialPixels) {
            setPixels(initialPixels);
            setHasChanges(false);
        }
    }, [initialPixels]);

    // Toast on action result
    useEffect(() => {
        if (actionData?.message) {
            shopify.toast.show(actionData.message, { isError: !actionData.success });
            if (actionData.success) {
                setHasChanges(false);
                shopify.saveBar.hide('pixel-tracking-save-bar');
            }
        }
    }, [actionData]);

    // Save bar
    useEffect(() => {
        if (hasChanges) {
            shopify.saveBar.show('pixel-tracking-save-bar');
        } else {
            shopify.saveBar.hide('pixel-tracking-save-bar');
        }
    }, [hasChanges]);

    const updatePixel = useCallback((id: string, updates: Partial<PixelTrackingSettings>) => {
        setPixels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
        setHasChanges(true);
    }, []);

    const addNewPixel = useCallback(() => {
        const newPixel: PixelTrackingSettings = {
            id: `new_${Date.now()}`,
            shop_domain: shopDomain,
            provider: 'facebook' as PixelProvider,
            ...DEFAULT_PIXEL_SETTINGS,
        };
        setPixels(prev => [...prev, newPixel]);
        setExpandedId(newPixel.id!);
        setHasChanges(true);
    }, [shopDomain]);

    const removePixel = useCallback((id: string) => {
        if (id.startsWith('new_')) {
            setPixels(prev => prev.filter(p => p.id !== id));
            setHasChanges(true);
        } else {
            const fd = new FormData();
            fd.set('intent', 'delete');
            fd.set('pixelId', id);
            submit(fd, { method: 'post' });
        }
    }, [submit]);

    const handleSave = useCallback(() => {
        const fd = new FormData();
        fd.set('intent', 'save');
        // Strip `new_` prefix from IDs so server creates new rows
        const cleaned = pixels.map(p => ({
            ...p,
            id: p.id?.startsWith('new_') ? undefined : p.id,
        }));
        fd.set('pixels', JSON.stringify(cleaned));
        submit(fd, { method: 'post' });
    }, [pixels, submit]);

    const handleDiscard = useCallback(() => {
        setPixels(initialPixels || []);
        setHasChanges(false);
        shopify.saveBar.hide('pixel-tracking-save-bar');
    }, [initialPixels, shopify]);

    const getProviderMeta = (key: PixelProvider) =>
        PIXEL_PROVIDERS.find(p => p.key === key) || PIXEL_PROVIDERS[0];

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: styles }} />

            <ui-save-bar id="pixel-tracking-save-bar">
                <button variant="primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={handleDiscard} disabled={isSaving}>Discard</button>
            </ui-save-bar>

            <div className="pt-page">
                <div className="pt-header">
                    <div>
                        <h1>Pixels</h1>
                        <p className="pt-subtitle">Add tracking pixels to track orders placed through the form</p>
                    </div>
                    <Button variant="primary" onClick={addNewPixel}>+ Add new Pixel</Button>
                </div>

                <div className="pt-body">
                    <div className="pt-builder">
                        {pixels.length === 0 ? (
                            <div className="pt-empty">
                                <h2>No Pixels Configured</h2>
                                <p>Add tracking pixels to track form opens, purchases, and more.</p>
                                <Button variant="primary" onClick={addNewPixel}>+ Add new Pixel</Button>
                            </div>
                        ) : (
                            <BlockStack gap="400">
                                {pixels.map((px) => {
                                    const meta = getProviderMeta(px.provider);
                                    const isExpanded = expandedId === px.id;
                                    return (
                                        <LegacyCard key={px.id} sectioned>
                                            <div className="pt-pixel-header" onClick={() => setExpandedId(isExpanded ? null : px.id!)}>
                                                <InlineStack gap="300" blockAlign="center">
                                                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                                                    <Text variant="bodyMd" fontWeight="semibold" as="span">{meta.label}</Text>
                                                    {px.pixel_id && <Text variant="bodySm" tone="subdued" as="span">({px.pixel_id})</Text>}
                                                </InlineStack>
                                                <InlineStack gap="200" blockAlign="center">
                                                    <Badge tone={px.enabled ? 'success' : 'critical'}>{px.enabled ? 'Active' : 'Disabled'}</Badge>
                                                    <button className="pt-delete-btn" onClick={(e) => { e.stopPropagation(); removePixel(px.id!); }} title="Delete">🗑</button>
                                                </InlineStack>
                                            </div>

                                            {isExpanded && (
                                                <div className="pt-pixel-body">
                                                    <Divider />
                                                    <div style={{ paddingTop: 16 }}>
                                                        <BlockStack gap="400">
                                                            {/* Provider + Enable */}
                                                            <InlineStack gap="400" wrap={false}>
                                                                <div style={{ flex: 1 }}>
                                                                    <Select
                                                                        label="Pixel type"
                                                                        value={px.provider}
                                                                        options={PIXEL_PROVIDERS.map(p => ({ label: `${p.icon} ${p.label}`, value: p.key }))}
                                                                        onChange={(val) => updatePixel(px.id!, { provider: val as PixelProvider })}
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1 }}>
                                                                    <TextField
                                                                        label={meta.idLabel}
                                                                        value={px.pixel_id || ''}
                                                                        placeholder={meta.idLabel}
                                                                        onChange={(val) => updatePixel(px.id!, { pixel_id: val })}
                                                                        autoComplete="off"
                                                                    />
                                                                </div>
                                                            </InlineStack>

                                                            {/* Conversion API token (Facebook only) */}
                                                            {meta.hasConversionApi && (
                                                                <TextField
                                                                    label="Conversion API Token"
                                                                    value={px.conversion_api_token || ''}
                                                                    placeholder="Enter your Conversion API token"
                                                                    onChange={(val) => updatePixel(px.id!, { conversion_api_token: val })}
                                                                    autoComplete="off"
                                                                />
                                                            )}

                                                            {/* Label */}
                                                            <TextField
                                                                label="Pixel label (optional)"
                                                                value={px.label || ''}
                                                                placeholder="e.g. Main Facebook Pixel"
                                                                onChange={(val) => updatePixel(px.id!, { label: val })}
                                                                autoComplete="off"
                                                            />

                                                            <Divider />

                                                            {/* Event Toggles */}
                                                            <Text variant="headingSm" as="h3">Tracked Events</Text>
                                                            <Checkbox
                                                                label="Track InitiateCheckout / form opened"
                                                                checked={px.track_initiate_checkout}
                                                                onChange={(val) => updatePixel(px.id!, { track_initiate_checkout: val })}
                                                            />
                                                            <Checkbox
                                                                label="Track Purchase / order submitted"
                                                                checked={px.track_purchase}
                                                                onChange={(val) => updatePixel(px.id!, { track_purchase: val })}
                                                            />
                                                            <Checkbox
                                                                label="Track AddToCart when add to cart button is clicked"
                                                                checked={px.track_add_to_cart}
                                                                onChange={(val) => updatePixel(px.id!, { track_add_to_cart: val })}
                                                            />
                                                            <Checkbox
                                                                label="Track AddPaymentInfo when customer starts filling out the form"
                                                                checked={px.track_add_payment_info}
                                                                onChange={(val) => updatePixel(px.id!, { track_add_payment_info: val })}
                                                            />
                                                            <Checkbox
                                                                label="Track ViewContent when the page is loaded"
                                                                checked={px.track_view_content}
                                                                onChange={(val) => updatePixel(px.id!, { track_view_content: val })}
                                                            />

                                                            <Divider />

                                                            {/* Enable toggle */}
                                                            <Checkbox
                                                                label="Enable this pixel"
                                                                checked={px.enabled}
                                                                onChange={(val) => updatePixel(px.id!, { enabled: val })}
                                                            />
                                                        </BlockStack>
                                                    </div>
                                                </div>
                                            )}
                                        </LegacyCard>
                                    );
                                })}
                            </BlockStack>
                        )}

                        {/* Tracked Events Reference Table */}
                        <LegacyCard title="Tracked Events List" sectioned>
                            <div className="pt-events-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Pixel</th>
                                            <th>Events Tracked</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {PIXEL_PROVIDERS.map(p => (
                                            <tr key={p.key}>
                                                <td><strong>{p.icon} {p.label}</strong></td>
                                                <td>• {p.events.join(', ')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </LegacyCard>
                    </div>
                </div>
            </div>
        </>
    );
}

// =============================================
// STYLES
// =============================================
const styles = `
    .pt-page { display: flex; flex-direction: column; min-height: 100vh; background: #f6f6f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .pt-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e1e3e5; }
    .pt-header h1 { font-size: 24px; font-weight: 700; margin: 0; }
    .pt-subtitle { font-size: 14px; color: #6d7175; margin: 4px 0 0; }
    .pt-body { padding: 24px; flex: 1; max-width: 900px; margin: 0 auto; width: 100%; }
    .pt-builder { display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 150vh; }

    .pt-empty { text-align: center; padding: 60px 20px; background: #fff; border: 1px solid #e1e3e5; border-radius: 12px; }
    .pt-empty h2 { font-size: 18px; margin: 0 0 8px; }
    .pt-empty p { color: #6d7175; margin: 0 0 16px; }

    .pt-pixel-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 4px 0; }
    .pt-pixel-body { margin-top: 12px; }

    .pt-delete-btn { background: none; border: none; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
    .pt-delete-btn:hover { background: #fee2e2; }

    .pt-events-table table { width: 100%; border-collapse: collapse; }
    .pt-events-table th { background: #1f2937; color: #fff; padding: 10px 16px; text-align: left; font-size: 13px; font-weight: 600; }
    .pt-events-table th:first-child { border-radius: 6px 0 0 0; }
    .pt-events-table th:last-child { border-radius: 0 6px 0 0; }
    .pt-events-table td { padding: 10px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    .pt-events-table tr:last-child td { border-bottom: none; }
    .pt-events-table tr:hover td { background: #f9fafb; }
`;
