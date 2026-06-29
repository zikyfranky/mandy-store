import "server-only"
// src/lib/orders/shipping.ts — flat-rate shipping (CHKT-03, D-15)

/** Flat shipping in kobo. Default 200000 kobo = ₦2,000. Server-only — never trusted from client. */
export const FLAT_SHIPPING_KOBO = parseInt(process.env.FLAT_SHIPPING_KOBO ?? "200000", 10)

export type OrderTotals = { subtotalKobo: number; shippingKobo: number; totalKobo: number }

/** Compute the order total server-side: subtotal + flat shipping (CHKT-03/04, never client-supplied). */
export function computeOrderTotal(input: { subtotalKobo: number }): OrderTotals {
  const shippingKobo = FLAT_SHIPPING_KOBO
  return {
    subtotalKobo: input.subtotalKobo,
    shippingKobo,
    totalKobo: input.subtotalKobo + shippingKobo,
  }
}
