/**
 * Integrations Page - Third-party integration management
 * Route: /app/integrations
 * Config-driven, card-based layout following Shopify patterns
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, Link, Form, useNavigation, redirect, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { getAllIntegrationSettings, disconnectIntegration, supabase } from "../config/supabase.server";
import { INTEGRATIONS, STATUS_BADGES, type Integration, type IntegrationSettings, type GoogleSheetsConfig } from "../config/integrations.types";
import { revokeToken } from "../services/google-sheets.server";

/**
 * Loader: Fetch integration settings for all integrations
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    // Get all saved integration settings for this shop
    let savedSettings: IntegrationSettings[] = [];
    try {
        savedSettings = await getAllIntegrationSettings(shopDomain);
    } catch (error) {
        // Table might not exist yet - that's ok
        console.log('[Integrations] No integration settings found (table may not exist yet)');
    }

    // Map saved settings by integration_id for easy lookup
    const settingsMap = new Map<string, IntegrationSettings>();
    savedSettings.forEach((s) => settingsMap.set(s.integration_id, s));

    // Check URL params for success/error messages
    const url = new URL(request.url);
    const successParam = url.searchParams.get('success');
    const errorParam = url.searchParams.get('error');

    let message = null;
    if (successParam === 'google_sheets_connected') {
        message = { type: 'success', text: '✅ Google Sheets connected successfully!' };
    } else if (errorParam === 'oauth_denied') {
        message = { type: 'error', text: '❌ Google authorization was denied. Please try again.' };
    } else if (errorParam === 'connection_failed') {
        message = { type: 'error', text: '❌ Failed to connect Google Sheets. Please try again.' };
    } else if (errorParam === 'not_configured') {
        message = { type: 'error', text: '❌ Google Sheets integration is not configured. Please contact support.' };
    }

    return {
        shop: shopDomain,
        integrations: INTEGRATIONS,
        settingsMap: Object.fromEntries(settingsMap),
        message,
    };
};

/**
 * Action: Handle connect/disconnect/toggle operations
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const integrationId = formData.get("integrationId") as string;

    if (intent === "disconnect" && integrationId === "google_sheets") {
        // Get current settings to revoke token
        const { data: settings } = await supabase
            .from('integration_settings')
            .select('access_token')
            .eq('shop_domain', shopDomain)
            .eq('integration_id', 'google_sheets')
            .single();

        // Revoke token (non-blocking)
        if (settings?.access_token) {
            await revokeToken(settings.access_token).catch(() => { });
        }

        // Disconnect in database
        await disconnectIntegration(shopDomain, integrationId);
        return redirect('/app/integrations?success=disconnected');
    }

    if (intent === "disconnect") {
        await disconnectIntegration(shopDomain, integrationId);
        return redirect('/app/integrations?success=disconnected');
    }

    // For "connect" - redirect to OAuth flow
    if (intent === "connect" && integrationId === "google_sheets") {
        return redirect('/api/integrations/google-sheets/connect');
    }

    return { success: false };
};

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string | undefined): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

/**
 * Integrations Page Component
 */
export default function IntegrationsPage() {
    const { integrations, settingsMap, message } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const [searchParams] = useSearchParams();
    const isSubmitting = navigation.state === "submitting";

    // Get status for an integration
    const getStatus = (integration: Integration): 'connected' | 'not_connected' | 'coming_soon' => {
        if (integration.status === 'coming_soon') return 'coming_soon';
        const settings = settingsMap[integration.id] as IntegrationSettings | undefined;
        return settings?.connected ? 'connected' : 'not_connected';
    };

    // Get CTA button config
    const getButtonConfig = (integration: Integration): { text: string; disabled: boolean; intent: string } => {
        if (integration.status === 'coming_soon') {
            return { text: 'Coming Soon', disabled: true, intent: 'none' };
        }
        const settings = settingsMap[integration.id] as IntegrationSettings | undefined;
        if (settings?.connected) {
            return { text: 'Manage', disabled: false, intent: 'manage' };
        }
        return { text: `Connect ${integration.name}`, disabled: false, intent: 'connect' };
    };

    return (
        <>
            <style>{`
                .integrations-page {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 24px;
                }

                .page-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 32px;
                }

                .back-btn {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    background: white;
                    text-decoration: none;
                    color: #374151;
                    transition: all 0.2s ease;
                }

                .back-btn:hover {
                    background: #f9fafb;
                    border-color: #d1d5db;
                }

                .page-title h1 {
                    font-size: 24px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 4px 0;
                }

                .page-title p {
                    font-size: 14px;
                    color: #6b7280;
                    margin: 0;
                }

                /* Message Banner */
                .message-banner {
                    padding: 14px 20px;
                    border-radius: 12px;
                    margin-bottom: 24px;
                    font-size: 14px;
                    font-weight: 500;
                }

                .message-banner.success {
                    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
                    border: 1px solid #6ee7b7;
                    color: #065f46;
                }

                .message-banner.error {
                    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                    border: 1px solid #fca5a5;
                    color: #991b1b;
                }

                /* Integration Cards Grid */
                .integrations-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                    gap: 20px;
                }

                /* Individual Card */
                .integration-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    padding: 24px;
                    transition: all 0.2s ease;
                    position: relative;
                }

                .integration-card:hover {
                    border-color: #d1d5db;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                }

                .integration-card.coming-soon {
                    opacity: 0.85;
                }

                .integration-card.connected {
                    border-color: #a7f3d0;
                    background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%);
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 12px;
                }

                .card-title-section {
                    flex: 1;
                }

                .card-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                    margin: 0 0 4px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .premium-badge {
                    font-size: 10px;
                    font-weight: 600;
                    color: #7c3aed;
                    background: #ede9fe;
                    padding: 2px 8px;
                    border-radius: 12px;
                    text-transform: uppercase;
                }

                .card-icon {
                    width: 48px;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
                    border-radius: 12px;
                    flex-shrink: 0;
                }

                .card-description {
                    font-size: 14px;
                    color: #6b7280;
                    line-height: 1.5;
                    margin: 0 0 20px 0;
                }

                .card-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                }

                /* Status Badge */
                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                }

                .status-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                }

                /* CTA Button */
                .cta-btn {
                    padding: 10px 20px;
                    font-size: 14px;
                    font-weight: 600;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .cta-btn-primary {
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                }

                .cta-btn-primary:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }

                .cta-btn-secondary {
                    background: #f3f4f6;
                    color: #374151;
                }

                .cta-btn-secondary:hover:not(:disabled) {
                    background: #e5e7eb;
                }

                .cta-btn-success {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                }

                .cta-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                /* Connected Info */
                .connected-info {
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid #d1fae5;
                }

                .connected-detail {
                    font-size: 13px;
                    color: #6b7280;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                }

                .connected-detail strong {
                    color: #374151;
                }

                .connected-actions {
                    display: flex;
                    gap: 12px;
                    margin-top: 12px;
                    flex-wrap: wrap;
                }

                .action-link {
                    font-size: 13px;
                    font-weight: 500;
                    padding: 6px 12px;
                    border-radius: 6px;
                    text-decoration: none;
                    transition: all 0.2s;
                }

                .action-link-open {
                    background: #eff6ff;
                    color: #2563eb;
                }

                .action-link-open:hover {
                    background: #dbeafe;
                }

                .action-link-reconnect {
                    background: #fef3c7;
                    color: #d97706;
                }

                .action-link-reconnect:hover {
                    background: #fde68a;
                }

                .disconnect-btn {
                    font-size: 13px;
                    color: #ef4444;
                    background: #fef2f2;
                    border: none;
                    cursor: pointer;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .disconnect-btn:hover {
                    background: #fee2e2;
                    color: #dc2626;
                }

                /* Info Banner */
                .info-banner {
                    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
                    border: 1px solid #bfdbfe;
                    border-radius: 12px;
                    padding: 16px 20px;
                    margin-bottom: 24px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .info-banner-icon {
                    font-size: 20px;
                }

                .info-banner-text {
                    font-size: 14px;
                    color: #1e40af;
                    margin: 0;
                }

                @media (max-width: 768px) {
                    .integrations-grid {
                        grid-template-columns: 1fr;
                    }

                    .card-footer {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .cta-btn {
                        width: 100%;
                        text-align: center;
                        justify-content: center;
                    }

                    .connected-actions {
                        flex-direction: column;
                    }

                    .action-link, .disconnect-btn {
                        text-align: center;
                    }
                }
            `}</style>

            <s-page heading="">
                <div className="integrations-page">
                    <div className="page-header">
                        <Link to="/app" className="back-btn">←</Link>
                        <div className="page-title">
                            <h1>🔌 Integrations</h1>
                            <p>Connect third-party services to enhance your COD workflow</p>
                        </div>
                    </div>

                    {/* Success/Error Message */}
                    {message && (
                        <div className={`message-banner ${message.type}`}>
                            {message.text}
                        </div>
                    )}

                    <div className="info-banner">
                        <span className="info-banner-icon">💡</span>
                        <p className="info-banner-text">
                            Integrations help you automate order management, send notifications, and improve delivery success.
                        </p>
                    </div>

                    <div className="integrations-grid">
                        {integrations.map((integration: Integration) => {
                            const status = getStatus(integration);
                            const badge = STATUS_BADGES[status];
                            const buttonConfig = getButtonConfig(integration);
                            const settings = settingsMap[integration.id] as IntegrationSettings | undefined;
                            const config = settings?.config as GoogleSheetsConfig | undefined;

                            return (
                                <div
                                    key={integration.id}
                                    className={`integration-card ${status === 'coming_soon' ? 'coming-soon' : ''} ${status === 'connected' ? 'connected' : ''}`}
                                >
                                    <div className="card-header">
                                        <div className="card-title-section">
                                            <h3 className="card-title">
                                                {integration.name}
                                                {integration.isPremium && (
                                                    <span className="premium-badge">Premium</span>
                                                )}
                                            </h3>
                                        </div>
                                        <div className="card-icon">{integration.icon}</div>
                                    </div>

                                    <p className="card-description">{integration.description}</p>

                                    <div className="card-footer">
                                        <span
                                            className="status-badge"
                                            style={{
                                                background: badge.bgColor,
                                                color: badge.color,
                                            }}
                                        >
                                            <span
                                                className="status-dot"
                                                style={{ background: badge.color }}
                                            />
                                            {badge.label}
                                        </span>

                                        {status !== 'connected' && (
                                            <Form method="post">
                                                <input type="hidden" name="integrationId" value={integration.id} />
                                                <input type="hidden" name="intent" value={buttonConfig.intent} />
                                                <button
                                                    type="submit"
                                                    className="cta-btn cta-btn-primary"
                                                    disabled={buttonConfig.disabled || isSubmitting}
                                                >
                                                    {isSubmitting ? '...' : buttonConfig.text}
                                                </button>
                                            </Form>
                                        )}
                                    </div>

                                    {/* Connected state - show sheet info and actions */}
                                    {status === 'connected' && integration.id === 'google_sheets' && (
                                        <div className="connected-info">
                                            {settings?.connected_email && (
                                                <div className="connected-detail">
                                                    ✉️ Account: <strong>{settings.connected_email}</strong>
                                                </div>
                                            )}
                                            {config?.spreadsheetUrl && (
                                                <div className="connected-detail">
                                                    📊 Sheet: <strong>{config.sheetName || 'Orders'}</strong>
                                                </div>
                                            )}
                                            {settings?.last_synced_at && (
                                                <div className="connected-detail">
                                                    🕐 Last synced: <strong>{formatRelativeTime(settings.last_synced_at)}</strong>
                                                </div>
                                            )}

                                            <div className="connected-actions">
                                                {config?.spreadsheetUrl && (
                                                    <a
                                                        href={config.spreadsheetUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="action-link action-link-open"
                                                    >
                                                        📄 Open Sheet
                                                    </a>
                                                )}
                                                <Form method="post" style={{ display: 'inline' }}>
                                                    <input type="hidden" name="integrationId" value={integration.id} />
                                                    <input type="hidden" name="intent" value="connect" />
                                                    <button type="submit" className="action-link action-link-reconnect" disabled={isSubmitting}>
                                                        🔄 Reconnect
                                                    </button>
                                                </Form>
                                                <Form method="post" style={{ display: 'inline' }}>
                                                    <input type="hidden" name="integrationId" value={integration.id} />
                                                    <input type="hidden" name="intent" value="disconnect" />
                                                    <button type="submit" className="disconnect-btn" disabled={isSubmitting}>
                                                        ❌ Disconnect
                                                    </button>
                                                </Form>
                                            </div>
                                        </div>
                                    )}

                                    {/* Generic connected state for other integrations */}
                                    {status === 'connected' && integration.id !== 'google_sheets' && settings?.connected_email && (
                                        <div className="connected-info">
                                            <div className="connected-detail">
                                                ✉️ Connected as: <strong>{settings.connected_email}</strong>
                                            </div>
                                            <Form method="post">
                                                <input type="hidden" name="integrationId" value={integration.id} />
                                                <input type="hidden" name="intent" value="disconnect" />
                                                <button type="submit" className="disconnect-btn" disabled={isSubmitting}>
                                                    Disconnect
                                                </button>
                                            </Form>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </s-page>
        </>
    );
}
