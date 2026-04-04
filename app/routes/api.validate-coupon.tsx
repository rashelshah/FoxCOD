import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { calculateOrderPricing, validateCouponForShop } from "../services/coupons.server";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const body = await request.json();
        const shop = String(body?.shop || "").trim();
        const couponCode = String(body?.couponCode || "").trim();
        const computedTotals = calculateOrderPricing(body);
        const cartTotal = computedTotals.originalTotal;
        const result = await validateCouponForShop(shop, couponCode, cartTotal, body);

        return Response.json(result, {
            status: result.valid ? 200 : 400,
            headers: corsHeaders,
        });
    } catch (error: any) {
        console.error("[Coupons] Validation route error:", error);
        return Response.json({
            valid: false,
            message: "Failed to validate coupon",
        }, {
            status: 500,
            headers: corsHeaders,
        });
    }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    return Response.json({
        valid: false,
        message: "Method not allowed",
    }, {
        status: 405,
        headers: corsHeaders,
    });
};
