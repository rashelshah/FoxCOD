/**
 * Shared constants for the COD app
 * This file can be imported by both client and server code
 */

// Order status types
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'returned' | 'cancelled';

export const ORDER_STATUSES: { value: OrderStatus; label: string; color: string }[] = [
    { value: 'pending', label: 'Pending', color: '#f59e0b' },
    { value: 'confirmed', label: 'Confirmed', color: '#3b82f6' },
    { value: 'shipped', label: 'Shipped', color: '#8b5cf6' },
    { value: 'delivered', label: 'Delivered', color: '#10b981' },
    { value: 'returned', label: 'Returned', color: '#ef4444' },
    { value: 'cancelled', label: 'Cancelled', color: '#6b7280' },
];
