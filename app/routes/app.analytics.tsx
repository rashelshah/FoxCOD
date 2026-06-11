/**
 * Analytics Page - Shopify Orders data + Polaris UI
 * Route: /app/analytics
 *
 * Data source: Shopify Orders REST API (NOT Supabase)
 * UI: 100% Shopify Polaris components
 */

import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase, getAnalyticsStats } from "../config/supabase.server";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    InlineStack,
    InlineGrid,
    Box,
    ProgressBar,
    Select,
    EmptyState,
    Divider,
    Badge,
    SkeletonBodyText,
} from "@shopify/polaris";

// ─── Types ──────────────────────────────────────────
interface ShopifyOrder {
    order_payload?: any;
    id: number;
    created_at: string;
    total_price: string;
    financial_status: string;
    fulfillment_status: string | null;
    cancelled_at: string | null;
    tags?: string;
    note_attributes?: { name: string; value: string }[];
}

interface AnalyticsData {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    todayOrders: number;
    weekOrders: number;
    pendingOrders: number;
    fulfilledOrders: number;
    cancelledOrders: number;
    refundedOrders: number;
    partiallyRefundedOrders: number;
    paidOrders: number;
    todayRevenue: number;
    pendingRevenue: number;
    partialOrdersCount: number;
    advanceCollected: number;
    remainingCodValue: number;
    fullPrepaidOrdersCount: number;
    fullPrepaidRevenue: number;
    pureCodOrdersCount: number;
    pureCodFeeRevenue: number;
    partialCodFeeRevenue: number;
    prepaidDiscountOrdersCount: number;
    prepaidDiscountsTotal: number;
    prepaidAvgDiscount: number;
}



// ─── Loader ─────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
    // Single authenticate call — get both admin and session
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;



    // Get shop currency
    let shopCurrency = "USD";
    try {
        const currencyRes = await admin.graphql(`{ shop { currencyCode } }`);
        const currencyData = await currencyRes.json();
        shopCurrency = currencyData?.data?.shop?.currencyCode || "USD";
    } catch (e) {
        console.log("[Analytics] Error fetching shop currency:", e);
    }

    // Date filter from URL params
    const url = new URL(request.url);
    const selectedDays = url.searchParams.get("days") || "all";

    // Build created_at_min for Shopify query
    let createdAtMin: string | undefined;
    if (selectedDays !== "all") {
        const days = parseInt(selectedDays, 10);
        if (!isNaN(days) && days > 0) {
            const date = new Date();
            date.setDate(date.getDate() - days);
            createdAtMin = date.toISOString();
        }
    }

    // Fetch fresh data from Supabase
    let metrics: AnalyticsData;
    try {
        metrics = await getAnalyticsStats(shop, createdAtMin);
    } catch (error) {
        console.error("[Analytics] Error fetching Shopify orders:", error);
        metrics = {
            totalOrders: 0,
            totalRevenue: 0,
            avgOrderValue: 0,
            todayOrders: 0,
            weekOrders: 0,
            pendingOrders: 0,
            fulfilledOrders: 0,
            cancelledOrders: 0,
            refundedOrders: 0,
            partiallyRefundedOrders: 0,
            paidOrders: 0,
            todayRevenue: 0,
            pendingRevenue: 0,
            partialOrdersCount: 0,
            advanceCollected: 0,
            remainingCodValue: 0,
            fullPrepaidOrdersCount: 0,
            fullPrepaidRevenue: 0,
            pureCodOrdersCount: 0,
            pureCodFeeRevenue: 0,
            partialCodFeeRevenue: 0,
            prepaidDiscountOrdersCount: 0,
            prepaidDiscountsTotal: 0,
            prepaidAvgDiscount: 0,
        };
    }

    return { 
        ...metrics, 
        shopCurrency, 
        selectedDays, 
    };
};

// ─── Component ──────────────────────────────────────
export default function AnalyticsPage() {
    const data = useLoaderData<typeof loader>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const {
        totalOrders,
        totalRevenue,
        avgOrderValue,
        todayOrders,
        weekOrders,
        pendingOrders,
        fulfilledOrders,
        cancelledOrders,
        refundedOrders,
        partiallyRefundedOrders,
        paidOrders,
        todayRevenue,
        pendingRevenue,
        shopCurrency,
        selectedDays,
        partialOrdersCount,
        advanceCollected,
        remainingCodValue,
        fullPrepaidOrdersCount,
        fullPrepaidRevenue,
        prepaidDiscountOrdersCount,
        prepaidDiscountsTotal,
        prepaidAvgDiscount,
    } = data;

    // Currency formatter
    const formatCurrency = useCallback(
        (amount: number) =>
            new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: shopCurrency || "USD",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(amount),
        [shopCurrency],
    );

    // Handle date filter change — navigate to trigger loader re-run
    const handleDateChange = useCallback(
        (value: string) => {
            navigate(`/app/analytics?days=${value}`);
        },
        [navigate],
    );

    // ─── Status breakdown for the grid ───
    const statusItems = [
        { label: "Pending Payment", count: pendingOrders, tone: "warning" as const },
        { label: "Paid", count: paidOrders, tone: "success" as const },
        { label: "Fulfilled", count: fulfilledOrders, tone: "info" as const },
        { label: "Cancelled", count: cancelledOrders, tone: "critical" as const },
        { label: "Refunded", count: refundedOrders, tone: "critical" as const },
    ];

    // ─── Distribution bars ───
    const maxStatusCount = Math.max(...statusItems.map((s) => s.count), 1);

    // Date filter label
    const dateFilterOptions = [
        { label: "Last 7 days", value: "7" },
        { label: "Last 30 days", value: "30" },
        { label: "Last 90 days", value: "90" },
        { label: "All time", value: "all" },
    ];

    // ─── Empty state ───
    if (totalOrders === 0) {
        return (
            <Page
                title="Analytics"
                subtitle="Track your COD order performance"
                backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
            >
                <Layout>
                    <Layout.Section>
                        <Card>
                            <EmptyState
                                heading="No orders yet"
                                action={{
                                    content: "Go to Orders",
                                    onAction: () => navigate("/app/orders"),
                                }}
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>
                                    Once you start receiving orders, your analytics will appear here.
                                </p>
                            </EmptyState>
                        </Card>
                    </Layout.Section>
                </Layout>
                <Box paddingBlockEnd="800" />
            </Page>
        );
    }

    return (
        <Page
            title="Analytics"
            subtitle="Track your COD order performance"
            backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
        >
            <BlockStack gap="500">
                {/* ─── Date Filter ─── */}
                <InlineStack align="end">
                    <Box minWidth="200px">
                        <Select
                            label="Time range"
                            labelInline
                            options={dateFilterOptions}
                            value={selectedDays}
                            onChange={handleDateChange}
                        />
                    </Box>
                </InlineStack>

                {/* ─── KPI Summary Cards ─── */}
                <Layout>
                    <Layout.Section variant="oneThird">
                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Total Orders
                                </Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                    {totalOrders.toLocaleString()}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    {selectedDays === "all"
                                        ? "All time"
                                        : `Last ${selectedDays} days`}
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    <Layout.Section variant="oneThird">
                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Total Revenue
                                </Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                    {formatCurrency(totalRevenue)}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Excludes cancelled &amp; refunded
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    <Layout.Section variant="oneThird">
                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Avg Order Value
                                </Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                    {formatCurrency(avgOrderValue)}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Per order
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                <Layout>
                    <Layout.Section variant="oneHalf">
                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Orders Last 7 Days
                                </Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                    {weekOrders.toLocaleString()}
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                        <Card>
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Revenue Today
                                </Text>
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                    {formatCurrency(todayRevenue)}
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* ─── Orders by Status ─── */}
                <Card>
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                            Orders by Status
                        </Text>
                        <InlineGrid columns={5} gap="400">
                            {statusItems.map((item) => (
                                <Box key={item.label}>
                                    <BlockStack gap="200" inlineAlign="center">
                                        <Text
                                            as="p"
                                            variant="headingLg"
                                            fontWeight="bold"
                                            alignment="center"
                                        >
                                            {item.count}
                                        </Text>
                                        <Badge tone={item.tone}>{item.label}</Badge>
                                    </BlockStack>
                                </Box>
                            ))}
                        </InlineGrid>
                    </BlockStack>
                </Card>

                {/* ─── Order Distribution ─── */}
                <Card>
                    <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                            Order Distribution
                        </Text>
                        <BlockStack gap="300">
                            {statusItems.map((item) => {
                                const progress =
                                    maxStatusCount > 0
                                        ? Math.round((item.count / maxStatusCount) * 100)
                                        : 0;
                                return (
                                    <BlockStack key={item.label} gap="100">
                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodySm">
                                                {item.label}
                                            </Text>
                                            <Text as="span" variant="bodySm" fontWeight="semibold">
                                                {item.count}
                                            </Text>
                                        </InlineStack>
                                        <ProgressBar
                                            progress={progress}
                                            size="small"
                                            tone={
                                                item.tone === "critical"
                                                    ? "critical"
                                                    : item.tone === "warning"
                                                      ? "highlight"
                                                      : "primary"
                                            }
                                        />
                                    </BlockStack>
                                );
                            })}
                        </BlockStack>
                    </BlockStack>
                </Card>

                {/* ─── Quick Insights ─── */}
                <Layout>
                    <Layout.Section variant="oneThird">
                        <Card background="bg-surface-secondary">
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Today's Orders
                                </Text>
                                <Text as="p" variant="heading2xl" fontWeight="bold">
                                    {todayOrders}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    {formatCurrency(todayRevenue)} revenue today
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    <Layout.Section variant="oneThird">
                        <Card background="bg-surface-secondary">
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Pending Orders
                                </Text>
                                <Text as="p" variant="heading2xl" fontWeight="bold">
                                    {pendingOrders}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    {formatCurrency(pendingRevenue)} pending
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    <Layout.Section variant="oneThird">
                        <Card background="bg-surface-secondary">
                            <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Returns &amp; Cancellations
                                </Text>
                                <Text as="p" variant="heading2xl" fontWeight="bold">
                                    {cancelledOrders + refundedOrders + partiallyRefundedOrders}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Total unsuccessful orders
                                </Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>
                {/* ─── Partial Payments Section ─── */}
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h2" variant="headingMd">
                                Partial Payments
                            </Text>
                            <Badge tone="info">Advance + COD</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                            Orders where customers paid a deposit online and the remainder is collected on delivery.
                        </Text>
                        <InlineGrid columns={3} gap="400">
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Partial Orders</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">{partialOrdersCount}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        {selectedDays === "all" ? "All time" : `Last ${selectedDays} days`}
                                    </Text>
                                </BlockStack>
                            </Box>
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Advance Collected</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">
                                        {formatCurrency(advanceCollected)}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">Paid online at order time</Text>
                                </BlockStack>
                            </Box>
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Remaining COD Value</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">
                                        {formatCurrency(remainingCodValue)}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">To be collected on delivery</Text>
                                </BlockStack>
                            </Box>
                        </InlineGrid>
                    </BlockStack>
                </Card>

                {/* ─── Full Prepaid Section ─── */}
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h2" variant="headingMd">
                                Full Prepaid
                            </Text>
                            <Badge tone="success">100% Upfront</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                            Orders where customers paid the full amount online instead of choosing COD.
                        </Text>
                        <InlineGrid columns={2} gap="400">
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Full Prepaid Orders</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">{fullPrepaidOrdersCount}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        {selectedDays === "all" ? "All time" : `Last ${selectedDays} days`}
                                    </Text>
                                </BlockStack>
                            </Box>
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Total Revenue</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">
                                        {formatCurrency(fullPrepaidRevenue)}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">100% paid online</Text>
                                </BlockStack>
                            </Box>
                        </InlineGrid>
                    </BlockStack>
                </Card>

                {/* ─── Prepaid Discounts Section ─── */}
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h2" variant="headingMd">
                                Prepaid Discounts
                            </Text>
                            <Badge tone="attention">Incentive</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                            Discount given to customers who chose Full Prepaid.
                        </Text>
                        <InlineGrid columns={3} gap="400">
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Discounted Orders</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">{prepaidDiscountOrdersCount}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        {selectedDays === "all" ? "All time" : `Last ${selectedDays} days`}
                                    </Text>
                                </BlockStack>
                            </Box>
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Total Given</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">
                                        {formatCurrency(prepaidDiscountsTotal)}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">Total discount value</Text>
                                </BlockStack>
                            </Box>
                            <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                                <BlockStack gap="200">
                                    <Text as="p" variant="bodySm" tone="subdued">Avg Discount Per Order</Text>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">
                                        {formatCurrency(prepaidAvgDiscount)}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">Per discounted order</Text>
                                </BlockStack>
                            </Box>
                        </InlineGrid>
                    </BlockStack>
                </Card>

                <Box paddingBlockEnd="800" />
            </BlockStack>
        </Page>
    );
}
