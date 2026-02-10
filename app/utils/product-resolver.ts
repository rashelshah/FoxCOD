/**
 * Product Resolver Utility
 * 
 * Shared utility for fetching product data from Shopify.
 * Used by Form Builder, Bundle Offers, and Storefront to ensure
 * consistent product images, titles, and pricing.
 */

export interface ProductData {
    id: string;
    title: string;
    imageUrl: string | null;
    price: number;
    compareAtPrice: number | null;
    handle: string;
}

/**
 * Fetch product data from Shopify GraphQL API
 * @param productId - Shopify product ID (with or without gid://)
 * @param admin - Shopify admin API instance
 * @returns Product data or null if not found
 */
export async function getProductData(
    productId: string,
    admin: any
): Promise<ProductData | null> {
    try {
        // Normalize product ID to GID format
        const gid = productId.startsWith('gid://')
            ? productId
            : `gid://shopify/Product/${productId}`;

        const response = await admin.graphql(`
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          featuredImage {
            url
          }
          variants(first: 1) {
            edges {
              node {
                price
                compareAtPrice
              }
            }
          }
        }
      }
    `, {
            variables: { id: gid }
        });

        const result = await response.json();
        const product = result.data?.product;

        if (!product) {
            console.warn('[ProductResolver] Product not found:', productId);
            return null;
        }

        const variant = product.variants.edges[0]?.node;

        return {
            id: product.id,
            title: product.title,
            imageUrl: product.featuredImage?.url || null,
            price: variant ? parseFloat(variant.price) : 0,
            compareAtPrice: variant?.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
            handle: product.handle
        };
    } catch (error) {
        console.error('[ProductResolver] Error fetching product:', error);
        return null;
    }
}

/**
 * Fetch multiple products in parallel
 * @param productIds - Array of Shopify product IDs
 * @param admin - Shopify admin API instance
 * @returns Array of product data (nulls filtered out)
 */
export async function getMultipleProducts(
    productIds: string[],
    admin: any
): Promise<ProductData[]> {
    const results = await Promise.all(
        productIds.map(id => getProductData(id, admin))
    );

    return results.filter((p): p is ProductData => p !== null);
}

/**
 * Normalize product ID (strip GID prefix if present)
 * @param productId - Product ID in any format
 * @returns Numeric product ID as string
 */
export function normalizeProductId(productId: string): string {
    return productId.replace('gid://shopify/Product/', '');
}
