/**
 * Per-page skeleton screens shown while navigating between tabs.
 * Each skeleton mirrors the real page's macro layout (see app.tsx, which
 * renders these in place of <Outlet /> only while the destination route's
 * loader is in flight) rather than a single generic placeholder.
 */
import {
    Card, BlockStack, InlineStack, Box,
    SkeletonBodyText, SkeletonDisplayText, SkeletonTabs, SkeletonPage,
} from "@shopify/polaris";

export const skeletonShimmerCSS = `
@keyframes foxSkeletonShimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.fox-skeleton-block {
  background: linear-gradient(90deg, #e4e5e7 25%, #f1f2f3 37%, #e4e5e7 63%);
  background-size: 400px 100%;
  animation: foxSkeletonShimmer 1.4s ease-in-out infinite;
  border-radius: 8px;
}
`;

function Block({ width, height, radius = 8 }: { width?: string | number; height: string | number; radius?: number }) {
    return <div className="fox-skeleton-block" style={{ width: width ?? '100%', height, borderRadius: radius }} />;
}

function HeaderBar() {
    return (
        <InlineStack align="space-between" blockAlign="center" gap="400">
            <InlineStack gap="300" blockAlign="center">
                <Block width={40} height={40} radius={10} />
                <BlockStack gap="150">
                    <Block width={160} height={20} />
                    <Block width={220} height={14} />
                </BlockStack>
            </InlineStack>
            <Block width={90} height={28} radius={14} />
        </InlineStack>
    );
}

/** Dashboard: welcome banner + stat card row + a wider progress card. */
export function DashboardSkeleton() {
    return (
        <Box padding="400">
            <BlockStack gap="500">
                <Block height={150} radius={20} />
                <InlineStack gap="400" wrap={false}>
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} style={{ flex: 1 }}>
                            <Card>
                                <BlockStack gap="200">
                                    <Block width={80} height={14} />
                                    <Block width={100} height={28} />
                                </BlockStack>
                            </Card>
                        </div>
                    ))}
                </InlineStack>
                <Card>
                    <BlockStack gap="300">
                        <SkeletonDisplayText size="small" />
                        <SkeletonBodyText lines={3} />
                    </BlockStack>
                </Card>
            </BlockStack>
        </Box>
    );
}

/** Form Builder / Bundle Offers / Upsells & Downsells: header + tabs + left settings column + right preview panel. */
export function TwoColumnEditorSkeleton() {
    return (
        <Box padding="400">
            <BlockStack gap="400">
                <HeaderBar />
                <SkeletonTabs count={4} />
                <InlineStack gap="400" wrap={false} align="start">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <BlockStack gap="400">
                            {[0, 1, 2].map((i) => (
                                <Card key={i}>
                                    <BlockStack gap="300">
                                        <SkeletonDisplayText size="small" />
                                        <SkeletonBodyText lines={2} />
                                    </BlockStack>
                                </Card>
                            ))}
                        </BlockStack>
                    </div>
                    <div style={{ width: 320, flexShrink: 0 }}>
                        <Card>
                            <BlockStack gap="300">
                                <Block height={24} width="60%" />
                                <Block height={380} radius={16} />
                            </BlockStack>
                        </Card>
                    </div>
                </InlineStack>
            </BlockStack>
        </Box>
    );
}

/** Payment Methods / Settings: header + tab row + stacked full-width cards, single column. */
export function StackedCardsSkeleton() {
    return (
        <Box padding="400">
            <BlockStack gap="400">
                <HeaderBar />
                <SkeletonTabs count={3} />
                {[0, 1, 2, 3].map((i) => (
                    <Card key={i}>
                        <BlockStack gap="300">
                            <SkeletonDisplayText size="small" />
                            <SkeletonBodyText lines={3} />
                        </BlockStack>
                    </Card>
                ))}
            </BlockStack>
        </Box>
    );
}

/** Analytics: stat card row + half-width chart cards + a full-width card. */
export function AnalyticsSkeleton() {
    return (
        <Box padding="400">
            <BlockStack gap="400">
                <SkeletonDisplayText size="medium" />
                <InlineStack gap="400" wrap={false}>
                    {[0, 1, 2].map((i) => (
                        <div key={i} style={{ flex: 1 }}>
                            <Card>
                                <BlockStack gap="200">
                                    <Block width={100} height={14} />
                                    <Block width={80} height={28} />
                                </BlockStack>
                            </Card>
                        </div>
                    ))}
                </InlineStack>
                <InlineStack gap="400" wrap={false}>
                    {[0, 1].map((i) => (
                        <div key={i} style={{ flex: 1 }}>
                            <Card>
                                <BlockStack gap="300">
                                    <Block width={140} height={18} />
                                    <Block height={180} radius={12} />
                                </BlockStack>
                            </Card>
                        </div>
                    ))}
                </InlineStack>
                <Card>
                    <BlockStack gap="300">
                        <SkeletonDisplayText size="small" />
                        <SkeletonBodyText lines={4} />
                    </BlockStack>
                </Card>
            </BlockStack>
        </Box>
    );
}

/** Integrations: grid of tile cards. */
export function IntegrationsSkeleton() {
    return (
        <Box padding="400">
            <BlockStack gap="400">
                <SkeletonDisplayText size="medium" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i}>
                            <BlockStack gap="300">
                                <InlineStack gap="200" blockAlign="center">
                                    <Block width={40} height={40} radius={10} />
                                    <Block width={120} height={18} />
                                </InlineStack>
                                <SkeletonBodyText lines={2} />
                            </BlockStack>
                        </Card>
                    ))}
                </div>
            </BlockStack>
        </Box>
    );
}

/** Fallback for any route without a dedicated shape (Orders, Fraud Protection, Pixel Tracking, etc). */
export function DefaultPageSkeleton() {
    return (
        <SkeletonPage primaryAction>
            <Card>
                <SkeletonBodyText lines={3} />
            </Card>
            <Box paddingBlockStart="400">
                <Card>
                    <SkeletonBodyText lines={5} />
                </Card>
            </Box>
        </SkeletonPage>
    );
}

/** Maps the destination pathname to the skeleton that matches that page's real layout. */
export function getSkeletonForPath(pathname: string) {
    if (pathname === '/app' || pathname === '/app/') return <DashboardSkeleton />;

    if (
        pathname.startsWith('/app/settings') ||
        pathname.startsWith('/app/quantity-offers') ||
        pathname.startsWith('/app/upsell-downsell')
    ) {
        return <TwoColumnEditorSkeleton />;
    }

    if (
        pathname.startsWith('/app/partial-payments') ||
        pathname.startsWith('/app/app-settings') ||
        pathname.startsWith('/app/billing')
    ) {
        return <StackedCardsSkeleton />;
    }

    if (pathname.startsWith('/app/analytics')) return <AnalyticsSkeleton />;
    if (pathname.startsWith('/app/integrations')) return <IntegrationsSkeleton />;

    return <DefaultPageSkeleton />;
}
