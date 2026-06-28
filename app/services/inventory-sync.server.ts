/**
 * FoxlyCOD Inventory Synchronization Service
 *
 * Implements strict inventory replication of native Shopify behavior
 * using the "reserved" inventory state to bypass native "Committed" limitations.
 */

import { unauthenticated } from '../shopify.server';
import { supabase } from '../config/supabase.server';
import * as fs from 'node:fs';

export interface InventoryLineItem {
  variantId: string;
  inventoryItemId: string;
  quantity: number;
  title: string;
  sku?: string;
  tracked?: boolean;
  inventoryPolicy?: string;
}

export interface InventoryLevel {
  locationId: string;
  available: number;
}

// ─── Idempotency Guard ────────────────────────────────────────────────────────

export async function tryReserveInventoryEvent(
  shop: string,
  orderId: string,
  variantId: string,
  action: string,
  quantity: number
): Promise<boolean> {
  const { error } = await supabase
    .from('inventory_events')
    .insert({
      shop,
      order_id: String(orderId),
      variant_id: String(variantId),
      action,
      quantity
    });
  
  if (error) {
    if (error.code === '23505') {
      fsLog(`[SKIPPED DUPLICATE] ${action} for order ${orderId} variant ${variantId}`);
      return false;
    }
    console.error('[InventorySync] Error logging inventory event:', error);
    return false;
  }
  return true;
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function fetchInventoryLevels(graphql: any, inventoryItemId: string): Promise<InventoryLevel[]> {
  const res = await graphql(
    `query getInventoryLevels($id: ID!) {
      inventoryItem(id: $id) {
        inventoryLevels(first: 20) {
          nodes {
            location { id }
            quantities(names: ["available", "reserved", "committed", "on_hand"]) { name quantity }
          }
        }
      }
    }`,
    { variables: { id: inventoryItemId } }
  );
  const data = await res.json();
  const levels: InventoryLevel[] = (data?.data?.inventoryItem?.inventoryLevels?.nodes || [])
    .map((node: any) => {
      fsLog(`[SHOPIFY LEVELS] [SUPPORTED STATES] ${JSON.stringify({ inventoryItemId, locationId: node.location?.id, quantities: node.quantities })}`);
      const availableEntry = (node.quantities || []).find((q: any) => q.name === 'available');
      return { locationId: node.location?.id, available: availableEntry?.quantity ?? 0 };
    })
    .filter((l: InventoryLevel) => !!l.locationId)
    .sort((a: InventoryLevel, b: InventoryLevel) => b.available - a.available);
  return levels;
}

/**
 * Adjusts an inventory quantity absolute delta for 'available' state.
 */
async function applyInventoryDelta(
  graphql: any,
  inventoryItemId: string,
  locationId: string,
  delta: number,
  reason: string = 'correction'
): Promise<void> {
  if (delta === 0) return;
  
  fsLog(`[ADJUST AVAILABLE] ID: ${inventoryItemId} Loc: ${locationId} Delta: ${delta}`);
  const change: any = { inventoryItemId, locationId, delta };
  
  const res = await graphql(
    `mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        userErrors { field message }
      }
    }`,
    { variables: { input: { reason, name: "available", changes: [change] } } }
  );
  
  const data = await res.json();
  const errors = data?.data?.inventoryAdjustQuantities?.userErrors || [];
  
  if (errors.length > 0 || data?.errors) {
    fsLog(`[ERROR] GraphQL mutation failed: ${JSON.stringify(errors || data?.errors)}`);
    throw new Error(`Failed to adjust available by ${delta} at ${locationId}`);
  }
  
  await fetchInventoryLevels(graphql, inventoryItemId);
  fsLog(`[SUCCESS] Adjusted available by ${delta} at ${locationId}`);
}

export function parseInventoryMetadata(attributes: Array<{ key?: string; name?: string; value: string }>): InventoryLineItem[] {
  const attr = attributes.find((a) => (a.key || a.name) === '_foxcod_inventory');
  if (!attr?.value) return [];
  try {
    const parsed = JSON.parse(attr.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((i: any) => i.variantId && i.inventoryItemId && typeof i.quantity === 'number' && i.quantity > 0);
  } catch {
    return [];
  }
}

// ─── Pre-Order Oversell Check ────────────────────────────────────────────────

export async function checkInventoryAvailability(
  shop: string,
  items: InventoryLineItem[]
): Promise<{ allowed: boolean; reason?: string }> {
  if (items.length === 0) return { allowed: true };

  try {
    const { admin } = await unauthenticated.admin(shop);
    const graphql = admin.graphql;

    for (const item of items) {
      if (item.tracked === false) {
        console.log(`[InventorySync] Skipping inventory check for ${item.variantId} (untracked)`);
        continue;
      }
      if (item.inventoryPolicy === 'CONTINUE') {
        console.log(`[InventorySync] Skipping inventory check for ${item.variantId} (continue selling when out of stock)`);
        continue;
      }

      const levels = await fetchInventoryLevels(graphql, item.inventoryItemId);
      const totalAvailable = levels.reduce((sum, l) => sum + Math.max(0, l.available), 0);

      const { data: reservations } = await supabase
        .from('inventory_reservations')
        .select('quantity')
        .eq('variant_id', item.variantId)
        .gt('expires_at', new Date().toISOString());

      const reservedQty = (reservations || []).reduce(
        (sum: number, r: any) => sum + (r.quantity || 0),
        0
      );

      const effectiveAvailable = totalAvailable - reservedQty;

      fsLog(`[INV CHECK] ${JSON.stringify({
        variantId: item.variantId,
        tracked: item.tracked,
        inventoryPolicy: item.inventoryPolicy,
        shopifyAvailable: totalAvailable,
        activeReservations: reservedQty,
        effectiveAvailable
      })}`);

      if (effectiveAvailable < item.quantity) {
        console.warn(
          `[InventorySync] Insufficient stock for ${item.variantId}: need ${item.quantity}, effective available ${effectiveAvailable}`
        );
        return {
          allowed: false,
          reason: `Insufficient inventory for "${item.title}". Only ${Math.max(0, effectiveAvailable)} available.`,
        };
      }
    }

    return { allowed: true };
  } catch (err: any) {
    console.error('[InventorySync] Inventory check error (allowing order):', err.message);
    return { allowed: true };
  }
}

// ─── Lifecycle Functions ──────────────────────────────────────────────────────

function fsLog(msg: string) {
  console.log(`[InventorySync Log] ${msg}`);
  try {
    fs.appendFileSync('/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/scratch-log.txt', `[${new Date().toISOString()}] ${msg}\n`);
  } catch(e) {}
}

export async function deductInventory(shop: string, orderId: string, items: InventoryLineItem[]) {
  fsLog(`[INV DEDUCT START] ${JSON.stringify({ orderId, items: items.map(i => ({ variantId: i.variantId, quantity: i.quantity })) })}`);
  if (items.length === 0) return;
  try {
    const { admin } = await unauthenticated.admin(shop);
    const graphql = admin.graphql;

    for (const item of items) {
      if (item.tracked === false) continue;
      
      const isReserved = await tryReserveInventoryEvent(shop, orderId, item.variantId, 'deduct', item.quantity);
      if (!isReserved) continue; // Skip duplicate

      fsLog(`[FETCH LEVELS] ${item.inventoryItemId}`);
      const levels = await fetchInventoryLevels(graphql, item.inventoryItemId);
      let remainingToReserve = item.quantity;
      
      // Allocate starting from highest available
      for (const level of levels) {
        if (remainingToReserve <= 0) break;
        const allocateQty = Math.min(remainingToReserve, level.available > 0 ? level.available : remainingToReserve);
        if (allocateQty <= 0) continue;
        
        fsLog(`Order ${orderId}: Deducting ${allocateQty} of ${item.variantId} at ${level.locationId}`);
        fsLog(`[BEFORE] Available: ${level.available}`);
        
        // Adjust available negatively
        await applyInventoryDelta(graphql, item.inventoryItemId, level.locationId, -allocateQty, 'reservation_created');
        
        const { error, data } = await supabase.from('order_inventory_reservations').upsert({
          order_id: orderId,
          variant_id: item.variantId,
          inventory_item_id: item.inventoryItemId,
          location_id: level.locationId,
          quantity: allocateQty,
          deducted: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'order_id,variant_id,location_id' }).select().single();
        
        if (error) {
           fsLog(`[ERROR] DB Insert failed: ${error.message}`);
        } else {
           fsLog(`[DB INSERT] ${JSON.stringify(data)}`);
        }
        
        remainingToReserve -= allocateQty;
      }
      
      // If still some remaining (overselling), deduct from the first location
      if (remainingToReserve > 0 && levels.length > 0) {
        const loc = levels[0].locationId;
        fsLog(`Order ${orderId}: Overselling ${remainingToReserve} of ${item.variantId} at ${loc}`);
        
        await applyInventoryDelta(graphql, item.inventoryItemId, loc, -remainingToReserve, 'reservation_created');
        
        const { data: existing } = await supabase
          .from('order_inventory_reservations')
          .select('quantity')
          .eq('order_id', orderId).eq('variant_id', item.variantId).eq('location_id', loc)
          .maybeSingle();
        
        const { data } = await supabase.from('order_inventory_reservations').upsert({
          order_id: orderId,
          variant_id: item.variantId,
          inventory_item_id: item.inventoryItemId,
          location_id: loc,
          quantity: (existing?.quantity || 0) + remainingToReserve,
          deducted: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'order_id,variant_id,location_id' }).select().single();
        
        fsLog(`[DB INSERT OVERSELL] ${JSON.stringify(data)}`);
      }
    }
  } catch (err: any) {
    fsLog(`[ERROR] Exception in deductInventory: ${err.message}`);
    throw err;
  }
}

export async function fulfillInventory(shop: string, orderId: string, items: { variantId: string; quantity: number, tracked?: boolean }[]) {
  fsLog(`[FULFILL START] ${JSON.stringify({ orderId, items })}`);
  if (items.length === 0) return;
  try {
    for (const item of items) {
      if (item.tracked === false) continue;
      
      const isFulfill = await tryReserveInventoryEvent(shop, orderId, item.variantId, 'fulfill', item.quantity);
      if (!isFulfill) continue;
      
      const { data: reservations } = await supabase
        .from('order_inventory_reservations')
        .select('*')
        .eq('order_id', orderId)
        .eq('variant_id', item.variantId);
      
      if (!reservations || reservations.length === 0) continue;

      let remainingToFulfill = item.quantity;
      for (const res of reservations) {
        if (remainingToFulfill <= 0) break;
        const unfulfilled = res.quantity - res.fulfilled_quantity - res.cancelled_quantity;
        if (unfulfilled <= 0) continue;
        
        const allocateFulfill = Math.min(remainingToFulfill, unfulfilled);
        
        console.log(`[InventorySync] Order ${orderId}: Fulfilling ${allocateFulfill} of ${item.variantId} at ${res.location_id}`);
        fsLog(`[FULFILL] ${JSON.stringify({ locationId: res.location_id, quantity: allocateFulfill })}`);
        
        // DO NOT TOUCH SHOPIFY INVENTORY. FoxlyCOD DB is the source of truth!
        const { data } = await supabase
          .from('order_inventory_reservations')
          .update({
            fulfilled_quantity: res.fulfilled_quantity + allocateFulfill,
            updated_at: new Date().toISOString()
          })
          .eq('id', res.id).select().single();
        fsLog(`[DB UPDATE] ${JSON.stringify(data)}`);
        remainingToFulfill -= allocateFulfill;
      }
    }
  } catch (err: any) {
    fsLog(`[ERROR] Exception in fulfillInventory: ${err.message}`);
  }
}

export async function cancelInventory(shop: string, orderId: string, items?: { variantId: string, tracked?: boolean }[]) {
  fsLog(`[CANCEL START] orderId: ${orderId}`);
  try {
    const { admin } = await unauthenticated.admin(shop);
    const graphql = admin.graphql;

    const { data: reservations } = await supabase
      .from('order_inventory_reservations')
      .select('*')
      .eq('order_id', orderId);
    
    if (!reservations || reservations.length === 0) return;

    for (const res of reservations) {
      if (items && items.find(i => i.variantId === res.variant_id)?.tracked === false) continue;
      
      const restore = res.quantity - res.fulfilled_quantity - res.cancelled_quantity;
      if (restore > 0) {
        const isCancel = await tryReserveInventoryEvent(shop, orderId, res.variant_id, 'cancel', restore);
        if (!isCancel) continue;
        
        console.log(`[InventorySync] Order ${orderId}: Cancelling ${restore} of ${res.variant_id} at ${res.location_id}`);
        
        // Restore available!
        await applyInventoryDelta(graphql, res.inventory_item_id, res.location_id, +restore, 'reservation_deleted');
        
        const { data } = await supabase
          .from('order_inventory_reservations')
          .update({
            cancelled_quantity: res.cancelled_quantity + restore,
            updated_at: new Date().toISOString()
          })
          .eq('id', res.id).select().single();
        fsLog(`[DB UPDATE CANCEL] ${JSON.stringify(data)}`);
      }
    }
  } catch (err: any) {
    fsLog(`[ERROR] Exception in cancelInventory: ${err.message}`);
  }
}

export async function refundInventory(shop: string, orderId: string, refundedItems: { variantId: string; quantity: number, restock: boolean, tracked?: boolean }[]) {
  fsLog(`[REFUND START] orderId: ${orderId}, lineItems: ${JSON.stringify(refundedItems)}`);
  if (refundedItems.length === 0) return;
  try {
    const { admin } = await unauthenticated.admin(shop);
    const graphql = admin.graphql;

    const { data: reservations } = await supabase
      .from('order_inventory_reservations')
      .select('*')
      .eq('order_id', orderId);
    
    if (!reservations || reservations.length === 0) return;

    for (const rItem of refundedItems) {
      if (rItem.tracked === false) continue;
      let remainingToRefund = rItem.quantity;
      
      const isRefund = await tryReserveInventoryEvent(shop, orderId, rItem.variantId, 'refund', rItem.quantity);
      if (!isRefund) continue;
      
      const itemReservations = reservations.filter((r: any) => r.variant_id === rItem.variantId);
      for (const res of itemReservations) {
        if (remainingToRefund <= 0) break;
        const unrefunded = res.fulfilled_quantity - res.refunded_quantity;
        if (unrefunded <= 0) continue;
        
        const allocateRefund = Math.min(remainingToRefund, unrefunded);
        
        console.log(`[InventorySync] Order ${orderId}: Refunding ${allocateRefund} of ${rItem.variantId} at ${res.location_id}`);
        
        if (rItem.restock) {
           await applyInventoryDelta(graphql, res.inventory_item_id, res.location_id, +allocateRefund, 'restock');
        }
        
        const { data } = await supabase
          .from('order_inventory_reservations')
          .update({
            refunded_quantity: res.refunded_quantity + allocateRefund,
            updated_at: new Date().toISOString()
          })
          .eq('id', res.id).select().single();
        fsLog(`[DB UPDATE REFUND] ${JSON.stringify(data)}`);
        remainingToRefund -= allocateRefund;
      }
    }
  } catch (err: any) {
    fsLog(`[ERROR] Exception in refundInventory: ${err.message}`);
  }
}

export async function editInventory(shop: string, orderId: string, newItems: Array<{variantId: string, quantity: number, inventoryItemId: string}>) {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const graphql = admin.graphql;

    const { data: reservations } = await supabase
      .from('order_inventory_reservations')
      .select('*')
      .eq('order_id', orderId);
    
    fsLog(`[INV EDIT] ${JSON.stringify({ orderId, previousReservations: reservations, newLineItems: newItems })}`);
    if (!reservations) return;

    // Check idempotency for edit (sum of all new item quantities)
    const totalNewQty = newItems.reduce((acc, i) => acc + i.quantity, 0);
    const isEdit = await tryReserveInventoryEvent(shop, orderId, 'all_items', 'edit', totalNewQty);
    if (!isEdit) return;

    const resByVariant = reservations.reduce((acc: any, res: any) => {
      acc[res.variant_id] = acc[res.variant_id] || { totalReserved: 0, items: [] };
      acc[res.variant_id].totalReserved += res.quantity;
      acc[res.variant_id].items.push(res);
      return acc;
    }, {});

    const newByVariant = newItems.reduce((acc: any, item: any) => {
      acc[item.variantId] = acc[item.variantId] || { quantity: 0, inventoryItemId: item.inventoryItemId };
      acc[item.variantId].quantity += item.quantity;
      return acc;
    }, {});

    for (const [variantId, newItem] of Object.entries<any>(newByVariant)) {
      const existing = resByVariant[variantId];
      const oldQty = existing ? existing.totalReserved : 0;
      const newQty = newItem.quantity;

      if (newQty > oldQty) {
        const difference = newQty - oldQty;
        console.log(`[InventorySync] Order ${orderId}: Increasing reservation for ${variantId} by ${difference}`);
        fsLog(`[INV DELTA INCREASE] variantId: ${variantId}, difference: ${difference}`);
        
        let targetLocationId = existing && existing.items.length > 0 ? existing.items[0].location_id : null;
        if (!targetLocationId) {
          const levels = await fetchInventoryLevels(graphql, newItem.inventoryItemId);
          if (levels.length > 0) targetLocationId = levels[0].locationId;
        }

        if (targetLocationId) {
          await applyInventoryDelta(graphql, newItem.inventoryItemId, targetLocationId, -difference, 'correction');
          
          const existingRes = existing?.items.find((i: any) => i.location_id === targetLocationId);
          await supabase.from('order_inventory_reservations').upsert({
            order_id: orderId,
            variant_id: variantId,
            inventory_item_id: newItem.inventoryItemId,
            location_id: targetLocationId,
            quantity: (existingRes?.quantity || 0) + difference,
            deducted: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'order_id,variant_id,location_id' });
        }
      } else if (newQty < oldQty && existing) {
        let remainingToRelease = oldQty - newQty;
        console.log(`[InventorySync] Order ${orderId}: Decreasing reservation for ${variantId} by ${remainingToRelease}`);
        fsLog(`[INV DELTA DECREASE] variantId: ${variantId}, difference: ${remainingToRelease}`);
        
        for (const res of existing.items) {
          if (remainingToRelease <= 0) break;
          const availableToRelease = res.quantity - res.fulfilled_quantity - res.cancelled_quantity;
          const releaseQty = Math.min(remainingToRelease, availableToRelease);
          
          if (releaseQty > 0) {
            await applyInventoryDelta(graphql, res.inventory_item_id, res.location_id, +releaseQty, 'correction');
            
            await supabase.from('order_inventory_reservations').update({
              quantity: res.quantity - releaseQty,
              updated_at: new Date().toISOString()
            }).eq('id', res.id);
            remainingToRelease -= releaseQty;
          }
        }
      }
    }

    for (const [variantId, existing] of Object.entries<any>(resByVariant)) {
      if (!newByVariant[variantId]) {
        let remainingToRelease = existing.totalReserved;
        console.log(`[InventorySync] Order ${orderId}: Variant ${variantId} removed. Releasing ${remainingToRelease}`);
        fsLog(`[INV DELTA DECREASE] variantId: ${variantId}, difference: ${remainingToRelease}`);
        
        for (const res of existing.items) {
          if (remainingToRelease <= 0) break;
          const availableToRelease = res.quantity - res.fulfilled_quantity - res.cancelled_quantity;
          const releaseQty = Math.min(remainingToRelease, availableToRelease);
          
          if (releaseQty > 0) {
            await applyInventoryDelta(graphql, res.inventory_item_id, res.location_id, +releaseQty, 'correction');
            
            await supabase.from('order_inventory_reservations').update({
              quantity: res.quantity - releaseQty,
              updated_at: new Date().toISOString()
            }).eq('id', res.id);
            remainingToRelease -= releaseQty;
          }
        }
      }
    }
  } catch (err: any) {
    fsLog(`[ERROR] Exception in editInventory: ${err.message}`);
  }
}
export async function buildInventoryMetadata(
  shop: string,
  lineItems: Array<{ variantId?: string | number | null; title?: string; quantity: number; sku?: string; }>
): Promise<InventoryLineItem[]> {
  const variantItems = lineItems.filter(i => i.variantId != null && String(i.variantId).replace(/\D/g, '') !== '');
  if (variantItems.length === 0) return [];
  try {
    const { admin } = await unauthenticated.admin(shop);
    const graphql = admin.graphql;
    const metadataItems: InventoryLineItem[] = [];
    for (const item of variantItems) {
      const numericId = String(item.variantId).replace(/\D/g, '');
      const gid = `gid://shopify/ProductVariant/${numericId}`;
      try {
        const res = await graphql(
          `query getVariantInventory($id: ID!) { productVariant(id: $id) { id sku inventoryPolicy inventoryItem { id tracked } } }`,
          { variables: { id: gid } }
        );
        const data = await res.json();
        const variant = data?.data?.productVariant;
        if (variant?.inventoryItem?.id) {
          metadataItems.push({
            variantId: gid,
            inventoryItemId: variant.inventoryItem.id,
            quantity: item.quantity,
            title: item.title || `Variant ${numericId}`,
            sku: item.sku || variant.sku || undefined,
            tracked: variant.inventoryItem.tracked,
            inventoryPolicy: variant.inventoryPolicy,
          });
        }
      } catch (err: any) { }
    }
    return metadataItems;
  } catch (err: any) {
    return [];
  }
}
