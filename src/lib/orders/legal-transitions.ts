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

export const LEGAL_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["cancelled"],
  awaiting_bank_transfer: ["payment_confirmed", "cancelled"],
  payment_confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  payment_failed: [],
}

/** Returns the legal next statuses for a given current status — used by the UI (Plan 06) to
 * render only valid transition buttons, never a free-choice dropdown (Pitfall 3). */
export function getValidNextStatuses(currentStatus: string): string[] {
  return LEGAL_TRANSITIONS[currentStatus] ?? []
}
