# Phase 6: Customer Accounts - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** `--auto` (autonomous — Claude selected recommended defaults for every gray area; review before planning)

<domain>
## Phase Boundary

A **logged-in customer** gets added value from having an account: they can **view their past
orders**. Accounts are never on the critical path to a first sale (guest checkout stays intact);
this phase only adds the post-sale history surface.

Delivers **AUTH-04** and the 3 ROADMAP success criteria:
1. A logged-in customer can view a **list of their past orders** with status and totals.
2. A customer can open an **individual past order** and see its line items, variant labels,
   shipping address, and **final total as captured at purchase time** (the `order_item`
   price-at-purchase snapshot from Phase 4).
3. The order-history surface is protected by **both `proxy.ts` redirect AND an in-action/in-page
   `verifySession()` check** (dual-layer, CLAUDE.md).

**Also in scope (explicitly deferred here from Phase 4 D-03):**
- **Guest-order → account linking.** The confirmation page's `PostPurchaseAccountOffer` links to
  `/account/register?orderToken=<token>`, and its code comment states *"The /account/register
  page in Phase 6 reads the orderToken query param to link the order."* Phase 6 completes that
  loop so a just-placed guest order shows up in the new account's history.

**Out of scope (other phases / v2):**
- Editing profile, saved addresses, password change, wishlists, re-order — v2 (not in AUTH-04 or
  PROJECT.md scope).
- Admin order views (Phase 5, done). This is the **customer** surface.
- Bulk retro-claiming of ALL historical guest orders by email — only the single token-identified
  order is claimed at registration (email-based bulk claim is higher-risk; deferred).

</domain>

<decisions>
## Implementation Decisions

> All decisions below were **auto-selected** (recommended defaults) under `--auto`. Locked for
> planning unless overridden. Each is a HOW choice within the fixed AUTH-04 scope.

### Order-history list (SC1)
- **D-01:** Order history lives at **`/account/orders`** (the existing Phase 1 stub — grow it).
  Render a **list of order cards**, newest first, each showing: order **reference** (`MS-XXXXXX`),
  date, **status badge** (reuse `OrderStatusBadge` from Phase 5 `src/components/admin/`), item
  count, and **total** (`formatNGN`). Each card links to its detail page.
- **D-02:** **Empty state** — when the user has no orders, show a friendly "No orders yet" card
  with a link to browse products (`/`), consistent with the cart empty-state pattern.

### Order detail (SC2) — IDOR-safe
- **D-03:** Order detail at **`/account/orders/[id]`**, an authenticated route **scoped to the
  session user**. Reuse **`OrderSummaryLines`** + **`ShippingAddressBlock`** verbatim (the same
  components the guest `/order/[token]` page and the admin order-detail use). Show line items with
  variant labels, shipping-address snapshot, payment method, and the **final total as captured at
  purchase** (from `order`/`order_item` snapshots — never recomputed).
- **D-04 (SECURITY — the core of this phase):** All customer order reads are **scoped by the
  session `userId`**, never a client-supplied id. `/account/orders/[id]` loads the order **only if
  `order.userId === session.user.id`**; otherwise **404** (not 403 — do not reveal existence). No
  IDOR: a customer can never see another user's order by guessing an id.

### User-scoped queries (SC1/SC2)
- **D-05:** Add to `src/lib/orders/queries.ts` (mirroring the existing `getOrderByToken` shape):
  - `listOrdersForUser(userId: string)` — orders where `userId` matches, newest first, with the
    columns the list cards need (reference, createdAt, status, totalKobo, item count).
  - `getOrderForUser(userId: string, orderId: string)` — single order **with items + shipping
    snapshot**, returning null unless it belongs to `userId`. Uses the existing `order_user_idx`.
  Both take `userId` from the **verified session only** (passed by the page after `verifySession()`),
  never from the URL/body.

### Guest-order → account linking (Phase 4 D-03 follow-through)
- **D-06:** When a guest registers via **`/account/register?orderToken=<token>`**, after the account
  is created, **link that one order to the new user**: `UPDATE orders SET userId = <newUserId>
  WHERE guestToken = <token> AND userId IS NULL` (claim only an **unclaimed guest** order; never
  reassign an order already owned by someone). Scope = the **single token-identified order** only.
  The register page/action reads `orderToken` from `searchParams` and passes it through; the claim
  runs server-side in (or right after) the `register` action. If the token is missing/invalid/already
  claimed, registration still succeeds — the link is best-effort, never blocking.
  - *(Planner: confirm the exact `register()` signature in `src/lib/actions/auth.ts` and thread the
    optional `orderToken` through without breaking existing callers/tests.)*

### Account shell / navigation
- **D-07:** Keep it **minimal** (accounts off the critical path). `/account` is a lightweight
  landing showing the signed-in email, a **logout** control, and a link to **Order history**.
  `/account/orders` is the primary surface. Reuse the existing site header/auth patterns and the
  indigo system. No new nav framework.

### Caching / rendering
- **D-08:** Order history and detail are **per-user dynamic data** — **no `'use cache'`**. Follow
  the established `cacheComponents`/PPR pattern: `verifySession()` + the user-scoped DB read run
  inside a `Suspense` boundary (mirror the existing `/account/orders` stub and `getCartCount`
  CartShell pattern), so static prerender of other routes isn't broken.

### Claude's Discretion
- Exact column selection / join shape for `listOrdersForUser` (item-count via subquery vs join).
- Whether `/account` is a distinct page or a redirect to `/account/orders` (either is fine; lean to
  a minimal landing page with the logout + link).
- Whether a **logged-in** user hitting `/account/register?orderToken=` (or a `login?orderToken=`)
  path should also trigger the claim — nice-to-have; the registration-time claim (D-06) is the
  required path. Planner may add a symmetric login-time claim if cheap.
- Pagination of order history (likely unnecessary for v1 volume; add a simple limit if desired).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 6: Customer Accounts" — goal, dependencies (Phase 1 session,
  Phase 4 order records), the 3 success criteria.
- `.planning/REQUIREMENTS.md` — **AUTH-04** (logged-in user views order history).
- `.planning/PROJECT.md` — accounts are OFF the critical path to first sale; guest checkout intact.

### Cross-phase constraints (MUST honor)
- `CLAUDE.md` §"Critical Constraints" — **`proxy.ts` cannot protect Server Actions/Components;
  re-verify with `verifySession()`** in every protected surface (SC3, dual-layer). Never trust
  client-supplied identifiers (the userId scoping in D-04/D-05).
- `.planning/STATE.md` §"Accumulated Context" — `next/cache` mock in Server Action tests;
  vitest `fileParallelism=false`; integration tests gated on `TEST_DATABASE_URL` (set here);
  `cacheComponents` PPR requires dynamic/session reads inside Suspense.
- `CLAUDE.md` §"Testing" — DB integration tests need the separate `TEST_DATABASE_URL` branch.

### Prior-phase decisions this phase builds on
- `.planning/phases/04-checkout-payments/04-CONTEXT.md` — **D-03** (post-purchase account offer →
  `register?orderToken=`, the linking this phase completes), **D-12** (guest token), order/
  `order_item` **price-at-purchase snapshot** (SC2 "final total as captured at purchase"),
  `orders.userId` set from session for logged-in checkout.
- `.planning/phases/05-admin-panel/05-CONTEXT.md` + summaries — `OrderStatusBadge`, admin
  `getOrderForAdmin`/`listOrdersForAdmin` (analogs for the user-scoped versions), shared order
  components reuse pattern.
- `.planning/phases/01-foundation/01-CONTEXT.md` — Auth.js v5 session (D-08 jwt+DB), `verifySession()`
  in `src/lib/dal.ts`, `proxy.ts` `/account/*` protection.

### Existing code to extend / wire
- `src/app/account/orders/page.tsx` — the stub to grow into the order-history list (already has
  `verifySession()`-first dual-auth inside Suspense).
- `src/lib/dal.ts` — `verifySession()` (returns the session user; source of the scoping `userId`).
- `src/lib/orders/queries.ts` — add `listOrdersForUser` / `getOrderForUser` (mirror `getOrderByToken`;
  `order_user_idx` exists on `orders.userId`).
- `src/components/order/OrderSummaryLines.tsx`, `ShippingAddressBlock.tsx` — reuse verbatim in
  `/account/orders/[id]`. `PostPurchaseAccountOffer.tsx` — its `register?orderToken=` link is the
  D-06 entry point.
- `src/components/admin/OrderStatusBadge.tsx` — reuse for the list status badges.
- `src/lib/actions/auth.ts` — `register()` (thread optional `orderToken` claim, D-06).
- `src/app/(auth)/account/register/page.tsx` — reads `orderToken` from `searchParams` (async, Next 16).
- `src/lib/catalog/format.ts` `formatNGN` — totals in the list/detail.
- `src/proxy.ts` — already redirects unauth on `/account/*` (SC3 layer 1).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`/account/orders` stub** with `verifySession()`-first inside Suspense — the dual-auth + PPR
  skeleton is already correct; just fill in the data + UI.
- **Shared order components** (`OrderSummaryLines`, `ShippingAddressBlock`) — the exact detail-view
  building blocks, already used by the guest confirmation page and admin detail.
- **`OrderStatusBadge`** (Phase 5) — accessible icon+text status badges for the 8 order states.
- **`getOrderByToken` / admin `getOrderForAdmin`** — query analogs to mirror for the user-scoped
  versions (`order_user_idx` already indexes `orders.userId`).
- **`verifySession()`**, `formatNGN`, indigo tokens, `react-hook-form`/`zod` (register), `next/cache`
  test-mock + `TEST_DATABASE_URL` integration pattern.

### Established Patterns
- Dual-auth: `proxy.ts` redirect + `verifySession()` re-check (SC3).
- IDOR-safety: scope every read by the verified session id, never a client-supplied id (D-04).
- `cacheComponents`/PPR: session + per-user reads inside Suspense, no `'use cache'` on dynamic data.
- Price-at-purchase is snapshotted on `order`/`order_item` — read it, never recompute (SC2).

### Integration Points
- New `/account/orders/[id]` route + `/account` landing; grow the `/account/orders` list.
- New `listOrdersForUser` / `getOrderForUser` in `src/lib/orders/queries.ts`.
- `register()` gains an optional best-effort `orderToken` claim (D-06) — no schema change
  (`orders.userId` already exists and is nullable).

</code_context>

<specifics>
## Specific Ideas

- Order history should feel like a simple, scannable list of receipts — reference, date, a clear
  status badge, and total — tapping one opens the full order exactly as it looked at purchase.
- Registering right after a guest purchase should "just work": the order you just placed is already
  in your history because the `orderToken` claimed it.
- No new account surface area beyond history — accounts stay a lightweight, off-critical-path add-on.

</specifics>

<deferred>
## Deferred Ideas

- Profile editing, password change, saved/default addresses, wishlists, one-click re-order → v2.
- Bulk retro-claim of ALL past guest orders by matching email at registration → deferred (only the
  single `orderToken` order is claimed; email-based bulk claim risks mis-linking).
- Order-history pagination/search/filtering → add only if v1 volume warrants (Claude's discretion).
- Email notifications for account events → out of scope.

### Reviewed Todos (not folded)

None — no pending todos matched this phase.

</deferred>

---

*Phase: 06-customer-accounts*
*Context gathered: 2026-07-09*
