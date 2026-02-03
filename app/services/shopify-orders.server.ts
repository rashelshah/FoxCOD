/**
 * Shopify Orders Service
 * Handles creating orders via Shopify Admin REST API
 * Using REST API as GraphQL mutations require protected customer data access
 */

// Order creation input types
export interface CODOrderInput {
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    productId: string;
    variantId: string;
    quantity: number;
    price: number;
    productTitle: string;
    currency?: string;
}

export interface CreateOrderResult {
    success: boolean;
    orderId?: string;
    orderName?: string;
    error?: string;
}

/**
 * Create a COD order in Shopify using REST Admin API
 * REST API has different access requirements than GraphQL mutations
 */
export async function createCODOrder(
    admin: any,
    input: CODOrderInput
): Promise<CreateOrderResult> {
    try {
        // Parse customer name
        const nameParts = input.customerName.split(" ");
        const firstName = nameParts[0] || "Customer";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Parse address into components
        const addressParts = parseAddress(input.customerAddress);

        // Extract numeric variant ID
        const variantId = extractNumericId(input.variantId);

        console.log("[COD Order] Creating order via REST API for variant:", variantId);

        // Create order via REST API
        const response = await admin.rest.post({
            path: "orders.json",
            data: {
                order: {
                    line_items: [
                        {
                            variant_id: parseInt(variantId),
                            quantity: input.quantity,
                        }
                    ],
                    customer: {
                        first_name: firstName,
                        last_name: lastName || firstName,
                        phone: input.customerPhone,
                    },
                    shipping_address: {
                        first_name: firstName,
                        last_name: lastName || firstName,
                        address1: addressParts.address1,
                        city: addressParts.city,
                        province: addressParts.province,
                        country: "India",
                        zip: addressParts.zip,
                        phone: input.customerPhone,
                    },
                    billing_address: {
                        first_name: firstName,
                        last_name: lastName || firstName,
                        address1: addressParts.address1,
                        city: addressParts.city,
                        province: addressParts.province,
                        country: "India",
                        zip: addressParts.zip,
                        phone: input.customerPhone,
                    },
                    financial_status: "pending",
                    tags: "COD, FoxCOD",
                    note: "COD Order via FoxCOD App - Payment pending on delivery",
                    send_receipt: false,
                    send_fulfillment_receipt: false,
                }
            }
        });

        console.log("[COD Order] REST API Response status:", response.status);

        const order = response.body?.order;

        if (!order) {
            console.error("[COD Order] No order in response:", response.body);
            return {
                success: false,
                error: "Failed to create order - no order returned",
            };
        }

        console.log("[COD Order] Order created successfully:", order.id, order.name);

        return {
            success: true,
            orderId: String(order.id),
            orderName: order.name,
        };

    } catch (error: any) {
        console.error("[COD Order] Exception:", error);

        // Try to extract more details from the error
        let errorMessage = error.message || "Failed to create order";

        if (error.response?.body) {
            console.error("[COD Order] Error body:", JSON.stringify(error.response.body));
            if (error.response.body.errors) {
                if (typeof error.response.body.errors === 'string') {
                    errorMessage = error.response.body.errors;
                } else if (error.response.body.errors.order) {
                    errorMessage = error.response.body.errors.order.join(", ");
                } else {
                    errorMessage = JSON.stringify(error.response.body.errors);
                }
            }
        }

        return {
            success: false,
            error: errorMessage,
        };
    }
}

/**
 * Extract numeric ID from Shopify GID
 */
function extractNumericId(gid: string): string {
    if (!gid) return "";
    if (/^\d+$/.test(gid)) return gid;
    const match = gid.match(/\/(\d+)$/);
    return match ? match[1] : gid;
}

/**
 * Parse a single address string into components
 */
function parseAddress(fullAddress: string): {
    address1: string;
    city: string;
    province: string;
    zip: string;
} {
    const parts = fullAddress.split(",").map((p) => p.trim());

    const defaults = {
        address1: fullAddress,
        city: "Mumbai",
        province: "Maharashtra",
        zip: "400001",
    };

    if (parts.length === 1) {
        return defaults;
    }

    // Try to extract ZIP code (6 digits for India)
    const zipMatch = fullAddress.match(/\b\d{6}\b/);
    const zip = zipMatch ? zipMatch[0] : "400001";

    // State mapping for common Indian states
    const stateMap: { [key: string]: string } = {
        "mh": "Maharashtra", "maharashtra": "Maharashtra",
        "dl": "Delhi", "delhi": "Delhi",
        "ka": "Karnataka", "karnataka": "Karnataka",
        "tn": "Tamil Nadu", "tamil nadu": "Tamil Nadu",
        "up": "Uttar Pradesh", "uttar pradesh": "Uttar Pradesh",
        "gj": "Gujarat", "gujarat": "Gujarat",
        "rj": "Rajasthan", "rajasthan": "Rajasthan",
        "wb": "West Bengal", "west bengal": "West Bengal",
        "tg": "Telangana", "telangana": "Telangana",
        "ap": "Andhra Pradesh", "andhra pradesh": "Andhra Pradesh",
        "kl": "Kerala", "kerala": "Kerala",
        "pb": "Punjab", "punjab": "Punjab",
        "hr": "Haryana", "haryana": "Haryana",
        "br": "Bihar", "bihar": "Bihar",
        "mp": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh",
    };

    // Try to find state in address
    let province = "Maharashtra";
    const lowerAddress = fullAddress.toLowerCase();
    for (const [key, value] of Object.entries(stateMap)) {
        if (lowerAddress.includes(key)) {
            province = value;
            break;
        }
    }

    if (parts.length >= 3) {
        return {
            address1: parts[0],
            city: parts[1] || "Mumbai",
            province: province,
            zip: zip,
        };
    } else if (parts.length === 2) {
        return {
            address1: parts[0],
            city: parts[1] || "Mumbai",
            province: province,
            zip: zip,
        };
    }

    return defaults;
}
