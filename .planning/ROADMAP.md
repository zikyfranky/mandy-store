# Roadmap: Mandy Store

**Created:** 2026-06-10
**Core Value:** Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.
**Granularity:** standard
**Coverage:** 27/27 v1 requirements mapped

## Phases

- [ ] **Phase 1: Foundation** - Database schema, auth, and route protection in place so everything else can be built safely
- [x] **Phase 2: Product Catalog** - A browsable, searchable, filterable storefront with variant selection (completed 2026-06-19)
- [x] **Phase 3: Cart** - A cart that survives navigation and refresh for guests and logged-in users (completed 2026-06-25)
- [ ] **Phase 4: Checkout & Payments** - End-to-end purchase via Stripe, PayPal, or bank transfer with order confirmation
- [ ] **Phase 5: Admin Panel** - Store owner manages products, variants, stock, and order fulfillment
- [ ] **Phase 6: Customer Accounts** - Repeat buyers can view their order history

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
- [ ] 04-01-PLAN.md — Order schema (orders + order_item) + [BLOCKING] db:push, flat-shipping total helper, Wave 0 test infra (truncateOrderTables, schema/totals tests), Phase 4 env vars
**Wave 2** *(blocked on Wave 1)*
- [ ] 04-02-PLAN.md — Payment/order primitives: isPaymentMethodEnabled toggle, Stripe singleton, order-reference + guest-token, order queries, order-confirmation + bank-transfer emails (ORD-01/ORD-02)
**Wave 3** *(blocked on Wave 2)*
- [ ] 04-03-PLAN.md — Checkout Server Actions: createBankTransferOrder (awaiting_bank_transfer) + createStripePaymentIntent (server-recomputed kobo total), guest checkout, address validation, toggle enforcement
- [ ] 04-04-PLAN.md — Stripe webhook (raw-body verify, idempotency, atomic stock decrement, last-unit-race refund — D-09) + order-status polling endpoint (CHKT-05/D-07)
**Wave 4** *(blocked on Wave 3)*
- [ ] 04-05-PLAN.md — /checkout single-page UI: contact + NG address form, payment selector (Stripe + bank only), embedded Stripe Payment Element, sticky order summary; human-verify checkpoint
- [ ] 04-06-PLAN.md — /order/[token] confirmation page (confirmed / awaiting-transfer / processing-poll states), bank details + copyable reference, post-purchase account offer, cart Checkout → /checkout rewire
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
**Plans**: TBD
**UI hint**: yes

### Phase 6: Customer Accounts
**Goal**: Repeat buyers get added value from having an account — viewing their past orders — without accounts ever being on the critical path to a first sale.
**Depends on**: Phase 1 (customer session), Phase 4 (order records)
**Requirements**: AUTH-04
**Success Criteria** (what must be TRUE):
  1. A logged-in customer can view a list of their past orders with status and totals
  2. A customer can open an individual past order and see its line items, variant labels, shipping address, and final total as captured at purchase time
  3. The order history page is protected by both proxy.ts redirect and an in-action verifySession check
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 01-01 complete 2026-06-10; 01-02 complete 2026-06-10; 01-03 complete 2026-06-11; 01-04 complete 2026-06-11 |
| 2. Product Catalog | 4/4 | Complete    | 2026-06-19 |
| 3. Cart | 3/3 | Complete    | 2026-06-25 |
| 4. Checkout & Payments | 0/6 | Planned | - |
| 5. Admin Panel | 0/0 | Not started | - |
| 6. Customer Accounts | 0/0 | Not started | - |

---
*Roadmap created: 2026-06-10*
