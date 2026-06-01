import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { unauthenticated } from "../shopify.server";

const SHOPIFY_ADMIN_API_VERSION = "2026-04";
const FOX_COD_APP_CLIENT_ID = "7c386161d2e35b3ec0a4fcbe0a8f4045";
const FOX_COD_APP_HANDLE_FALLBACK = "fox-cod-form-partial-prepaid";
const FOX_COD_BLOCK_HANDLE = "cod-form";
const FOX_COD_EXTENSION_UID = "87e0c6dc-4f49-e6ce-990c-7f93eadc93f862473f7f";

type Theme = {
  id: number;
  role: string;
};

type ThemeBlock = {
  type: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
};

type ThemeSection = {
  type?: string;
  blocks?: Record<string, ThemeBlock>;
  block_order?: string[];
};

type ThemeTemplate = {
  sections?: Record<string, ThemeSection>;
  order?: string[];
};

type RestResponse<T> = T & {
  errors?: unknown;
};

type AdminGraphqlClient = {
  graphql: (query: string) => Promise<Response>;
};

function getShopFromRequest(request: Request) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop || !/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
    return null;
  }

  return shop;
}

function getFallbackThemeEditorUrl(shop: string) {
  const appBlockId = `${encodeURIComponent(process.env.SHOPIFY_API_KEY || FOX_COD_APP_CLIENT_ID)}/${encodeURIComponent(FOX_COD_BLOCK_HANDLE)}`;

  return `https://${shop}/admin/themes/current/editor?template=product&addAppBlockId=${appBlockId}&target=mainSection`;
}

function getThemeEditorUrl(shop: string, themeId: number) {
  return `https://${shop}/admin/themes/${themeId}/editor?template=product`;
}

async function adminRestJson<T>(
  shop: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<RestResponse<T>> {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Shopify Admin REST ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload as RestResponse<T>;
}

async function getCurrentAppHandle(admin: AdminGraphqlClient) {
  try {
    const response = await admin.graphql(`
      query CurrentAppHandle {
        currentAppInstallation {
          app {
            handle
          }
        }
      }
    `);
    const payload = await response.json();
    const handle = payload?.data?.currentAppInstallation?.app?.handle;

    return typeof handle === "string" && handle ? handle : FOX_COD_APP_HANDLE_FALLBACK;
  } catch (error) {
    console.error("[Add to Theme] Failed to resolve app handle:", error);
    return FOX_COD_APP_HANDLE_FALLBACK;
  }
}

function isCodBlock(block?: ThemeBlock) {
  if (!block?.type) return false;

  const blockType = block.type.toLowerCase();

  return (
    blockType.includes(`/blocks/${FOX_COD_BLOCK_HANDLE}/`) ||
    blockType.endsWith(`/blocks/${FOX_COD_BLOCK_HANDLE}`) ||
    blockType.includes(FOX_COD_EXTENSION_UID)
  );
}

function isCodBlockEntry(id: string, block?: ThemeBlock) {
  const blockId = id.toLowerCase();

  return (
    isCodBlock(block) ||
    blockId.startsWith("fox_cod") ||
    blockId.includes("fox_cod_order_form")
  );
}

function isBuyButtonsBlock(block?: ThemeBlock) {
  return block?.type === "buy_buttons";
}

function createCodBlock(appHandle: string): ThemeBlock {
  return {
    type: `shopify://apps/${appHandle}/blocks/${FOX_COD_BLOCK_HANDLE}/${FOX_COD_EXTENSION_UID}`,
    settings: {},
  };
}

function getAvailableBlockId(blocks: Record<string, ThemeBlock>) {
  const baseId = "fox_cod_order_form";
  if (!blocks[baseId]) return baseId;

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseId}_${index}`;
    if (!blocks[candidate]) return candidate;
  }

  return `${baseId}_${Date.now()}`;
}

function findProductSection(template: ThemeTemplate) {
  const sections = template.sections || {};

  for (const [id, section] of Object.entries(sections)) {
    if (section.blocks && Object.values(section.blocks).some(isBuyButtonsBlock)) {
      return { id, section };
    }
  }

  if (sections.main?.blocks) return { id: "main", section: sections.main };

  for (const [id, section] of Object.entries(sections)) {
    if (section.type?.includes("product") && section.blocks) return { id, section };
  }

  return null;
}

function getOrderedBlockIds(section: ThemeSection) {
  const blockIds = Object.keys(section.blocks || {});
  const orderedIds = section.block_order?.length ? section.block_order : blockIds;
  const dedupedOrder = orderedIds.filter((id, index) => orderedIds.indexOf(id) === index);
  const missingBlockIds = blockIds.filter((id) => !dedupedOrder.includes(id));

  return [...dedupedOrder, ...missingBlockIds];
}

function findBuyButtonsBlockId(section: ThemeSection, order: string[]) {
  const blocks = section.blocks || {};
  const orderedBuyButtonsId = order.find((id) => isBuyButtonsBlock(blocks[id]));

  if (orderedBuyButtonsId) return orderedBuyButtonsId;

  return Object.entries(blocks).find(([, block]) => isBuyButtonsBlock(block))?.[0] || null;
}

function ensureCodAfterBuyButtons(template: ThemeTemplate, appHandle: string) {
  const result = findProductSection(template);
  if (!result) return false;

  const { section } = result;
  section.blocks = section.blocks || {};
  const currentOrder = getOrderedBlockIds(section);
  const buyButtonsBlockId = findBuyButtonsBlockId(section, currentOrder);
  const existingCodIds = Object.entries(section.blocks)
    .filter(([id, block]) => isCodBlockEntry(id, block))
    .map(([id]) => id);
  const orderedCodIds = existingCodIds.sort((a, b) => {
    const aIndex = currentOrder.indexOf(a);
    const bIndex = currentOrder.indexOf(b);

    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  });

  const codBlockId = orderedCodIds[0] || getAvailableBlockId(section.blocks);
  const keptCodBlock = orderedCodIds[0] ? section.blocks[orderedCodIds[0]] : createCodBlock(appHandle);

  for (const id of existingCodIds) {
    delete section.blocks[id];
  }

  section.blocks[codBlockId] = { ...keptCodBlock, disabled: false };

  const orderWithoutCod = currentOrder.filter((id) => !existingCodIds.includes(id) && id !== codBlockId);
  const buyButtonsIndex = buyButtonsBlockId ? orderWithoutCod.indexOf(buyButtonsBlockId) : -1;
  const insertAt = buyButtonsIndex >= 0 ? buyButtonsIndex + 1 : orderWithoutCod.length;

  orderWithoutCod.splice(insertAt, 0, codBlockId);
  section.block_order = orderWithoutCod.filter((id) => section.blocks?.[id]);

  return true;
}

function hasCodAfterBuyButtons(template: ThemeTemplate) {
  const result = findProductSection(template);
  if (!result) return false;

  const { section } = result;
  const order = getOrderedBlockIds(section);
  const buyButtonsBlockId = findBuyButtonsBlockId(section, order);
  const codBlockId = order.find((id) => isCodBlockEntry(id, section.blocks?.[id]));

  return !!buyButtonsBlockId && !!codBlockId && order.indexOf(codBlockId) === order.indexOf(buyButtonsBlockId) + 1;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForThemeAssetUpdate(
  shop: string,
  accessToken: string,
  themeId: number,
  assetKey: string,
) {
  const assetPath = `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const assetPayload = await adminRestJson<{ asset: { value?: string } }>(
      shop,
      accessToken,
      assetPath,
    );
    const template = JSON.parse(assetPayload.asset.value || "{}") as ThemeTemplate;

    if (hasCodAfterBuyButtons(template)) return true;

    await sleep(250);
  }

  return false;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = getShopFromRequest(request);

  if (!shop) {
    return redirect("/auth/login");
  }

  const fallbackUrl = getFallbackThemeEditorUrl(shop);

  try {
    const { admin, session } = await unauthenticated.admin(shop);

    if (!session?.accessToken) {
      return redirect(fallbackUrl);
    }

    const themesPayload = await adminRestJson<{ themes: Theme[] }>(
      shop,
      session.accessToken,
      "/themes.json",
    );
    const theme = themesPayload.themes.find((item) => item.role === "main") || themesPayload.themes[0];
    const appHandle = await getCurrentAppHandle(admin);

    if (!theme) return redirect(fallbackUrl);

    const assetKey = "templates/product.json";
    const assetPath = `/themes/${theme.id}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;
    const assetPayload = await adminRestJson<{ asset: { value?: string } }>(
      shop,
      session.accessToken,
      assetPath,
    );
    const template = JSON.parse(assetPayload.asset.value || "{}") as ThemeTemplate;

    if (!ensureCodAfterBuyButtons(template, appHandle)) {
      return redirect(fallbackUrl);
    }

    await adminRestJson(
      shop,
      session.accessToken,
      `/themes/${theme.id}/assets.json`,
      {
        method: "PUT",
        body: JSON.stringify({
          asset: {
            key: assetKey,
            value: JSON.stringify(template, null, 2),
          },
        }),
      },
    );

    const updateConfirmed = await waitForThemeAssetUpdate(shop, session.accessToken, theme.id, assetKey);

    if (!updateConfirmed) {
      throw new Error("Theme asset update was not visible after saving COD block order");
    }

    return redirect(getThemeEditorUrl(shop, theme.id));
  } catch (error) {
    console.error("[Add to Theme] Failed to normalize COD block:", error);
    return redirect(fallbackUrl);
  }
};
