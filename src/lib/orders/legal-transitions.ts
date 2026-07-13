// src/lib/orders/legal-transitions.ts
// D-08: single transition allowlist over the 8-value order_status enum, shared by the
// admin Server Action (src/lib/actions/admin-orders.ts) and the admin UI (Plan 06).
//
// IMPORTANT: this lives OUTSIDE any "use server" module on purpose. Next.js requires
// every export from a "use server" file to be an async function (Server Actions must
// be async) — getValidNextStatuses is a plain synchronous helper the UI calls directly
// from a Server Component, so it cannot be exported from admin-orders.ts itself
// (surfaced as a webpack build failure the first time a consumer imported it: "Server
// Actions must be async functions"). Keeping the allowlist here and having
// admin-orders.ts import it keeps a single source of truth without violating that
// constraint. Do NOT diverge this graph from admin-orders.ts's usage without updating
// both 05-RESEARCH.md and 05-PATTERNS.md.

// Owner decision (2026-07-13): once an order is paid, the admin may move it to ANY
// fulfillment status directly (e.g. processing -> delivered) — no forced one-step-at-a-time.
// Payment-critical transitions stay guarded: reaching payment_confirmed only ever happens via
// confirmOrderPaid (gateway webhook/verify or the bank-transfer admin confirm), never a free
// manual set, because that path performs the atomic stock decrement.
const PAID_FULFILLMENT = ["processing", "shipped", "delivered", "cancelled"]

export const LEGAL_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  awaiting_bank_transfer: ["payment_confirmed", "cancelled"],
  // Paid states can move freely between fulfillment stages (self excluded per-row below).
  payment_confirmed: PAID_FULFILLMENT,
  processing: ["shipped", "delivered", "cancelled"],
  shipped: ["processing", "delivered", "cancelled"],
  delivered: ["processing", "shipped", "cancelled"],
  cancelled: [],
  payment_failed: [],
}

/** Returns the legal next statuses for a given current status — used by the UI to render the
 * available transition choices. Once paid, this is the full fulfillment set (minus the current
 * status), so the admin can jump straight to the desired stage. */
export function getValidNextStatuses(currentStatus: string): string[] {
  return LEGAL_TRANSITIONS[currentStatus] ?? []
}
