/**
 * Billing & Subscription
 * Route: /app/billing
 *
 * Shows the merchant their plan, usage against the allowance, accrued overage
 * and next renewal, and drives every upgrade/downgrade through Shopify's
 * official subscription replacement flow.
 *
 * The loader reconciles against Shopify on every visit, which is also what
 * makes this a safe returnUrl for the approval screen — by the time the
 * merchant lands back here, their new plan is already reflected.
 */

import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import {
    Badge,
    Banner,
    BlockStack,
    Button,
    Card,
    Divider,
    InlineStack,
    ProgressBar,
    Text,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import {
    BILLING_PLANS,
    PLAN_ORDER,
    comparePlans,
    formatIncludedOrders,
    getPlan,
    getPlanPrice,
    resolveCycle,
    resolvePlanKey,
    supportsUsageBilling,
    yearlySavings,
    type BillingCycle,
    type PlanKey,
} from "../config/billing-plans";
import {
    cancelSubscription,
    requestUsageCapIncrease,
    subscribeToPlan,
    syncFromShopify,
} from "../services/billing/subscription.server";
import { buildUsageSnapshot } from "../services/billing/order-counter.server";
import { getUsageChargeHistory } from "../services/billing/usage-charges.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    // Shopify is authoritative — reconcile before rendering anything.
    const record = await syncFromShopify(shop, admin as any);
    const usage = buildUsageSnapshot(record);
    const charges = await getUsageChargeHistory(shop, 10);

    return {
        usage,
        charges: charges.map((c: any) => ({
            id: c.id,
            amount: Number(c.amount ?? 0),
            currency: c.currency ?? "USD",
            overageOrders: Number(c.overage_orders ?? 0),
            status: c.status,
            createdAt: c.created_at,
            error: c.error,
        })),
        isTestBilling: record.is_test,
    };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;

    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "");

    // Land the merchant back inside the embedded admin after they approve.
    const storeHandle = shop.replace(".myshopify.com", "");
    const returnUrl =
        `https://admin.shopify.com/store/${storeHandle}` +
        `/apps/${process.env.SHOPIFY_API_KEY}/app/billing`;

    if (intent === "subscribe") {
        const planKey = resolvePlanKey(formData.get("planKey"));
        const cycle = resolveCycle(formData.get("cycle"));

        const result = await subscribeToPlan({
            shop,
            planKey,
            cycle,
            returnUrl,
            admin: admin as any,
        });

        return {
            intent,
            success: result.success,
            confirmationUrl: result.confirmationUrl,
            error: result.error ?? null,
            // Moving to Free needs no approval screen — it takes effect at once.
            message: result.success && !result.confirmationUrl ? "Your plan has been changed." : null,
        };
    }

    if (intent === "cancel") {
        const result = await cancelSubscription({ shop, admin: admin as any, prorate: true });
        return {
            intent,
            success: result.success,
            confirmationUrl: null,
            error: result.error ?? null,
            message: result.success ? "Your subscription was cancelled. You are now on the Free plan." : null,
        };
    }

    if (intent === "raise-cap") {
        const newCap = Number(formData.get("newCap") ?? 0);
        const result = await requestUsageCapIncrease({ shop, newCap, admin: admin as any });
        return {
            intent,
            success: result.success,
            confirmationUrl: result.confirmationUrl,
            error: result.error ?? null,
            message: null,
        };
    }

    return { intent, success: false, confirmationUrl: null, error: "Unknown action", message: null };
};

function formatMoney(amount: number, currency = "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function formatDate(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BillingPage() {
    const { usage, charges, isTestBilling } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const submit = useSubmit();

    const [cycle, setCycle] = useState<BillingCycle>(usage.cycle);
    const isSubmitting = navigation.state === "submitting";

    // Shopify's approval screen has to replace the whole page, not render inside
    // the embedded iframe. App Bridge makes `_top` work from within the frame.
    useEffect(() => {
        if (actionData?.confirmationUrl) {
            window.open(actionData.confirmationUrl, "_top");
        }
    }, [actionData]);

    const changePlan = (planKey: PlanKey, nextCycle: BillingCycle) => {
        const formData = new FormData();
        formData.set("intent", planKey === "FREE" ? "cancel" : "subscribe");
        formData.set("planKey", planKey);
        formData.set("cycle", nextCycle);
        submit(formData, { method: "post" });
    };

    const raiseCap = () => {
        const formData = new FormData();
        formData.set("intent", "raise-cap");
        // Double the current ceiling, which is what merchants almost always want
        // when they've hit it mid-cycle.
        formData.set("newCap", String(Math.max(50, Math.ceil(usage.usageCappedAmount * 2))));
        submit(formData, { method: "post" });
    };

    const pctUsed = usage.isUnlimited ? 0 : usage.usagePercent;
    // ProgressBar accepts highlight | primary | success | critical — not "warning".
    const meterTone: "critical" | "highlight" | "primary" =
        pctUsed >= 100 ? "critical" : pctUsed >= 80 ? "highlight" : "primary";

    // Overage the merchant can see but Shopify can't bill: yearly cycles cannot
    // carry a usage line item (see the note in config/billing-plans.ts).
    const overageTrackedNotCharged =
        usage.overageOrders > 0 && !usage.overageBillable && getPlan(usage.planKey).overageEnabled;

    const capReached = charges.some((c) => c.status === "capped");

    return (
        <>
            <style>{`
        .fox-billing { padding: 0; box-sizing: border-box; }

        .billing-hero {
          background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
          border-radius: 20px;
          padding: 28px 32px;
          color: #fff;
          margin-bottom: 24px;
          box-shadow: 0 15px 30px rgba(239, 68, 68, 0.15);
        }
        .billing-hero h1 { font-size: 26px; font-weight: 700; margin: 0 0 4px; }
        .billing-hero p { margin: 0; opacity: 0.9; font-size: 14px; }
        .billing-hero-row {
          display: flex; justify-content: space-between;
          align-items: center; gap: 24px; flex-wrap: wrap;
        }
        .billing-plan-pill {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.35);
          border-radius: 999px; padding: 8px 18px;
          font-weight: 700; font-size: 15px; white-space: nowrap;
        }

        .billing-stats {
          display: grid; gap: 16px; margin-bottom: 24px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .billing-stat {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
          padding: 18px 20px;
        }
        .billing-stat-label {
          font-size: 12px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.4px; color: #6b7280; margin-bottom: 8px;
        }
        .billing-stat-value { font-size: 24px; font-weight: 700; color: #111827; line-height: 1.2; }
        .billing-stat-sub { font-size: 12px; color: #6b7280; margin-top: 4px; }

        .cycle-toggle {
          display: inline-flex; background: #f3f4f6;
          border-radius: 999px; padding: 4px; gap: 4px; margin-bottom: 20px;
        }
        .cycle-btn {
          border: none; background: transparent; cursor: pointer;
          padding: 8px 20px; border-radius: 999px;
          font-size: 14px; font-weight: 600; color: #6b7280;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .cycle-btn.active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .cycle-save {
          background: #dcfce7; color: #166534; border-radius: 999px;
          padding: 2px 8px; font-size: 11px; font-weight: 700;
        }

        .plan-grid {
          display: grid; gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        }
        .plan-card {
          position: relative; background: #fff; border: 2px solid #e5e7eb;
          border-radius: 16px; padding: 22px 20px;
          display: flex; flex-direction: column;
        }
        .plan-card.current { border-color: #f97316; box-shadow: 0 8px 20px rgba(249,115,22,0.12); }
        .plan-card.popular { border-color: #fdba74; }
        .plan-ribbon {
          position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(135deg, #ef4444, #f97316); color: #fff;
          font-size: 11px; font-weight: 700; padding: 4px 12px;
          border-radius: 999px; white-space: nowrap;
        }
        .plan-name { font-size: 17px; font-weight: 700; color: #111827; }
        .plan-tagline { font-size: 12px; color: #6b7280; margin-top: 2px; }
        .plan-price { font-size: 30px; font-weight: 800; color: #111827; margin: 14px 0 2px; }
        .plan-price span { font-size: 13px; font-weight: 500; color: #6b7280; }
        .plan-orders { font-size: 13px; color: #374151; font-weight: 600; margin-bottom: 14px; }
        .plan-features { list-style: none; padding: 0; margin: 0 0 18px; flex: 1; }
        .plan-features li {
          font-size: 13px; color: #4b5563; padding: 5px 0 5px 22px;
          position: relative; line-height: 1.4;
        }
        .plan-features li::before {
          content: '✓'; position: absolute; left: 0; top: 5px;
          color: #16a34a; font-weight: 700;
        }

        .charge-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .charge-table th {
          text-align: left; padding: 10px 12px; color: #6b7280;
          font-weight: 600; font-size: 12px; text-transform: uppercase;
          letter-spacing: 0.4px; border-bottom: 1px solid #e5e7eb;
        }
        .charge-table td { padding: 12px; border-bottom: 1px solid #f3f4f6; color: #374151; }
        .charge-table tr:last-child td { border-bottom: none; }

        @media (max-width: 640px) {
          .billing-hero { padding: 22px; }
          .billing-hero h1 { font-size: 21px; }
          .plan-grid { grid-template-columns: 1fr; }
        }
      `}</style>

            <s-page heading="">
                <div className="fox-billing">
                    {/* ── Hero ── */}
                    <div className="billing-hero">
                        <div className="billing-hero-row">
                            <div>
                                <h1>Billing &amp; Usage</h1>
                                <p>Manage your plan, track order usage and review overage charges.</p>
                            </div>
                            <div className="billing-plan-pill">
                                {usage.planName} · {usage.cycle === "yearly" ? "Yearly" : "Monthly"}
                            </div>
                        </div>
                    </div>

                    <BlockStack gap="400">
                        {isTestBilling && (
                            <Banner tone="info" title="Test billing is active">
                                <p>
                                    Subscriptions on this store are created in Shopify&apos;s test mode — the
                                    approval flow runs end to end but no card is ever charged. Set
                                    <code> SHOPIFY_BILLING_TEST=false </code> in production.
                                </p>
                            </Banner>
                        )}

                        {actionData?.error && (
                            <Banner tone="critical" title="Something went wrong">
                                <p>{actionData.error}</p>
                            </Banner>
                        )}

                        {actionData?.message && (
                            <Banner tone="success">
                                <p>{actionData.message}</p>
                            </Banner>
                        )}

                        {usage.limitReached && (
                            <Banner tone="critical" title="You have reached your Free plan limit">
                                <p>
                                    New orders are being blocked. Upgrade to continue receiving orders —
                                    your usage resets on {formatDate(usage.periodEnd)}.
                                </p>
                            </Banner>
                        )}

                        {!usage.limitReached && !usage.isUnlimited && pctUsed >= 80 && (
                            <Banner tone="warning" title={`You've used ${pctUsed}% of your included orders`}>
                                <p>
                                    {usage.remainingOrders} order{usage.remainingOrders === 1 ? "" : "s"} left
                                    this cycle.
                                    {getPlan(usage.planKey).blockOnLimit
                                        ? " Orders will be blocked once you reach the limit."
                                        : ` Extra orders are billed at ${formatMoney(usage.overagePrice)} each.`}
                                </p>
                            </Banner>
                        )}

                        {capReached && (
                            <Banner
                                tone="warning"
                                title="Your usage charge limit has been reached"
                                action={{ content: "Raise the limit", onAction: raiseCap }}
                            >
                                <p>
                                    Shopify has stopped accepting overage charges because your approved
                                    limit of {formatMoney(usage.usageCappedAmount)} per cycle is exhausted.
                                    Raising it requires your approval.
                                </p>
                            </Banner>
                        )}

                        {overageTrackedNotCharged && (
                            <Banner tone="info" title="Overage is not billed on yearly plans">
                                <p>
                                    Shopify&apos;s Billing API only supports usage charges on monthly
                                    subscriptions, so the {usage.overageOrders} extra order
                                    {usage.overageOrders === 1 ? "" : "s"} shown below are tracked for your
                                    records but not charged. Switch to monthly billing to enable overage
                                    billing.
                                </p>
                            </Banner>
                        )}

                        {/* ── Usage summary ── */}
                        <Card>
                            <BlockStack gap="400">
                                <InlineStack align="space-between" blockAlign="center">
                                    <Text variant="headingMd" as="h2">
                                        This billing cycle
                                    </Text>
                                    <Text variant="bodySm" tone="subdued" as="span">
                                        {formatDate(usage.periodStart)} – {formatDate(usage.periodEnd)}
                                    </Text>
                                </InlineStack>

                                {!usage.isUnlimited && (
                                    <BlockStack gap="200">
                                        <InlineStack align="space-between">
                                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                                                {usage.orderCount.toLocaleString("en-US")} /{" "}
                                                {usage.includedOrders.toLocaleString("en-US")} orders used
                                            </Text>
                                            <Text variant="bodySm" tone="subdued" as="span">
                                                {pctUsed}%
                                            </Text>
                                        </InlineStack>
                                        <ProgressBar progress={pctUsed} size="small" tone={meterTone} />
                                    </BlockStack>
                                )}

                                <div className="billing-stats">
                                    <div className="billing-stat">
                                        <div className="billing-stat-label">Orders Used</div>
                                        <div className="billing-stat-value">
                                            {usage.orderCount.toLocaleString("en-US")}
                                            {!usage.isUnlimited && (
                                                <span style={{ fontSize: 15, color: "#6b7280", fontWeight: 500 }}>
                                                    {" "}
                                                    / {usage.includedOrders.toLocaleString("en-US")}
                                                </span>
                                            )}
                                        </div>
                                        <div className="billing-stat-sub">
                                            {usage.isUnlimited ? "Unlimited plan" : "Included this cycle"}
                                        </div>
                                    </div>

                                    <div className="billing-stat">
                                        <div className="billing-stat-label">Remaining</div>
                                        <div className="billing-stat-value">
                                            {usage.isUnlimited ? "∞" : usage.remainingOrders?.toLocaleString("en-US")}
                                        </div>
                                        <div className="billing-stat-sub">
                                            {usage.isUnlimited ? "No limit" : "Orders remaining"}
                                        </div>
                                    </div>

                                    <div className="billing-stat">
                                        <div className="billing-stat-label">Overage Orders</div>
                                        <div className="billing-stat-value">
                                            {usage.overageOrders.toLocaleString("en-US")}
                                        </div>
                                        <div className="billing-stat-sub">
                                            {usage.overagePrice > 0
                                                ? `${formatMoney(usage.overagePrice)} per order`
                                                : "No overage charges"}
                                        </div>
                                    </div>

                                    <div className="billing-stat">
                                        <div className="billing-stat-label">Estimated Overage</div>
                                        <div className="billing-stat-value">
                                            {formatMoney(usage.estimatedOverageAmount, usage.currency)}
                                        </div>
                                        <div className="billing-stat-sub">
                                            {usage.pendingOverageOrders > 0
                                                ? `${usage.pendingOverageOrders} not yet billed`
                                                : "All charges submitted"}
                                        </div>
                                    </div>

                                    <div className="billing-stat">
                                        <div className="billing-stat-label">Renewal</div>
                                        <div className="billing-stat-value" style={{ fontSize: 18 }}>
                                            {usage.renewsOn ? formatDate(usage.renewsOn) : "—"}
                                        </div>
                                        <div className="billing-stat-sub">
                                            {usage.renewsOn
                                                ? `Renews ${usage.cycle === "yearly" ? "yearly" : "monthly"}`
                                                : "Free plan — no renewal"}
                                        </div>
                                    </div>
                                </div>
                            </BlockStack>
                        </Card>

                        {/* ── Plans ── */}
                        <Card>
                            <BlockStack gap="400">
                                <BlockStack gap="100">
                                    <Text variant="headingMd" as="h2">
                                        Plans
                                    </Text>
                                    <Text variant="bodySm" tone="subdued" as="p">
                                        Changing plan uses Shopify&apos;s official subscription replacement —
                                        your previous plan is cancelled and prorated automatically.
                                    </Text>
                                </BlockStack>

                                <div>
                                    <div className="cycle-toggle">
                                        <button
                                            type="button"
                                            className={`cycle-btn ${cycle === "monthly" ? "active" : ""}`}
                                            onClick={() => setCycle("monthly")}
                                        >
                                            Monthly
                                        </button>
                                        <button
                                            type="button"
                                            className={`cycle-btn ${cycle === "yearly" ? "active" : ""}`}
                                            onClick={() => setCycle("yearly")}
                                        >
                                            Yearly
                                            <span className="cycle-save">
                                                Save {yearlySavings("PRO").percent}%
                                            </span>
                                        </button>
                                    </div>

                                    {cycle === "yearly" && !supportsUsageBilling("yearly") && (
                                        <div style={{ marginBottom: 16 }}>
                                            <Text variant="bodySm" tone="subdued" as="p">
                                                Note: Shopify does not support usage-based overage charges on
                                                yearly subscriptions, so extra orders on a yearly plan are
                                                tracked but not billed.
                                            </Text>
                                        </div>
                                    )}
                                </div>

                                <div className="plan-grid">
                                    {PLAN_ORDER.map((planKey) => {
                                        const plan = BILLING_PLANS[planKey];
                                        const price = getPlanPrice(planKey, cycle);
                                        const isCurrent =
                                            usage.planKey === planKey &&
                                            (planKey === "FREE" || usage.cycle === cycle);
                                        const direction = comparePlans(planKey, usage.planKey);

                                        let label = "Choose plan";
                                        if (isCurrent) label = "Current plan";
                                        else if (direction > 0) label = "Upgrade";
                                        else if (direction < 0) label = "Downgrade";
                                        else label = cycle === "yearly" ? "Switch to yearly" : "Switch to monthly";

                                        return (
                                            <div
                                                key={planKey}
                                                className={`plan-card ${isCurrent ? "current" : ""} ${plan.highlight && !isCurrent ? "popular" : ""}`}
                                            >
                                                {plan.highlight && !isCurrent && (
                                                    <div className="plan-ribbon">Most popular</div>
                                                )}

                                                <InlineStack align="space-between" blockAlign="start">
                                                    <div>
                                                        <div className="plan-name">{plan.name}</div>
                                                        <div className="plan-tagline">{plan.tagline}</div>
                                                    </div>
                                                    {isCurrent && <Badge tone="success">Active</Badge>}
                                                </InlineStack>

                                                <div className="plan-price">
                                                    {price === 0 ? "Free" : formatMoney(price)}
                                                    {price > 0 && <span>/{cycle === "yearly" ? "yr" : "mo"}</span>}
                                                </div>
                                                <div className="plan-orders">
                                                    {formatIncludedOrders(planKey)} orders / month
                                                </div>

                                                <ul className="plan-features">
                                                    {plan.features.map((feature) => (
                                                        <li key={feature}>{feature}</li>
                                                    ))}
                                                </ul>

                                                <Button
                                                    variant={isCurrent ? "secondary" : direction > 0 ? "primary" : "secondary"}
                                                    disabled={isCurrent || isSubmitting}
                                                    loading={isSubmitting}
                                                    onClick={() => changePlan(planKey, cycle)}
                                                    fullWidth
                                                >
                                                    {label}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </BlockStack>
                        </Card>

                        {/* ── Charge history ── */}
                        {charges.length > 0 && (
                            <Card>
                                <BlockStack gap="300">
                                    <BlockStack gap="100">
                                        <Text variant="headingMd" as="h2">
                                            Overage charges
                                        </Text>
                                        <Text variant="bodySm" tone="subdued" as="p">
                                            Overage is aggregated and submitted to Shopify once per day, not
                                            per order.
                                        </Text>
                                    </BlockStack>
                                    <Divider />
                                    <div style={{ overflowX: "auto" }}>
                                        <table className="charge-table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Orders</th>
                                                    <th>Amount</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {charges.map((charge) => (
                                                    <tr key={charge.id}>
                                                        <td>{formatDate(charge.createdAt)}</td>
                                                        <td>{charge.overageOrders.toLocaleString("en-US")}</td>
                                                        <td>{formatMoney(charge.amount, charge.currency)}</td>
                                                        <td>
                                                            <Badge
                                                                tone={
                                                                    charge.status === "success"
                                                                        ? "success"
                                                                        : charge.status === "capped"
                                                                            ? "warning"
                                                                            : charge.status === "failed"
                                                                                ? "critical"
                                                                                : undefined
                                                                }
                                                            >
                                                                {charge.status === "success"
                                                                    ? "Charged"
                                                                    : charge.status === "capped"
                                                                        ? "Limit reached"
                                                                        : charge.status === "failed"
                                                                            ? "Failed"
                                                                            : "Pending"}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </BlockStack>
                            </Card>
                        )}
                    </BlockStack>
                </div>
            </s-page>
        </>
    );
}
