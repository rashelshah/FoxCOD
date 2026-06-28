/**
 * FoxlyCOD Inventory Reservation Service
 *
 * Provides a short-lived reservation lock to prevent race conditions when two
 * customers submit a COD form at the same time for the same limited-stock product.
 *
 * Flow:
 *   1. Customer submits form
 *   2. acquireReservation() — creates a 120-second lock in inventory_reservations
 *   3. Inventory check passes (reservation is counted as "consumed" stock)
 *   4. orderCreate succeeds
 *   5. releaseReservation() — removes the lock (inventory sync webhook will do real deduction)
 *   6. If orderCreate fails or times out, the reservation auto-expires after 120s
 *
 * Expired reservations are cleaned up by Shopify's cron endpoint (api.retry-failed-orders).
 */

import { supabase } from '../config/supabase.server';

export interface ReservationHandle {
  reservationId: string;
  variantId: string;
  quantity: number;
  expiresAt: string;
}

// Reservation TTL in seconds (must be longer than the full order creation timeout)
const RESERVATION_TTL_SECONDS = 120;

/**
 * Acquire inventory reservation locks for all variants in an order.
 * If any lock fails (another reservation exists that would push stock negative),
 * all locks already created are rolled back.
 *
 * Returns the reservation IDs on success, or null if acquisition failed.
 */
export async function acquireReservations(
  orderReference: string,
  items: Array<{ variantId: string; quantity: number }>
): Promise<ReservationHandle[] | null> {
  if (items.length === 0) return [];

  const expiresAt = new Date(Date.now() + RESERVATION_TTL_SECONDS * 1000).toISOString();
  const handles: ReservationHandle[] = [];

  for (const item of items) {
    const { data, error } = await supabase
      .from('inventory_reservations')
      .insert({
        variant_id: item.variantId,
        quantity: item.quantity,
        order_reference: orderReference,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[Reservation] Failed to acquire reservation for', item.variantId, error);
      // Roll back all reservations created so far
      if (handles.length > 0) {
        const ids = handles.map((h) => h.reservationId);
        await supabase.from('inventory_reservations').delete().in('id', ids);
      }
      return null;
    }

    handles.push({
      reservationId: data.id,
      variantId: item.variantId,
      quantity: item.quantity,
      expiresAt,
    });
  }

  return handles;
}

/**
 * Release all reservation locks for a given order reference.
 * Called after orderCreate succeeds or fails — the webhook handles real deduction.
 */
export async function releaseReservations(orderReference: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_reservations')
    .delete()
    .eq('order_reference', orderReference);

  if (error) {
    console.error('[Reservation] Failed to release reservations for', orderReference, error);
  } else {
    console.log('[Reservation] Released reservations for', orderReference);
  }
}

/**
 * Clean up expired reservations (older than TTL).
 * Safe to call from any background job or cron endpoint.
 */
export async function cleanExpiredReservations(): Promise<number> {
  const { data, error } = await supabase
    .from('inventory_reservations')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('[Reservation] Failed to clean expired reservations:', error);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[Reservation] Cleaned ${count} expired reservation(s)`);
  }
  return count;
}

/**
 * Get the total reserved quantity for a variant (from non-expired reservations).
 * Used by checkInventoryAvailability in inventory-sync.server.ts.
 */
export async function getReservedQuantity(variantId: string): Promise<number> {
  const { data } = await supabase
    .from('inventory_reservations')
    .select('quantity')
    .eq('variant_id', variantId)
    .gt('expires_at', new Date().toISOString());

  return (data || []).reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);
}
