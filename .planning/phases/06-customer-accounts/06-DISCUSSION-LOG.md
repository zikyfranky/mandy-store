# Phase 6: Customer Accounts - Discussion Log

> **Audit trail only.** Not consumed by downstream agents (they read CONTEXT.md).

**Date:** 2026-07-09
**Phase:** 6-customer-accounts
**Mode:** `--auto` (no interactive questions — recommended option auto-selected per gray area)
**Areas discussed:** Order-history list, Order detail (IDOR-scoped), User-scoped queries, Guest-order claiming, Account shell/nav, Empty state, Caching

---

## Order-history list (SC1)

| Option | Description | Selected |
|--------|-------------|----------|
| `/account/orders` list of order cards (ref/date/status badge/total), newest first | Grows existing stub; reuses OrderStatusBadge | ✓ |
| Table layout | Heavier; cards read better for receipts | |

**Auto choice:** Order cards at `/account/orders`, reusing Phase 5 `OrderStatusBadge` (D-01); empty state with browse link (D-02).

---

## Order detail (SC2) — IDOR-safety

| Option | Description | Selected |
|--------|-------------|----------|
| `/account/orders/[id]` scoped by session userId (404 if not owned); reuse OrderSummaryLines + ShippingAddressBlock | IDOR-safe, reuses shared components + price snapshot | ✓ |
| Reuse the guest `/order/[token]` page | Guest-oriented; token is not the account model | |

**Auto choice:** Authenticated `/account/orders/[id]`, load only if `order.userId === session.user.id` else 404 (D-03/D-04). Show price-at-purchase snapshot, never recompute.

---

## User-scoped queries

| Option | Description | Selected |
|--------|-------------|----------|
| `listOrdersForUser(userId)` + `getOrderForUser(userId, id)`, userId from verified session only | Mirrors getOrderByToken; uses order_user_idx | ✓ |
| Reuse admin queries | Admin queries aren't userId-scoped — IDOR risk | |

**Auto choice:** New user-scoped queries in src/lib/orders/queries.ts, session-userId only (D-05).

---

## Guest-order → account claiming (Phase 4 D-03 follow-through)

| Option | Description | Selected |
|--------|-------------|----------|
| At `register?orderToken=`, claim the single token'd unclaimed guest order (set userId), best-effort | Completes the deferred D-03 loop; low risk | ✓ |
| Bulk-claim all past guest orders by email | Higher mis-link risk | |
| Don't wire claiming | Leaves the post-purchase offer dead-ended | |

**Auto choice:** Registration-time claim of the single `orderToken` order, `WHERE guestToken=? AND userId IS NULL`, best-effort/non-blocking (D-06).

---

## Account shell / navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal `/account` landing (email + logout + link to orders); orders at `/account/orders` | Accounts off critical path | ✓ |
| Full account dashboard | Out of scope for AUTH-04 | |

**Auto choice:** Minimal landing + `/account/orders` primary surface (D-07).

---

## Caching / rendering

**Auto choice:** Per-user dynamic data, no `'use cache'`; verifySession + user read inside Suspense (PPR-safe), mirroring the existing stub (D-08).

## Claude's Discretion

- listOrdersForUser column/join shape; `/account` page vs redirect; optional symmetric login-time claim; optional pagination.

## Deferred Ideas

- Profile editing, saved addresses, wishlists, re-order → v2.
- Bulk email-based guest-order claim → deferred.
- Order-history pagination/search → only if volume warrants.
