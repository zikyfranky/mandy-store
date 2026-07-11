# Roadmap: Mandy Store

**Created:** 2026-06-10
**Core Value:** Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.
**Granularity:** standard
**Coverage:** 27/27 v1 requirements mapped

## Phases

- [ ] **Phase 1: Foundation** - Database schema, auth, and route protection in place so everything else can be built safely
- [x] **Phase 2: Product Catalog** - A browsable, searchable, filterable storefront with variant selection (completed 2026-06-19)
- [x] **Phase 3: Cart** - A cart that survives navigation and refresh for guests and logged-in users (completed 2026-06-25)
- [x] **Phase 4: Checkout & Payments** - End-to-end purchase via Stripe or bank transfer with order confirmation (completed 2026-06-30)
- [x] **Phase 5: Admin Panel** - Store owner manages products, variants, stock, and order fulfillment (completed 2026-07-09 — code-complete; 2 credential-gated go-live human-verify items in 05-HUMAN-UAT)
- [x] **Phase 6: Customer Accounts** - Repeat buyers can view their order history (completed 2026-07-11 — AUTH-04; 348 tests green; 2 browser-UX human-verify items in 06-HUMAN-UAT)
- [ ] **Phase 7: Nigerian Payment Gateways** - Paystack + Flutterwave (the two NGN aggregators) behind a reusable gateway-adapter interface
- [ ] **Phase 7.1: Additional NG Gateways** - Opay, Palmpay, Interswitch, GTPay, Remita as fast-follow direct integrations against the Phase 7 adapter interface
- [ ] **Phase 8: Admin-Managed Payment Credentials** - All 8 gateways' credentials configurable in the admin portal (DB-stored), encrypted at rest with one master key, DB-overrides-env with fallback

## Phase Details

### Phase 1: Foundation
**Goal**: A working development environment where the data model, authentication, and route protection are committed to up front — the foundation everything else depends on.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. A new visitor can register with email and password and is logged in afterward
  2. A returning user can log in and their session persists across a browser refresh
  3. A logged-in user can log out from any page and is returned to a logged-out state
  4. Unauthenticated requests to protected routes (/admin/*, /account/*) are redirected to login, and every protected Server Action re-verifies the session (not proxy.ts alone)
  5. The database schema exists with a canonical order status enum (pending_payment, awaiting_bank_transfer, payment_confirmed, processing, shipped, delivered, cancelled, payment_failed) and a processed_webhook_events table with a unique constraint on event ID
**Plans**: 4 plans (4 waves)
Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Dev env, Drizzle schema (order_status enum + webhook table) pushed to Neon, Vitest/Playwright Wave 0 test infra *(COMPLETE 2026-06-10 — schema live in Neon; all 4 schema tests pass; ROADMAP SC5 satisfied)*

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — Auth.js v5 config (Credentials + DB sessions, D-08 workaround), DAL verifySession, Resend email seam *(COMPLETE 2026-06-10 — auth.ts+dal.ts+send-verification.ts live; 9/9 DAL tests pass; tsc clean)*

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-03-PLAN.md — Auth server actions (register/login/logout/verifyEmail) + admin seed script *(COMPLETE 2026-06-11 — 4 actions in auth.ts, seed.ts idempotent, 25/25 auth tests pass; AUTH-01/02/03 delivered)*

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 01-04-PLAN.md — proxy.ts route protection, auth UI pages/forms, protected route stubs, proxy e2e tests *(COMPLETE 2026-06-11 — manual auth-journey verified by user; login fixed via D-08 follow-up @048cec7)*

### Phase 2: Product Catalog
**Goal**: Customers can discover products by browsing, searching, and filtering, and can inspect a product with live variant-aware pricing — the first publicly shippable piece of the store.
**Depends on**: Phase 1
**Requirements**: CATA-01, CATA-02, CATA-03, CATA-04
**Success Criteria** (what must be TRUE):
  1. A customer can browse products grouped by category (Electronics, Watches, Phones)
  2. A customer can search products by name or description and see matching results
  3. A customer can sort by price and filter results by brand and price range
  4. A customer can select a product variant (color, storage, etc.) and see the price and stock indicator update live for that variant
  5. Product pages serve fresh stock/price (not over-cached) and carry canonical URLs and Product structured data
**Plans**: 4 plans (4 waves)
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Catalog Drizzle schema (8 tables + relations), [BLOCKING] schema push to Neon, realistic catalog seed, Wave 0 catalog test infra (schema/queries/variant-resolver + FK-safe truncation helper) *(COMPLETE 2026-06-11 — 8 tables live in Neon; 6-product seed across 3 categories; 64/64 tests pass)*

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Catalog query module (getCatalog/getProduct, search/filter/sort/pagination), NGN formatter, Zod searchParams validator, global header + search bar, listing surfaces (home, category pages, all-products, search) with facets/sort/pagination/empty state *(COMPLETE 2026-06-11 — getCatalog (MIN-price subquery), 14/14 query tests pass, 15/15 routes build; CATA-01/02/03 delivered)*

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Product detail page (/products/<slug>): pure variant resolver + unit tests, VariantSelector (live price/stock, OOS-disable, CTA stub), ProductGallery (variant image swap), Suspense content/stock split *(COMPLETE 2026-06-11 — 24/24 variant tests pass; /products/[slug] PPR; CATA-04 delivered)*

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02-04-PLAN.md — SEO + caching layer: cacheComponents + remotePatterns, 'use cache' on product content (stock/price stays fresh), canonical URL + Product JSON-LD (SC5) *(COMPLETE 2026-06-11 — ProductContent cached via use cache/cacheLife/cacheTag; JSON-LD in fresh block; canonical + OpenGraph via generateMetadata; SC5 all deliverables verified)*
**UI hint**: yes

### Phase 3: Cart
**Goal**: Customers can collect items into a cart that survives page navigation and browser refresh, for both guests and authenticated users, without ever trusting client-side prices.
**Depends on**: Phase 2
**Requirements**: CART-01, CART-02, CART-03
**Success Criteria** (what must be TRUE):
  1. A customer can add a selected product variant to the cart and see the cart count update
  2. A customer can change the quantity of, or remove, any item in the cart
  3. A guest customer's cart persists across page visits and a browser refresh (server-side cookie, not localStorage alone)
  4. The cart stores only variant IDs and quantities — prices and totals are recalculated from the database, never trusted from the client
**Plans**: 3 plans (3 waves)
Plans:
**Wave 1**
- [x] 03-01-PLAN.md — cart/cart_item Drizzle tables (no price columns) + [BLOCKING] db:push, pure cart-logic module (parse/merge/hydrate/clamp/subtotal), Wave 0 cart tests + truncateCartTables helper *(COMPLETE 2026-06-19 — cart+cart_item live in Neon; 43 cart tests pass + 3 todo; 143/143 full suite green; tsc clean)*

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-02-PLAN.md — Server cart layer: cookie helpers + server-only getCart/getCartCount, addToCart/updateCartItem/removeCartItem actions (stock-clamped, IDOR-safe), login-merge (D-10), wire VariantSelector add + SiteHeader live badge (rebrand to indigo) *(COMPLETE 2026-06-19 — 151/151 tests pass; npx next build --webpack succeeds; CART-01/02/03 delivered)*

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 03-03-PLAN.md — Cart UI: focus-trapped CartDrawer + CartLineItem/CartStepper/CartEmptyState, /cart page with order summary, drawer mounted in layout; human-verify checkpoint *(Tasks 1+2 complete 2026-06-19; Task 3 human-verify checkpoint pending)*
**UI hint**: yes

### Phase 4: Checkout & Payments
**Goal**: Customers can complete a purchase end-to-end — entering a shipping address, choosing an enabled payment method, paying, and receiving confirmation — with overselling, duplicate-charge, and price-tampering risks designed out.
**Depends on**: Phase 3 (cart), Phase 1 (auth + order schema)
**Requirements**: CHKT-01, CHKT-02, CHKT-03, CHKT-04, CHKT-05, PAY-01, PAY-02, PAY-03, PAY-04, ORD-01, ORD-02
**Success Criteria** (what must be TRUE):
  1. A guest can check out without creating an account, entering a shipping address, and see a full order summary with flat-rate shipping applied before confirming payment
  2. A customer can pay with Stripe (cards) or PayPal and, on success, lands on an order confirmation page and receives a confirmation email
  3. A customer can choose bank transfer and receive an email with NGN bank account details; the order is created as awaiting_bank_transfer (not marked paid)
  4. Each payment method can be turned on or off via server-only config, and a disabled method is rejected at the Server Action / Route Handler level, not only hidden in the UI
  5. Concurrent checkouts cannot oversell stock (atomic decrement) and duplicate webhook deliveries or double-submits cannot create duplicate orders (idempotency enforced)
**Plans**: 6 plans (4 waves)
Plans:
**Wave 1**
- [x] 04-01-PLAN.md — Order schema (orders + order_item) + [BLOCKING] db:push, flat-shipping total helper, Wave 0 test infra (truncateOrderTables, schema/totals tests), Phase 4 env vars *(COMPLETE 2026-06-30 — order+order_item live in Neon dev+test; 159/159 tests pass; FLAT_SHIPPING_KOBO=200000; CHKT-03 foundation)*
**Wave 2** *(blocked on Wave 1)*
- [x] 04-02-PLAN.md — Payment/order primitives: isPaymentMethodEnabled toggle, Stripe singleton, order-reference + guest-token, order queries, order-confirmation + bank-transfer emails (ORD-01/ORD-02)
**Wave 3** *(blocked on Wave 2)*
- [x] 04-03-PLAN.md — Checkout Server Actions: createBankTransferOrder (awaiting_bank_transfer) + createStripePaymentIntent (server-recomputed kobo total), guest checkout, address validation, toggle enforcement *(COMPLETE 2026-06-30 — 15/15 tests pass; CHKT-01/02/03/04 + PAY-01/03 + ORD-02 delivered; no stock decrement D-09)*
- [x] 04-04-PLAN.md — Stripe webhook (raw-body verify, idempotency, atomic stock decrement, last-unit-race refund — D-09) + order-status polling endpoint (CHKT-05/D-07) *(COMPLETE 2026-06-30 — 6/6 tests pass; PAY-01/ORD-01/CHKT-05 delivered)*
**Wave 4** *(blocked on Wave 3)*
- [x] 04-05-PLAN.md — /checkout single-page UI: contact + NG address form, payment selector (Stripe + bank only), embedded Stripe Payment Element, sticky order summary; human-verify checkpoint *(COMPLETE 2026-06-30 — CHKT-01/02/04 + PAY-01/03/04 delivered in UI; build passes)*
- [x] 04-06-PLAN.md — /order/[token] confirmation page (confirmed / awaiting-transfer / processing-poll states), bank details + copyable reference, post-purchase account offer, cart Checkout → /checkout rewire *(COMPLETE 2026-06-30 — 3 order states + CopyButton + PostPurchaseAccountOffer; bank env server-only; build passes; CHKT-05 + PAY-03 + ORD-02 delivered; Phase 4 COMPLETE)*
**UI hint**: yes

### Phase 5: Admin Panel
**Goal**: The store owner can fully manage the store — creating and editing products with images and variants, managing per-variant stock and price, and moving orders through fulfillment with customer notifications.
**Depends on**: Phase 1 (auth + admin role), Phase 2 (product schema), Phase 4 (order schema). May begin in parallel with Phase 4 once auth and schemas are solid.
**Requirements**: ADMN-01, ADMN-02, ADMN-03, ADMN-04, ORD-03
**Success Criteria** (what must be TRUE):
  1. An admin can add, edit, and delete products including image uploads with required alt text
  2. An admin can manage variants per product, each with its own price and stock level, and changes immediately expire the catalog cache
  3. An admin can view all orders, filter by status, and update fulfillment status through a shared status function (never setting the status field directly)
  4. When an order moves to shipped/delivered, the customer automatically receives a status-change email
  5. An admin can toggle Stripe, PayPal, and bank transfer on or off, and every admin Server Action re-verifies the admin role before acting
**Plans**: 6 plans (4 waves)
Plans:
**Wave 1** *(foundation — parallel, no file overlap)*
- [x] 05-01-PLAN.md — store_settings table + [BLOCKING] direct-SQL push (both DBs) + sync→async `isPaymentMethodEnabled` migration across all 15 call sites + config async tests (ADMN-04 server-side enforcement half, D-11) *(COMPLETE 2026-07-08 — 325 tests green, tsc+build clean)*
- [x] 05-02-PLAN.md — getProduct isActive soft-delete fix + admin read-queries (getProductForAdmin/listProductsForAdmin/listOrdersForAdmin/getOrderForAdmin) + @vercel/blob install + .env.local.example + Wave 0 RED admin test scaffolds (ADMN-01/02/03, ORD-03) *(COMPLETE 2026-07-08 — scaffolds RED-by-design; 325 pre-existing tests green)*

**Wave 2** *(server logic — parallel, no file overlap; blocked on Wave 1)*
- [x] 05-03-PLAN.md — Product/variant/image admin Server Actions (create/update/deactivate/reactivate/upsertVariant + Vercel Blob upload wrapper + required-alt-text + updateTag invalidation) (ADMN-01, ADMN-02, D-03/04/05/06) *(COMPLETE 2026-07-08 — products.test.ts 9/9 green)*
- [x] 05-04-PLAN.md — Shared guarded updateOrderStatus transition machine + D-09 bank-transfer confirm via confirmOrderPaid + ORD-03 shipped/delivered status email + toggleStoreSetting action (ADMN-03, ADMN-04, ORD-03, D-08/09/10) *(COMPLETE 2026-07-08 — full suite 340 tests green, no RED scaffolds)*

**Wave 3** *(admin shell + products UI; blocked on Wave 2)*
- [x] 05-05-PLAN.md — Admin shell (layout/sidebar/formStyles/OrderStatusBadge, D-01/02 dual-auth) + Products UI (list + status filter + editor with variants + image upload) (ADMN-01, ADMN-02) *(COMPLETE 2026-07-09 — 4 admin routes build as PPR; 340 tests green)*

**Wave 4** *(orders + settings UI + human-verify; blocked on Wave 3)*
- [~] 05-06-PLAN.md — Orders UI (list/filter + detail + guided no-dropdown transitions + bank-transfer confirm) + Settings UI (Stripe/PayPal/Bank toggles with dual-gate notes) + credential-gated human-verify checkpoint (Blob image round-trip + live toggle) (ADMN-03, ADMN-04, ORD-03) *(CODE COMPLETE 2026-07-09 — 340 tests green, build clean; **human-verify PENDING creds**: BLOB_READ_WRITE_TOKEN + live toggle round-trip)*
**UI hint**: yes

### Phase 6: Customer Accounts
**Goal**: Repeat buyers get added value from having an account — viewing their past orders — without accounts ever being on the critical path to a first sale.
**Depends on**: Phase 1 (customer session), Phase 4 (order records)
**Requirements**: AUTH-04
**Success Criteria** (what must be TRUE):
  1. A logged-in customer can view a list of their past orders with status and totals
  2. A customer can open an individual past order and see its line items, variant labels, shipping address, and final total as captured at purchase time
  3. The order history page is protected by both proxy.ts redirect and an in-action verifySession check
**Plans**: 2 plans
- [x] 06-01-PLAN.md — user-scoped IDOR-safe order queries + best-effort guest-order claim on register (Wave 1) *(COMPLETE 2026-07-09 — 16 tests green incl. IDOR; executed inline after executor watchdog stall)*
- [x] 06-02-PLAN.md — account UI: /account landing, /account/orders history list + OrderHistoryCard, IDOR-safe /account/orders/[id] detail (Wave 2) *(COMPLETE 2026-07-09 — 348 tests green, build clean; proxy /account exact-match dual-auth closed)*
**UI hint**: yes

### Phase 7: Nigerian Payment Gateways (Paystack + Flutterwave)
**Goal**: Customers can pay with the two NGN-native aggregators — **Paystack** and **Flutterwave** — at checkout, added as additional, independently server-toggleable payment methods that reuse the Phase 4 order + webhook + idempotency + atomic-decrement infrastructure. Built behind a **reusable gateway-adapter interface** (init → verify → webhook-handle → refund) so the fast-follow gateways slot in as new adapters (Phase 7.1). Stripe and bank transfer remain intact; PayPal stays deferred (no NGN). The aggregators cover cards, bank transfer, USSD, and Opay/Palmpay as channels — ~90% of NGN payments.
**Depends on**: Phase 4 (Checkout & Payments — order schema, webhook/idempotency pattern, server-side total recompute, PAY-04 toggle pattern)
**Requirements**: PAY-05, PAY-06, PAY-12
**Success Criteria** (what must be TRUE):
  1. A customer can pay with Paystack and, on success, lands on the order confirmation page and receives a confirmation email (same flow as Stripe)
  2. A customer can pay with Flutterwave with the same confirmation + email flow
  3. Both gateways are built against a shared adapter interface so a new gateway is a new adapter + toggle (not net-new plumbing)
  4. Every gateway is independently enable/disable-able via server-only config and a disabled gateway is rejected at the Server Action / Route Handler level, not just hidden in the UI (extends PAY-04)
  5. For every gateway the amount is recomputed server-side (never trusted from the client), each webhook is signature-verified, duplicate webhook deliveries are idempotent (processed_webhook_events), and stock is atomically decremented on confirmation — no overselling or duplicate orders. A server-side verify-on-callback and the webhook share one idempotent confirmation path; the webhook remains the ultimate authority.
**Plans**: 4 plans (3 waves)
Plans:
**Wave 1**
- [x] 07-01-PLAN.md — Foundation: install gateway SDKs, extend orders schema (gatewayProvider/gatewayReference) + DB push (both DBs), extend server-only toggle (paystack/flutterwave), define D-02 gateway-adapter interface, extract shared idempotent `confirmOrderPaid()` from Stripe webhook (regression-safe), scaffold Wave 0 tests *(COMPLETE 2026-07-04)*

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 07-02-PLAN.md — Paystack end-to-end (PAY-05): PaystackAdapter (kobo passthrough), toggle-gated init/verify Server Actions, SHA-512 signature-verified webhook → shared confirmOrderPaid (paystack:<ref> idempotency) + oversold refund *(COMPLETE 2026-07-04)*
- [x] 07-03-PLAN.md — Flutterwave end-to-end (PAY-06): FlutterwaveAdapter (naira↔kobo conversion + 100× overcharge guard), toggle-gated init/verify actions, SHA-256-base64 (+verif-hash) webhook gating on status "successful" → shared confirmOrderPaid (flutterwave:<tx_ref>) *(COMPLETE 2026-07-04)*

**Wave 3** *(blocked on Wave 2 completion)*
- [~] 07-04-PLAN.md — Checkout UI (D-05): extend flat radio PaymentMethodSelector + two inline-popup panels mirroring StripePaymentPanel (verify-before-redirect, public-key-only), branch CheckoutForm *(CODE COMPLETE 2026-07-04 — tsc + next build clean; **live-popup human-verify PENDING user test keys**)*
**UI hint**: yes

### Phase 7.1: Additional NG Gateways (fast-follow)
**Goal**: Add the direct-integration NGN gateways — **Opay**, **Palmpay**, **Interswitch**, **GTPay**, **Remita** — as new adapters against the Phase 7 gateway-adapter interface, each independently server-toggleable. Note: Opay/Palmpay already ride the Paystack/Flutterwave popups as channels, so their standalone value should be re-evaluated before building.
**Depends on**: Phase 7 (gateway-adapter interface, shared idempotent confirmation path, checkout method-selector extension)
**Requirements**: PAY-07, PAY-08, PAY-09, PAY-10, PAY-11
**Success Criteria** (what must be TRUE):
  1. Each additional gateway (Opay, Palmpay, Interswitch, GTPay, Remita) is integrated as a new adapter so a customer can complete an NGN payment through it
  2. Each gateway is independently enable/disable-able via server-only config and rejected at the action/route level when disabled (extends PAY-04/PAY-12)
  3. Each reuses the Phase 7 shared idempotent confirmation path (server-side amount recompute, signature-verified webhook, atomic stock decrement) — no overselling or duplicate orders
**Scope decision (07.1-CONTEXT D-11):** Build **Interswitch, GTPay, Remita** only. **Opay + Palmpay are satisfied-via-channel** (already reachable inside the Phase 7 Paystack/Flutterwave popups) — documented, not built as standalone adapters/buttons.
**Plans**: 5 plans (4 waves)
Plans:
**Wave 1**
- [x] 07.1-01-PLAN.md — Foundation: D-16 `InitResult` discriminated union (migrate Paystack/Flutterwave → `{mode:"popup"}`, regression-safe), extend server-only toggles (interswitch/gtpay/remita), `.env.local.example`, scaffold RED Wave 0 adapter tests *(PAY-09/10/11)* *(COMPLETE 2026-07-07)*

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 07.1-02-PLAN.md — Interswitch + GTPay adapters as two thin configs over one shared `webpay-core.ts` (D-12), SHA-512 request/requery hashes, kobo passthrough *(PAY-09, PAY-10)* *(COMPLETE 2026-07-07)*
- [x] 07.1-03-PLAN.md — Remita adapter: RRR-inside-init (D-17), naira↔kobo conversion, JSONP-safe requery verify *(PAY-11)* *(COMPLETE 2026-07-07)*

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 07.1-04-PLAN.md — Init actions (server total recompute, RRR→gatewayReference) + verify-on-return callback routes (D-14/D-15) + optional webhooks, all through the untouched `confirmOrderPaid` with `<provider>:<ref>` idempotency *(PAY-09/10/11)* *(COMPLETE 2026-07-07)*

**Wave 4** *(blocked on Wave 3 completion — human-verify checkpoint, D-19)*
- [~] 07.1-05-PLAN.md — Checkout UI (shared `RedirectLauncherPanel` — POST auto-submit vs GET), radio entries, `?error=` banner; PAY-07/08 satisfied-via-channel doc + REQUIREMENTS traceability; sandbox human-verify *(PAY-07/08/09/10/11)* *(CODE COMPLETE 2026-07-07 — tsc + build + 319 tests clean; **sandbox human-verify PENDING user creds**)*
**UI hint**: yes

### Phase 8: Admin-Managed Payment Credentials
**Goal**: The store owner can configure every payment gateway's credentials directly in the admin portal instead of `.env` — secret keys, public/publishable keys, merchant IDs, hash/MAC keys, webhook signing secrets, and endpoint URLs — for all 8 gateways (Stripe, PayPal, bank transfer, Paystack, Flutterwave, Interswitch, GTPay, Remita). Secrets are encrypted at rest (AES-256-GCM) with a single `CREDENTIALS_ENCRYPTION_KEY` that stays in `.env`; the ~20 scattered gateway secrets move into the DB. Credentials resolve DB-first with `.env` fallback so existing deployments keep working and migration is gradual. Extends the Phase 5 `store_settings` + Settings UI and the Phase 7/7.1 gateway-adapter + webhook infrastructure.
**Depends on**: Phase 5 (admin panel, `store_settings` table, Settings UI, dual-auth), Phase 7 + 7.1 (gateway-adapter interface, webhook routes for all 8 gateways)
**Requirements**: ADMN-05, ADMN-06, ADMN-07
**Success Criteria** (what must be TRUE):
  1. An admin can enter and later replace each gateway's credentials from `/admin/settings`, persisted to the database (no code deploy / `.env` edit required)
  2. Secret credentials are encrypted at rest (AES-256-GCM) with a single master key held in `.env`; stored secrets are never returned to the browser — the UI shows a masked "configured" state with a Replace action (write-only fields). Publishable/public keys may be shown
  3. At runtime every gateway and webhook resolves credentials DB-first with `.env` fallback, so an unconfigured gateway keeps working from `.env` and gateways migrate one at a time
  4. Webhook route signature verification uses the DB-resolved (decrypted) signing secret for all 8 gateways; a missing or invalid credential fails closed (the method is treated as not-configured, never bypassing verification)
  5. Every credential read/write re-verifies the admin role server-side and stays server-only (no `NEXT_PUBLIC_`, no secret leakage into client bundles)
**Plans**: 9 plans (5 waves)
Plans:
**Wave 1**
- [x] 08-01-PLAN.md — gateway_credentials schema (D-01) + [BLOCKING] direct-SQL push (both DBs) + crypto.ts AES-256-GCM envelope (D-02, TDD) + CREDENTIALS_ENCRYPTION_KEY in .env.local.example *(COMPLETE 2026-07-11 — table live+empty in both Neon DBs; 8 crypto tests green)*

**Wave 2** *(blocked on Wave 1)*
- [ ] 08-02-PLAN.md — FIELD_MANIFEST (30 fields/8 providers) + getGatewayConfig/getGatewayCredentialsMap DB-first/env-fallback/fail-closed resolver (D-03, TDD) + DB-gated env-only-regression integration test + truncateGatewayCredentialsTable helper

**Wave 3** *(parallel, no file overlap; blocked on Wave 2)*
- [ ] 08-03-PLAN.md — saveGatewayCredentials (D-05) + testGatewayConnection (D-06) Server Actions, admin-gated, closed per-provider Zod schema, encrypt-before-persist, empty-submit-preserves
- [ ] 08-04-PLAN.md — config.ts hasEnvAndCredentials + stripe.ts getStripe() resolver migration (async), checkout.ts/Stripe-webhook call-site fix, 6 test files updated
- [ ] 08-05-PLAN.md — Paystack/Flutterwave/Remita/Interswitch/GTPay gateway module migration (per-call resolved WebPayConfig for the WebPay pair, webpay-core.ts untouched), gateways.test.ts updated
- [ ] 08-06-PLAN.md — Paystack + Flutterwave webhook signing-secret migration, fail-closed 400 guard, existing test files extended
- [ ] 08-07-PLAN.md — GTPay + Remita webhook signing-secret migration, fail-closed guard, 2 NEW webhook test files (prior gap — only callback routes had coverage)

**Wave 4** *(blocked on Wave 3, specifically 08-04)*
- [ ] 08-08-PLAN.md — Stripe webhook webhook_secret resolver migration (needs 08-04's async getStripe() already in place), fail-closed test added

**Wave 5** *(UI; blocked on Wave 3/4 completion)*
- [ ] 08-09-PLAN.md — Settings UI: GatewayCredentialCard.tsx (write-only disclosure form, full UI-SPEC field-rendering/states/accessibility contract) + settings/page.tsx extension (8 gateway cards, resolver-backed presence, legacy 3-gateway helper fix) + human-verify checkpoint (write-only round-trip, no-leak DevTools check, test-connection)
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 01-01 complete 2026-06-10; 01-02 complete 2026-06-10; 01-03 complete 2026-06-11; 01-04 complete 2026-06-11 |
| 2. Product Catalog | 4/4 | Complete    | 2026-06-19 |
| 3. Cart | 3/3 | Complete    | 2026-06-25 |
| 4. Checkout & Payments | 6/6 | Complete | 2026-06-30 |
| 5. Admin Panel | 0/0 | Not started | - |
| 6. Customer Accounts | 0/0 | Not started | - |
| 7. Nigerian Payment Gateways (Paystack + Flutterwave) | 3/4 | Code complete — live-verify pending | - |
| 7.1. Additional NG Gateways (fast-follow) | 5/5 | Code complete — sandbox human-verify pending (D-19) | - |
| 8. Admin-Managed Payment Credentials | 0/9 | Planned | - |

---
*Roadmap created: 2026-06-10*
