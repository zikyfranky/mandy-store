# Phase 4: Checkout & Payments - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A guest or logged-in customer completes a purchase **end-to-end**: enters a shipping
address, sees an order summary with **flat-rate shipping** applied, chooses an **enabled**
payment method (**Stripe cards**, **PayPal**, or **NGN bank transfer**), pays, lands on an
**order confirmation page**, and receives a **confirmation email** — with **overselling**,
**duplicate charges**, and **price tampering** designed out (CHKT-01–05, PAY-01–04, ORD-01, ORD-02).

This phase wires the cart's "Checkout" button (currently a Phase-3 stub routing to `/cart`)
into a real `/checkout` flow, and **creates the net-new order schema** deferred from Phase 1:
`orders`, `order_items`, and a shipping `addresses`/address-snapshot representation. The
`order_status` enum and `processed_webhook_events` table already exist (Phase 1).

**Out of scope (other phases):**
- Admin viewing orders, updating fulfillment status, and **manually confirming bank transfers**
  → Phase 5 (Admin Panel). This phase creates the `awaiting_bank_transfer` order; the admin
  marks it paid later.
- Logged-in customer order **history** list → Phase 6 (Customer Accounts). This phase's
  guest order-access (token link) is the only order-viewing surface built here.
- Discount codes / promotions → v2.

</domain>

<decisions>
## Implementation Decisions

### Checkout flow shape (CHKT-01, CHKT-02, CHKT-04)
- **D-01:** **Single-page checkout** at a new `/checkout` route — shipping address, payment
  method selection, and the **order summary all on one screen** (summary sticky to the side).
  No multi-step wizard. Modern DTC pattern; fewer clicks to payment for a small catalog.
- **D-02:** **Guest identity = email field only** on the checkout form (for the receipt) — no
  password, no account required on the critical path (CHKT-01). **Logged-in users** have their
  email **prefilled from the session** and aren't re-asked.
- **D-03:** **Optional account creation is offered AFTER purchase** — the confirmation page shows
  a "Create an account to track this order" prompt that links the just-placed order to a new
  account. Account creation is never on the path to first sale (consistent with PROJECT.md
  "accounts off the critical path"; full history is Phase 6).
- **D-04:** **Shipping address fields (NG-appropriate):** full name, **phone (required** — couriers
  need it in Nigeria), street address, city, **State (dropdown: 36 states + FCT)**, optional
  landmark/delivery notes. **No postal code** requirement (rarely used in NG).

### Card / PayPal payment experience (PAY-01, PAY-02)
- **D-05:** **Embedded on-site payment** — **Stripe Payment Element** (card fields) and **PayPal JS
  buttons** render directly on `/checkout`; the customer **never leaves the site**. Card data is
  tokenized client-side by Stripe so PCI scope stays light (SAQ-A). No hosted-redirect flow.
- **D-06:** **Webhook is the sole authority** for flipping an order to `payment_confirmed`. The
  client redirect/confirmation is **never trusted** to mark an order paid. Webhook handling is
  **idempotent** via the existing `processed_webhook_events` unique constraint, and the order is
  created/updated **transactionally** (CLAUDE.md mandatory constraints; ROADMAP SC5).
- **D-07:** **Confirmation page reconciles with the webhook.** If the customer lands on the
  confirmation page before the webhook arrives (webhooks can lag a few seconds), show a
  **"Payment processing…"** state that resolves to success once `payment_confirmed` is recorded.
- **D-08:** **Failed/declined payment → stay on `/checkout`** with an inline error ("card declined,
  try again"); **cart and entered address are preserved** so the customer can retry or switch
  method immediately. The order stays `pending_payment` until success (or is left to expire — see
  D-10). Best for conversion.

### Stock reservation timing (PAY/ORD — ROADMAP SC5: no overselling)  *(Claude's discretion — see below)*
- **D-09 (locked by Claude per user "you decide"):** **Stock is decremented atomically only when
  payment is CONFIRMED**, not when the order is created.
  - For **Stripe/PayPal**: the atomic decrement (`UPDATE variants SET stock = stock - qty WHERE id = $1
    AND stock >= qty RETURNING stock`) runs **inside the idempotent webhook transaction** that flips the
    order to `payment_confirmed`.
  - For **bank transfer**: the decrement runs when the **admin confirms** payment (Phase 5) — the
    `awaiting_bank_transfer` order does **not** hold stock while waiting.
  - **Rationale:** the atomic conditional decrement guarantees no oversell regardless of timing;
    decrementing on-confirmation avoids stuck inventory holds and any timeout/release machinery for
    abandoned or unpaid (bank-transfer) orders — the right simplicity tradeoff for a small
    single-vendor store.
  - **⚠ Edge case flagged for RESEARCH/PLAN:** the rare "two customers pay for the last unit"
    race — when the atomic decrement at webhook time returns **no row** (stock already gone for a
    *paid* order). Research must specify the recovery path (mark order for **refund / manual
    review**, notify customer, do not silently fail). This is the one accepted risk of
    decrement-on-confirmation; planning must design the handler, not skip it.

### Bank transfer & guest order access (PAY-03, ORD-02, CHKT-05)
- **D-10:** **NGN bank account details come from server-only config/env** (same pattern as the
  payment-method toggles — no `NEXT_PUBLIC_` prefix): bank name, account number, account name.
- **D-11:** Each order gets a **short human-friendly reference** (e.g. `MS-7F3K2A`) shown on the
  confirmation page and in the bank-transfer email; the customer puts it in the transfer narration
  so the admin can match it (Phase 5). The order is created as **`awaiting_bank_transfer`** (NOT
  paid) per ROADMAP SC3.
- **D-12:** **Guest order access via an unguessable token link.** The order confirmation/status page
  is reachable at a URL carrying a **long random token** (so order IDs aren't enumerable — no IDOR).
  The link is shown immediately after checkout **and** included in the email. Bank-transfer
  customers reopen the same link to check status. **No login required.** (Email + order-ref lookup
  form was considered and rejected as higher-friction.)

### Payment-method toggles (PAY-04)
- **D-13:** Each of Stripe / PayPal / bank transfer is **independently enable/disable-able via
  server-only config**, and a **disabled method is rejected at the Server Action / Route Handler
  level** (re-checked server-side), not merely hidden in the UI (ROADMAP SC4, CLAUDE.md). The
  checkout UI only *offers* methods that are enabled.

### Emails (ORD-01, ORD-02)
- **D-14:** Reuse the existing **Resend email seam** (`src/lib/email/`, React Email templates in
  `src/emails/`). Two new transactional emails: **order confirmation** (on `payment_confirmed`,
  card/PayPal) and **bank-transfer instructions** (on bank-transfer order creation — contains the
  NGN account details from D-10 and the order reference from D-11). Both include the guest
  order-access link (D-12).

### Claude's Discretion
- **Stock timing (D-09)** — locked by Claude at user's request; default chosen + edge case flagged
  for research (see D-09).
- Order schema design: exact `orders` / `order_items` / address columns. **Must snapshot
  price-at-purchase** into `order_items` (prices can change later; Phase 6 SC2 requires the final
  total "as captured at purchase time") and snapshot the shipping address onto the order. Column
  layout, whether addresses is its own table vs JSON snapshot, and indexing are planner territory.
- Order-reference generation scheme (collision handling for `MS-XXXXXX`), token length/encoding for
  the guest access link.
- Stripe PaymentIntent vs newer API surface, PayPal SDK version, webhook route structure, the exact
  "Payment processing…" reconciliation mechanism (poll vs server-render-on-load) — research/planner
  territory, subject to D-06/D-07 intent.
- Whether order creation happens before PaymentIntent creation (recompute totals server-side first —
  never trust client prices) — the *intent* is locked; the sequencing is planner detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 4: Checkout & Payments" — goal, dependencies (Phase 3 cart, Phase 1
  auth + order schema), and the 5 success criteria (guest checkout + address + flat-rate summary;
  Stripe/PayPal → confirmation page + email; bank transfer → email + `awaiting_bank_transfer`;
  server-side method toggles; no oversell + idempotency).
- `.planning/REQUIREMENTS.md` — CHKT-01..05, PAY-01..04, ORD-01, ORD-02.
- `.planning/PROJECT.md` — guest checkout non-negotiable; payment methods independently toggleable;
  flat-rate physical shipping; NGN.

### Cross-phase constraints (MUST honor — non-negotiable)
- `CLAUDE.md` §"Critical Constraints" — **never trust client prices** (recompute totals server-side
  before creating a PaymentIntent); **webhook idempotency mandatory** (`processed_webhook_events`
  unique constraint, orders created transactionally); **atomic stock decrement**
  (`UPDATE variants SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock`, never
  read-then-write); **payment methods server-side toggleable** (enforced, not just UI); Next.js 16
  `proxy.ts` cannot protect Server Actions — re-verify in every mutation action.
- `.planning/STATE.md` §"Accumulated Context" + "Carried-Forward Constraints" — order status machine
  + idempotency table designed in Phase 1; payment feature flags are server-only env vars enforced in
  actions/route handlers; cart cookie stores only `{variantId, quantity}` and totals are always
  recalculated server-side; `next/cache` mocked in Server Action tests; vitest `fileParallelism=false`
  for shared Neon isolation.
- `CLAUDE.md` §"Testing" — **DB integration tests require `TEST_DATABASE_URL` (a separate Neon
  branch)**; set it before Phase 4 verification so payment/idempotency integration coverage actually
  runs (do NOT run integration tests against the dev `DATABASE_URL`).

### Research (stack & pitfalls)
- `.planning/research/STACK.md` — recommended payment stack & version notes (verify Stripe / PayPal
  React SDK versions on npm before install — STATE.md open question 4).
- `.planning/research/PITFALLS.md` — payment/webhook landmines to design around.
- `.planning/research/ARCHITECTURE.md`, `.planning/research/SUMMARY.md`, `.planning/research/FEATURES.md`.

### Existing code to extend / wire
- `src/lib/db/schema.ts` — `orderStatusEnum` (8 states) + `processedWebhookEvents` table already
  here; **add** `orders`, `order_items`, and shipping-address representation this phase. Cart tables
  (`cart`, `cartItems`) and `variants.stock` (the atomic-decrement target) live here.
- `src/lib/cart/queries.ts` (`getCart`) + `src/lib/cart/logic.ts` (`hydrateCart`) — server-side cart
  read with prices/stock joined from `variants`; the authoritative source for checkout totals (never
  trust client). `getCart()` already excludes OOS lines and clamps to stock.
- `src/lib/actions/cart.ts` — Server Action patterns (stock-clamped, IDOR-safe, `next/cache` mock in
  tests) to mirror for checkout actions.
- `src/lib/dal.ts` — `verifySession()` / `verifyAdminSession()` server-only re-verification seam (use
  for any authed checkout path; admin bank-transfer confirmation is Phase 5).
- `src/lib/email/send-verification.ts` + `src/emails/VerificationEmail.tsx` — Resend sender + React
  Email template pattern to model the order-confirmation and bank-transfer-instructions emails on.
- `src/lib/catalog/format.ts` (`formatNGN`) — NGN formatting for order summary, emails, confirmation.
- `src/app/cart/page.tsx` + `src/components/cart/*` — the Checkout button (Phase-3 stub to `/cart`)
  upgrades to route into `/checkout`; reuse cart line-item / empty-state / indigo brand styling.
- `.env.local.example` — add (server-only, no `NEXT_PUBLIC_`): payment-method toggles, Stripe keys +
  webhook secret, PayPal client id/secret, bank account details (D-10).
- `.planning/phases/03-cart/03-CONTEXT.md`, `.../02-product-catalog/02-CONTEXT.md`,
  `.../01-foundation/01-CONTEXT.md` — cart, catalog, and auth/session decisions this phase builds on.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Order infra shells already built (Phase 1):** `orderStatusEnum` (8 values) and
  `processedWebhookEvents` (unique constraint on event id) — wire idempotency + status transitions
  onto these; do not redefine.
- **Server-side cart read** (`getCart`/`hydrateCart`): single source of truth for checkout totals,
  already stock-aware and price-recomputed from the DB — feed it into order creation.
- **Resend email seam** + React Email template pattern — reuse for the two new order emails.
- **`formatNGN`**, indigo brand system (`globals.css` tokens), cart UI components, Drizzle
  `db:push`/seed workflow, `dal.ts` server-only + `verifySession()` patterns.

### Established Patterns
- Next.js 16 App Router, `src/` layout, Server Components + client islands; **`proxy.ts`** (not
  middleware) and **`verifySession()` re-check inside every mutation action** (proxy can't protect
  Server Actions).
- Server-only env feature flags (no `NEXT_PUBLIC_`) enforced in actions/route handlers — the exact
  pattern PAY-04 toggles follow.
- Build is `npx next build --webpack`; Node 20+ (`.nvmrc` = 22). `next/cache` mocked in Server Action
  integration tests; vitest `fileParallelism=false`; integration tests gated on `TEST_DATABASE_URL`.

### Integration Points
- New `/checkout` route + checkout Server Action(s); new **webhook Route Handler(s)** for Stripe (and
  PayPal) — the webhook is the only writer of `payment_confirmed` (D-06).
- New `orders` / `order_items` / address tables reference `variants` and (nullable) `users`; a
  `db:push` is required this phase.
- New guest order confirmation/status page at a token-bearing URL (D-12); cart Checkout button repoints
  from `/cart` stub to `/checkout`.
- `variants.stock` atomic decrement fires inside the webhook (card/PayPal) or admin-confirm (bank
  transfer, Phase 5) — see D-09.

</code_context>

<specifics>
## Specific Ideas

- Checkout should feel like a modern single-screen DTC checkout — address on the left, sticky order
  summary on the right, payment options inline; the customer never leaves the site to pay.
- Bank-transfer customers get a memorable short reference (`MS-7F3K2A`) to quote in their transfer,
  and can reopen their order link any time to see whether it's been confirmed.
- "Payment processing…" is an honest, brief interstitial when the webhook hasn't landed yet — better
  than falsely claiming success.

</specifics>

<deferred>
## Deferred Ideas

- **Admin order management + manual bank-transfer confirmation + fulfillment status updates** →
  Phase 5 (Admin Panel). This phase creates `awaiting_bank_transfer` orders; the admin confirms them.
- **Logged-in customer order history list** → Phase 6 (Customer Accounts). Only the guest token-link
  order page is built here.
- **Status-change emails (shipped/delivered)** → Phase 5 (ORD-03). This phase sends confirmation +
  bank-transfer-instructions emails only.
- **Discount codes / promotions at checkout** → v2 (PROMO-01/02, out of scope).
- **Address validation API / saved addresses** → out of scope (PROJECT.md / REQUIREMENTS.md).
- **Inventory hold + timeout-release for abandoned/unpaid orders** → not built; D-09 decrements on
  confirmation instead. Revisit only if overselling-on-last-unit refunds become common.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 04-checkout-payments*
*Context gathered: 2026-06-25*
