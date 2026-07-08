# Phase 5: Admin Panel - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning
**Mode:** `--auto` (autonomous — Claude selected recommended defaults for every gray area; review the decisions below before planning)

<domain>
## Phase Boundary

The **store owner** manages the store end-to-end from a protected `/admin` area:

1. **Products (ADMN-01):** add, edit, and delete products, including **image uploads with
   required alt text**.
2. **Variants (ADMN-02):** manage per-product variants, each with its **own price and stock
   level**; any change **immediately expires the Phase 2 catalog cache**.
3. **Orders (ADMN-03):** view all orders, **filter by status**, and move orders through
   fulfillment **only via a shared status-transition function** (never writing the status
   column directly). This includes **manually confirming bank-transfer orders** — the piece
   Phase 4 explicitly deferred here (D-09).
4. **Status emails (ORD-03):** when an order moves to **shipped / delivered**, the customer
   automatically receives a status-change email.
5. **Payment toggles (ADMN-04):** the admin can turn **Stripe / PayPal / bank transfer** on or
   off, enforced server-side in every payment action/route (extends PAY-04), and **every admin
   Server Action re-verifies the admin role** before acting.

Delivers requirements **ADMN-01, ADMN-02, ADMN-03, ADMN-04, ORD-03**.

**Out of scope (other phases / v2):**
- Logged-in **customer** order-history list → Phase 6 (Customer Accounts). This phase is the
  admin/owner surface only.
- Discount codes / promotions, product reviews, wishlists, sales analytics dashboards → v2
  (PROJECT.md Out of Scope).
- Standalone admin toggles for the **NG gateways** (Paystack/Flutterwave/Interswitch/GTPay/
  Remita) are **not required by SC5** — SC5 names Stripe/PayPal/bank transfer only. The NG
  gateways may adopt the same settings mechanism opportunistically, but building admin UI for
  each of them is not a Phase 5 requirement (they remain server-env toggled, default OFF).

</domain>

<decisions>
## Implementation Decisions

> All decisions below were **auto-selected** (recommended defaults) because this session ran
> `--auto`. They are locked for planning unless the user overrides. Each is a HOW choice within
> the fixed phase scope — no new capabilities added.

### Admin shell & authorization (all ADMN reqs, SC5)
- **D-01:** A shared **`/admin` layout with sidebar navigation** — **Products**, **Orders**,
  **Settings** (payment toggles live under Settings). Reuse the existing indigo brand system and
  the admin dashboard stub at `src/app/admin/page.tsx`. Nav collapses responsibly on mobile but
  is desktop-first (owner tool).
- **D-02:** **Dual-layer auth is mandatory and non-negotiable** (SC5, CLAUDE.md): `proxy.ts`
  already redirects unauth/non-admin away from `/admin/*`, **and** `verifyAdminSession()` is
  re-called at the top of the admin layout **and as the first statement of every admin Server
  Action / Route Handler**. `proxy.ts` cannot protect Server Actions — re-verify everywhere.

### Product create/edit/delete (ADMN-01)
- **D-03:** **Image storage = Vercel Blob** (the planned stack choice; not yet installed). Admin
  uploads product images through a server-mediated upload; store the returned blob URL + the
  **required alt text** on `product_image`. **Alt text is validated as required server-side**
  (SC1) — not just a UI hint. *(Planner: confirm `@vercel/blob` version + client-vs-server upload
  token flow; `BLOB_READ_WRITE_TOKEN` is a server-only env var, no `NEXT_PUBLIC_`.)*
- **D-04:** **Product delete = soft delete / deactivate**, not a hard row delete. A deleted
  product is **hidden from the storefront** (catalog queries exclude it) but its rows remain so
  **historical orders keep referring to real variants** and order line-item snapshots stay
  coherent. Rationale: `order_item` snapshots price-at-purchase but still references catalog
  rows; hard-deleting would risk orphaning order history and complicating Phase 6. *(Planner:
  add an `isActive`/`deletedAt` marker to `product` (and cascade the hidden state to its
  variants); update `getCatalog`/`getProduct` to filter it out.)*

### Variant / stock / price management + cache invalidation (ADMN-02)
- **D-05:** Variants are managed **inside the product editor** — each variant row is editable
  with its **own `priceKobo` and `stock`** (prices always in kobo to match `variants.priceKobo`).
  Admin can add/remove variants and their option-value combinations.
- **D-06:** **Every mutating admin action that changes catalog-visible data**
  (product fields, variant price/stock, images) **calls `revalidateTag('product-<slug>')`**
  (and any catalog-list tag) so the Phase 2 cached `ProductContent` expires **immediately**
  (SC2). This is the invalidation hook already stubbed in `src/app/products/[slug]/page.tsx`
  (the `cacheTag('product-<slug>')` comment explicitly names Phase 5). Stock/price on the PDP is
  already dynamic (never cached), so live buyers always see fresh numbers regardless.

### Order management & fulfillment transitions (ADMN-03, ORD-03, D-09)
- **D-07:** **Orders list** shows all orders with a **status filter** (over the 8-value
  `order_status` enum) and links to an **order detail** view (line items, variant labels,
  shipping-address snapshot, totals, payment method, gateway reference).
- **D-08:** **All fulfillment changes go through ONE shared server-side transition function**
  (e.g. `updateOrderStatus(orderId, nextStatus)`), never a raw `UPDATE order SET status`. The
  function validates the transition (guided/constrained over the enum — reject illegal jumps),
  performs the write, and fires side effects (D-10 emails). This is SC3's "shared status
  function" requirement.
- **D-09 (locked — completes Phase 4 D-09):** **Admin manually confirming a bank-transfer
  order** (`awaiting_bank_transfer` → paid) **routes through the existing idempotent
  `confirmOrderPaid()` path** (the one extracted in Phase 7, `src/lib/payments/confirm-order-paid.ts`),
  NOT a bare status set. This is where the **atomic stock decrement for bank transfers finally
  happens** (Phase 4 D-09 deferred it to admin-confirm), reusing the same
  `UPDATE variant SET stock = stock - qty WHERE ... AND stock >= qty RETURNING` guard,
  idempotency key (`bank_transfer:<order-ref>` or equivalent), oversold-refund/last-unit-race
  recovery, and confirmation email. **No new payment plumbing — reuse the shared path.**

### Status-change emails (ORD-03)
- **D-10:** The shared transition function (D-08) sends a **status-change email on `shipped` and
  `delivered` only** (SC4) — not on every transition (avoids notification noise; internal states
  like `processing` don't email the customer). Reuse the **Resend seam** (`src/lib/email/`) +
  a new **React Email template** (`src/emails/`), modeled on the existing order-confirmation
  email. Send **non-blocking** (same pattern as ORD-01 in the Stripe webhook) so a mail failure
  never blocks the status update.

### Payment-method toggles (ADMN-04, SC5)
- **D-11 (locked — the phase's biggest design decision):** Payment methods become **DB-backed,
  live-toggleable** via a small **`store_settings`** table (one row per method, boolean `enabled`).
  The admin flips them from the **Settings** page and the change takes effect **immediately** —
  no redeploy. **Secrets never move into the DB or UI.** A method is treated as enabled **only
  when BOTH (a) its `store_settings.enabled` flag is true AND (b) its credentials are present in
  server-only env** — so `isPaymentMethodEnabled` becomes the single gate combining the DB flag
  with the existing env credential checks. Enforced server-side in every payment action/route
  (SC5, extends PAY-04/PAY-12) — never merely hidden in the UI.
  - **Scope note:** SC5 requires **Stripe / PayPal / bank transfer**. Seed those three flags.
    PayPal stays effectively OFF (D-05a — no NGN); its flag can exist but the credential gate
    keeps it off. The NG gateways can adopt the same table but are **not** a Phase 5 requirement.
  - **⚠ Refactor flagged for RESEARCH/PLAN:** `isPaymentMethodEnabled()` is currently a
    **synchronous, env-only** function (`src/lib/payments/config.ts`) called as the first
    statement in **many** actions/routes (Phase 4 checkout, Phase 7 Paystack/Flutterwave, Phase
    7.1 Interswitch/GTPay/Remita). Adding a DB read makes it **async**, which ripples into every
    caller. Research/planner must map all call sites and choose the migration (async gate vs. a
    cached settings loader) that keeps every existing enforcement point intact and regression-safe.
    A `db:push` for `store_settings` is required (apply to **both** dev and test DBs, per the
    established Neon dual-DB workflow).

### Claude's Discretion
Because this ran `--auto`, the following are explicitly left to research/planner judgment
(intent locked above; mechanism open):
- Exact `product` soft-delete column shape (`isActive` boolean vs `deletedAt` timestamp) and how
  the hidden state cascades to variants and existing catalog queries.
- Vercel Blob upload mechanics: client-upload-token flow vs. server-side `put()`, size/type
  validation, and whether old blobs are deleted on image replace.
- `store_settings` schema shape (enum-keyed rows vs. columns) and the sync→async migration
  strategy for `isPaymentMethodEnabled` across all call sites.
- The precise allowed state-transition graph over the 8-value `order_status` enum (which
  transitions are legal from which state) — D-08 locks that there IS a guarded shared function;
  the exact graph is planner territory.
- Admin form stack (reuse `react-hook-form` + `zod` as in checkout) and list pagination/sorting
  details for products and orders.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 5: Admin Panel" — goal, dependencies (Phase 1 auth+admin role,
  Phase 2 product schema, Phase 4 order schema), and the 5 success criteria.
- `.planning/REQUIREMENTS.md` — **ADMN-01, ADMN-02, ADMN-03, ADMN-04, ORD-03** (+ traceability
  table rows marking these Phase 5 / Pending).
- `.planning/PROJECT.md` — single-vendor scope; payment methods independently toggleable; admin
  manages products/inventory/orders.

### Cross-phase constraints (MUST honor — non-negotiable)
- `CLAUDE.md` §"Critical Constraints" — **`proxy.ts` cannot protect Server Actions; re-verify
  auth inside every admin/mutation action**; **atomic stock decrement**
  (`UPDATE variants SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock`);
  **webhook/confirmation idempotency mandatory**; **payment methods enforced server-side, not
  just UI**; split product caching (content cached vs stock/price fresh).
- `.planning/STATE.md` §"Accumulated Context" + "Carried-Forward Constraints" — double-auth
  (proxy + `verifySession()`); server-only feature flags; `next/cache` mocked in Server Action
  tests; vitest `fileParallelism=false`; SC5 `cacheTag` hook established in Phase 2 for Phase 5
  `revalidateTag`.
- `CLAUDE.md` §"Testing" — DB integration tests require a **separate `TEST_DATABASE_URL`** Neon
  branch; a `db:push` for `store_settings` (and any product soft-delete column) must be applied
  to **both** dev and test DBs. `TEST_DATABASE_URL` is set in this env (integration tests run).

### Prior-phase decisions this phase builds on
- `.planning/phases/04-checkout-payments/04-CONTEXT.md` — **D-09** (bank-transfer stock decrement
  deferred to admin-confirm — THIS phase), **D-10** (bank details server-only), order/status
  machine, PAY-04 toggle pattern, `awaiting_bank_transfer` semantics.
- `.planning/phases/07-nigerian-payment-gateways/07-CONTEXT.md` +
  `.planning/phases/07.1-additional-ng-gateways/07.1-CONTEXT.md` — the shared idempotent
  `confirmOrderPaid()` contract and `<provider>:<ref>` idempotency keys that bank-transfer
  admin-confirm must reuse (D-09 above).
- `.planning/phases/02-product-catalog/02-CONTEXT.md` — catalog schema, `getCatalog`/`getProduct`
  queries, and the `use cache` / `cacheTag('product-<slug>')` layer Phase 5 must invalidate.

### Existing code to extend / wire
- `src/app/admin/page.tsx` — admin dashboard stub with `verifyAdminSession()` dual-auth; grow
  into the `/admin` layout + nav (D-01/D-02).
- `src/lib/dal.ts` — `verifyAdminSession()` / `verifySession()` server-only re-verification seam.
- `src/lib/db/schema.ts` — `product` (l.113), `product_image` (l.130), `product_option`/
  `option_value`/`variant`/`variant_option_value` (l.140–191), `order`/`order_item` (l.273–305),
  `order_status` enum. Add: `store_settings` table (D-11) + product soft-delete marker (D-04).
- `src/lib/payments/config.ts` — `isPaymentMethodEnabled` (sync, env-only) → the gate that D-11
  makes DB-aware. All its call sites (Phase 4/7/7.1 actions + routes) must be updated together.
- `src/lib/payments/confirm-order-paid.ts` — the shared idempotent confirmation path bank-transfer
  admin-confirm reuses (D-09).
- `src/app/products/[slug]/page.tsx` — `cacheTag('product-<slug>')` invalidation target (D-06).
- `src/lib/catalog/*` (`getCatalog`/`getProduct`, `format.ts` `formatNGN`) — filter soft-deleted
  products (D-04); reuse NGN formatting in admin lists.
- `src/lib/email/` + `src/emails/` — Resend sender + React Email template pattern for the ORD-03
  status-change email (D-10).
- `src/lib/actions/checkout.ts` + `src/lib/actions/cart.ts` — Server Action patterns (auth-first,
  Zod validation, `next/cache` mock in tests) to mirror for admin actions.
- `.env.local.example` — add `BLOB_READ_WRITE_TOKEN` (server-only) for Vercel Blob (D-03).

### Research (stack & pitfalls)
- `.planning/research/STACK.md` — Vercel Blob recommendation + version notes (verify on npm).
- `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md` — admin/mutation +
  caching landmines.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`verifyAdminSession()`** (`src/lib/dal.ts`) + the admin stub (`src/app/admin/page.tsx`) — the
  dual-auth seam is already proven; extend, don't reinvent.
- **`confirmOrderPaid()`** (`src/lib/payments/confirm-order-paid.ts`) — the single idempotent
  paid-confirmation path (atomic decrement, oversold-refund, idempotency, confirmation email)
  that bank-transfer admin-confirm reuses verbatim (D-09).
- **`cacheTag('product-<slug>')`** hook in the PDP — Phase 2 deliberately tagged product content
  so Phase 5 admin edits can `revalidateTag` it (D-06).
- **Resend email seam** + React Email templates — model the ORD-03 status email on the existing
  order-confirmation email.
- **`isPaymentMethodEnabled` / `enabledPaymentMethods`** — the server-side enforcement gate the
  admin toggle plugs into (D-11).
- **`react-hook-form` + `zod`**, `formatNGN`, indigo brand tokens, Drizzle `db:push`/seed workflow.

### Established Patterns
- Next.js 16 App Router, `src/` layout, Server Components + client islands; **`proxy.ts`** (not
  middleware); **`verifySession()`/`verifyAdminSession()` re-check inside every mutation action**.
- Server-only env feature flags (no `NEXT_PUBLIC_`); secrets never reach the client.
- Build is `npx next build --webpack`; Node 20+/22; `next/cache` mocked in Server Action tests;
  vitest `fileParallelism=false`; integration tests gated on `TEST_DATABASE_URL` (set in this env).
- Schema changes applied via direct SQL fallback when drizzle-kit push hits a TTY prompt; apply
  to **both** dev and test DBs.

### Integration Points
- New `/admin` layout + nested routes (products list/editor, orders list/detail, settings).
- New admin Server Actions (product CRUD, variant/stock/price, image upload, order transition,
  bank-transfer confirm, payment-toggle) — each auth-first.
- New `store_settings` table + product soft-delete marker → `db:push` (both DBs).
- Vercel Blob (`@vercel/blob`) install + `BLOB_READ_WRITE_TOKEN`.
- `revalidateTag` wired from admin mutations into the Phase 2 catalog cache.
- Bank-transfer admin-confirm → existing `confirmOrderPaid()`.

</code_context>

<specifics>
## Specific Ideas

- Admin is an owner-facing dashboard: sidebar nav (Products / Orders / Settings), functional and
  fast over flashy — reuse the existing indigo system rather than a new design language.
- Fulfillment should feel like moving an order along a track (guided next-states), not a free-form
  status dropdown that lets you set illegal states.
- Confirming a bank transfer is the same "mark it paid" action the webhook does for cards — it
  should visibly reuse that path (stock decrements, email sends) so behavior is identical.

</specifics>

<deferred>
## Deferred Ideas

- **Customer-facing order history list** → Phase 6 (Customer Accounts). Phase 5 is admin-only.
- **Standalone admin toggle UI for each NG gateway** (Paystack/Flutterwave/Interswitch/GTPay/
  Remita) → not required by SC5; they stay server-env toggled (default OFF). Revisit if the owner
  needs live control over NG gateways (the D-11 `store_settings` table would extend cleanly).
- **Sales analytics / dashboards, discount codes, reviews, wishlists** → v2 (PROJECT.md Out of
  Scope).
- **Bulk product import / CSV, inventory audit log, low-stock alerts** → not in Phase 5 scope;
  note for a future admin milestone if the owner asks.
- **PayPal enablement** → still deferred (D-05a — no NGN); toggle exists but credential gate
  keeps it off.

### Reviewed Todos (not folded)

None — no pending todos matched this phase.

</deferred>

---

*Phase: 05-admin-panel*
*Context gathered: 2026-07-08*
