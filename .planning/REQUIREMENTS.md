# Requirements: Mandy Store

**Defined:** 2026-06-06
**Core Value:** Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.
**Currency:** NGN (Nigerian Naira)
**Shipping:** Flat rate

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can register with email and password *(delivered: Plan 01-03 — register() + verifyEmail() actions, argon2id, email verification gate)*
- [x] **AUTH-02**: User can log in and session persists across browser refresh *(delivered: Plan 01-03 — login() via signIn("credentials"), D-08 DB session workaround)*
- [x] **AUTH-03**: User can log out from any page *(delivered: Plan 01-03 — logout() calling signOut())*
- [x] **AUTH-04**: Logged-in user can view their order history *(delivered: Plans 06-01/06-02 — IDOR-safe listOrdersForUser/getOrderForUser (ownership in SQL WHERE, null-uniform), /account order-history list + detail reusing OrderSummaryLines/ShippingAddressBlock (price-at-purchase snapshot), dual-auth (proxy + verifySession), guest-order claim on register; 16 integration tests incl. IDOR)*

### Product Catalog

- [x] **CATA-01**: User can browse products by category (Electronics, Watches, Phones) *(delivered: Plan 02-02 — category pages /electronics /watches /phones; SC5 canonical+JSON-LD completed Plan 02-04)*
- [x] **CATA-02**: User can search products by name or description *(delivered: Plan 02-02 — /search?q= with ILIKE on name/description)*
- [x] **CATA-03**: User can sort by price and filter by brand/price range *(delivered: Plan 02-02 — sort Price↑/↓/Newest/Name A-Z, brand+price range facets, all URL-driven SSR)*
- [x] **CATA-04**: User can select product variants (color, storage, etc.) with live price update

### Cart

- [x] **CART-01**: User can add a product variant to cart *(delivered: Plan 03-02 — addToCart Server Action, guest cookie + authed DB, stock-clamped)*
- [x] **CART-02**: User can update quantity or remove items from cart *(delivered: Plan 03-02 — updateCartItem/removeCartItem Server Actions, qty=0 removes)*
- [x] **CART-03**: Cart persists across page visits (guest session via cookie) *(delivered: Plan 03-02 — ms_cart cookie httpOnly/lax/30d; getCart() reads on every request)*

### Checkout

- [x] **CHKT-01**: User can check out as guest without creating an account *(delivered: Plan 04-03 — userId=null for guests; customerEmail from form; guestToken for order access)*
- [x] **CHKT-02**: User enters shipping address at checkout *(delivered: Plan 04-03 — Zod AddressSchema: 36 NG states + FCT, required phone, street, city, fullName; landmark optional)*
- [x] **CHKT-03**: Flat-rate shipping fee is applied to the order total *(delivered: Plans 04-01+04-03 — FLAT_SHIPPING_KOBO added server-side via computeOrderTotal; never trusted from client)*
- [x] **CHKT-04**: User sees full order summary before confirming payment *(delivered: Plan 04-03 — server-recomputed subtotal+shipping+total stored on order; never from client)*
- [x] **CHKT-05**: User sees order confirmation page after successful payment *(delivered: Plan 04-04 — GET /api/order/status/[token] returns {status} for confirmation page polling; D-07 reconciliation endpoint)*

### Payments

- [x] **PAY-01**: User can pay via Stripe (debit/credit cards) *(delivered: Plan 04-03 — createStripePaymentIntent creates pending_payment order + PaymentIntent with kobo amount in NGN; clientSecret returned)*
- [ ] **PAY-02**: User can pay via PayPal *(deferred: D-05a — PayPal does not support NGN; toggle exists but defaults OFF)*
- [x] **PAY-03**: User can pay via bank transfer (NGN account details shown on order) *(delivered: Plan 04-03 — createBankTransferOrder: awaiting_bank_transfer status, MS-XXXXXX reference, bank instructions email)*
- [x] **PAY-04**: Each payment method can be toggled on/off independently via config *(delivered: Plans 04-02+04-03 — isPaymentMethodEnabled server-only; checked as first statement in each action)*

### Nigerian Payment Gateways (Phase 7 — Paystack + Flutterwave)

NGN-native gateways added as additional server-toggleable payment methods reusing the Phase 4 order/webhook/idempotency/atomic-decrement infrastructure. Phase 7 delivers the two aggregators (Paystack + Flutterwave — cards/bank/USSD/Opay/Palmpay channels) behind a reusable gateway-adapter interface. The direct integrations fast-follow in Phase 7.1.

- [ ] **PAY-05**: User can pay via Paystack (NGN)
- [ ] **PAY-06**: User can pay via Flutterwave (NGN)
- [ ] **PAY-12**: Each NG gateway is independently toggleable via server-only config and rejected at the action/route level when disabled (extends PAY-04)

### Additional NG Gateways (Phase 7.1 — fast-follow)

Direct-integration gateways added as new adapters against the Phase 7 gateway interface. Note: several of these (Opay, Palmpay) already ride the Paystack/Flutterwave popups as channels — re-evaluate standalone value before building.

- [x] **PAY-07**: User can pay via Opay — **satisfied-via-channel** (Phase 7.1 D-11): Opay is reachable as a channel inside the Phase 7 Paystack/Flutterwave inline popups; no standalone adapter built (redundant).
- [x] **PAY-08**: User can pay via Palmpay — **satisfied-via-channel** (Phase 7.1 D-11): Palmpay is reachable as a channel inside the Phase 7 Paystack/Flutterwave inline popups; no standalone adapter built (redundant).
- [x] **PAY-09**: User can pay via Interswitch — complete at the sandbox bar (Phase 7.1 D-19); live-verify is a go-live checklist item.
- [x] **PAY-10**: User can pay via GTPay — complete at the sandbox bar (Phase 7.1 D-19); live-verify is a go-live checklist item.
- [x] **PAY-11**: User can pay via Remita — complete at the sandbox bar (Phase 7.1 D-19); live-verify is a go-live checklist item.

### Orders & Notifications

- [x] **ORD-01**: Customer receives order confirmation email after successful payment *(delivered: Plan 04-04 — sendOrderConfirmationEmail called non-blocking in webhook on payment_confirmed)*
- [x] **ORD-02**: Customer receives bank transfer instructions email when that method is chosen *(delivered: Plan 04-03 — sendBankTransferInstructionsEmail called synchronously in createBankTransferOrder)*
- [x] **ORD-03**: Customer receives email when fulfillment status changes (e.g. shipped, delivered) *(delivered: Plan 05-04 — sendOrderStatusChangeEmail fires non-blocking only on shipped/delivered inside the shared updateOrderStatus transition)*

### Admin

- [x] **ADMN-01**: Admin can add, edit, and delete products with images *(delivered: Plans 05-03/05-05 — admin-products actions (create/update/soft-delete/reactivate) + Vercel Blob upload w/ server-enforced required alt text + product editor UI; live upload round-trip is a go-live human-verify per 05-HUMAN-UAT)*
- [x] **ADMN-02**: Admin can manage product variants with individual prices and stock levels *(delivered: Plans 05-03/05-05 — upsertVariant (own priceKobo+stock) + inline VariantEditor; every catalog-visible mutation calls updateTag('product-<slug>') to expire the Phase 2 cache)*
- [x] **ADMN-03**: Admin can view all orders and update fulfillment status *(delivered: Plans 05-04/05-06 — orders list+filter, order detail, shared guarded updateOrderStatus (LEGAL_TRANSITIONS allowlist, sole status writer), D-09 bank-transfer confirm via confirmOrderPaid)*
- [x] **ADMN-04**: Admin can toggle Stripe / PayPal / bank transfer on or off *(delivered: Plans 05-01/05-04/05-06 — DB-backed store_settings toggles (toggleStoreSetting), async isPaymentMethodEnabled dual-gate (DB flag AND env creds), enforced server-side in every payment action/route; Settings UI)*

### Admin — Payment Credentials (Phase 8)

Move all 8 payment gateways' credentials out of `.env` and into the admin portal, DB-stored and encrypted at rest with a single master key. Extends the Phase 5 `store_settings`/Settings UI and the Phase 7/7.1 gateway-adapter + webhook infrastructure.

- [ ] **ADMN-05**: Admin can configure and replace each payment gateway's credentials (secret key, public key, merchant IDs, hash/MAC keys, webhook signing secret, endpoint URLs) from the admin portal, persisted to the database — no `.env` edit or redeploy required
- [ ] **ADMN-06**: Payment gateway secrets are encrypted at rest (AES-256-GCM) with a single server-only master key; secret fields are write-only in the UI (masked "configured" state + Replace, never returned to the browser)
- [ ] **ADMN-07**: Credentials resolve DB-first with `.env` fallback for all 8 gateways (including webhook signature verification), admin-gated and server-only; a missing/invalid credential fails closed (method treated as not-configured)

### Admin — Customer Management (Phase 9)

Give the store owner a customer administration surface in the existing admin panel. Extends the Phase 1 auth/role model (`users.role` enum) and the Phase 5 admin shell + `verifyAdminSession()` dual-auth pattern. All reads/writes are admin-gated and server-only; no password hashes or tokens ever reach the browser.

- [x] **ADMN-08**: Admin can view a searchable, paginated list of all registered customers (name, email, role, email-verification status, join date, and order count) *(delivered: Plans 09-01/09-03 — listCustomersForAdmin no-PII DTO + order-count aggregate; /admin/customers list with search/pagination/RoleBadge)*
- [x] **ADMN-09**: Admin can trigger a password reset for a customer via a one-time, time-limited email link (reuses the `verificationTokens` + Resend seam); the admin never sees or sets the plaintext password *(delivered: Plans 09-02/09-04 — sendCustomerPasswordReset (1h pwreset_ link, one live link, token never returned), resetPassword (single-use, argon2id, session revoke, generic errors), public /reset-password page; live-email round-trip is a go-live human-verify)*
- [x] **ADMN-10**: Admin can change a customer's role — promote a customer to admin or revoke admin back to customer — with server-side guards that refuse to demote the last remaining admin or the acting admin's own account *(delivered: Plans 09-02/09-03 — updateCustomerRole with self-lockout + atomic last-admin guards; confirm-gated toggle with self-row disable)*
- [x] **ADMN-11**: Admin can directly set a new password for any customer (support path alongside the email reset link) — argon2id-hashed server-side, admin-gated; setting a password invalidates any outstanding reset link and revokes the target's live sessions (never the acting admin's own) *(delivered 2026-07-12: adminSetCustomerPassword action + "Set password" dialog in CustomerRowActions; added post-UAT at owner request)*

### Admin — Categories & Brands CRUD (Phase 10)

Give the store owner CRUD control over the two catalog taxonomy entities (categories, brands) in the existing admin panel. Post-v1 scope added 2026-07-12. Reuses the Phase 5 admin shell + `verifyAdminSession()` dual-auth and product-CRUD conventions (soft-delete via `isActive`, `ActionResult` DTOs, `uniqueSlug`, cache invalidation).

- [x] **ADMN-12**: Admin can create, rename, and soft-delete/restore **product categories** (name + immutable slug) with a per-category product count shown; the storefront taxonomy is DB-driven so active categories are browsable at `/<slug>` and appear in nav, while soft-deleted (`isActive=false`) categories 404 and disappear from nav/filters (replaces the hardcoded `VALID_CATEGORY_SLUGS`).
- [x] **ADMN-13**: Admin can create, rename, and soft-delete/restore **brands** with a per-brand product count shown; only active brands appear in storefront brand filters. Deactivating a category/brand never cascades to (or hard-deletes) its products — the `product.categoryId`/`brandId` FKs are preserved.

## v2 Requirements

### Promotions

- **PROMO-01**: Admin can create discount codes with percentage or fixed amount
- **PROMO-02**: User can apply discount code at checkout

### Social

- **SOCL-01**: User can leave a product review and star rating
- **SOCL-02**: User can save products to a wishlist

### Advanced

- **ADV-01**: Multi-currency support with automatic conversion
- **ADV-02**: Advanced sales analytics dashboard for admin
- **ADV-03**: Abandoned cart recovery emails

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-vendor / marketplace | Single-seller store only |
| Mobile native app | Web-first; responsive design covers mobile |
| Subscription / recurring billing | Not applicable to product types |
| Address validation API | Adds third-party cost not justified at launch volume |
| Real-time order GPS tracking | Over-engineered for v1 |
| Live chat / support widget | Out of scope for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 6 | Complete (06-01/06-02 — 2 browser-UX human-verify items in 06-HUMAN-UAT) |
| CATA-01 | Phase 2 | Pending |
| CATA-02 | Phase 2 | Pending |
| CATA-03 | Phase 2 | Pending |
| CATA-04 | Phase 2 | Complete (02-03) |
| CART-01 | Phase 3 | Complete (03-02) |
| CART-02 | Phase 3 | Complete (03-02) |
| CART-03 | Phase 3 | Complete (03-02) |
| CHKT-01 | Phase 4 | Pending |
| CHKT-02 | Phase 4 | Pending |
| CHKT-03 | Phase 4 | Pending |
| CHKT-04 | Phase 4 | Pending |
| CHKT-05 | Phase 4 | Complete (04-04 status endpoint + 04-06 confirmation page UI) |
| PAY-01 | Phase 4 | Complete (04-03+04-04) |
| PAY-02 | Phase 4 | Pending (deferred — PayPal NGN blocker D-05a) |
| PAY-03 | Phase 4 | Complete (04-03 bank transfer action + 04-06 bank details confirmation UI) |
| PAY-04 | Phase 4 | Complete (04-02 toggle + 04-03/04 enforcement) |
| ORD-01 | Phase 4 | Complete (04-02+04-04) |
| ORD-02 | Phase 4 | Complete (04-02+04-03 bank transfer email + 04-06 bank details UI) |
| ORD-03 | Phase 5 | Complete (05-04) |
| ADMN-01 | Phase 5 | Complete (05-03/05-05 — live Blob upload go-live human-verify) |
| ADMN-02 | Phase 5 | Complete (05-03/05-05) |
| ADMN-03 | Phase 5 | Complete (05-04/05-06) |
| ADMN-04 | Phase 5 | Complete (05-01/05-04/05-06 — live toggle→checkout go-live human-verify) |
| PAY-05 | Phase 7 | Pending |
| PAY-06 | Phase 7 | Pending |
| PAY-12 | Phase 7 | Pending |
| PAY-07 | Phase 7.1 | Satisfied-via-channel (D-11) |
| PAY-08 | Phase 7.1 | Satisfied-via-channel (D-11) |
| PAY-09 | Phase 7.1 | Complete (sandbox — D-19) |
| PAY-10 | Phase 7.1 | Complete (sandbox — D-19) |
| PAY-11 | Phase 7.1 | Complete (sandbox — D-19) |
| ADMN-05 | Phase 8 | Pending |
| ADMN-06 | Phase 8 | Pending |
| ADMN-07 | Phase 8 | Pending |
| ADMN-08 | Phase 9 | Complete (09-01/09-03) |
| ADMN-09 | Phase 9 | Complete (09-02/09-04 — live-email go-live human-verify) |
| ADMN-10 | Phase 9 | Complete (09-02/09-03) |
| ADMN-11 | Phase 9 | Complete (09-02/09-03 — added post-UAT) |
| ADMN-12 | Phase 10 | Complete (10-02/10-03/10-04/10-05 — browser human-verify pending) |
| ADMN-13 | Phase 10 | Complete (10-02/10-03/10-05 — browser human-verify pending) |

**Coverage:**
- v1 requirements: 27 total
- Phase 7 (Paystack + Flutterwave) requirements: 3 (PAY-05, PAY-06, PAY-12)
- Phase 7.1 (Additional NG Gateways, fast-follow) requirements: 5 (PAY-07..PAY-11)
- Phase 8 (Admin-Managed Payment Credentials) requirements: 3 (ADMN-05, ADMN-06, ADMN-07)
- Phase 9 (Admin Customer Management) requirements: 4 (ADMN-08, ADMN-09, ADMN-10, ADMN-11)
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-06*
*Last updated: 2026-07-02 — split Phase 7: Paystack+Flutterwave (PAY-05/06/12) stay in Phase 7; PAY-07..PAY-11 move to fast-follow Phase 7.1 (per Phase 7 CONTEXT D-01)*
*2026-07-07 — Phase 7.1: PAY-09/10/11 built as Interswitch/GTPay/Remita redirect adapters (sandbox-verified, toggle OFF by default, D-19). PAY-07/08 satisfied-via-channel through the Phase 7 aggregators (D-11) — no standalone build.*
*2026-07-11 — Phase 8 added: Admin-Managed Payment Credentials (ADMN-05/06/07). Move all 8 gateways' credentials from .env into the DB-backed admin portal, encrypted at rest with one master key, DB-overrides-env with fallback.*
*2026-07-12 — Phase 9 added: Admin Customer Management (ADMN-08/09/10). View all customers, admin-triggered password reset (email link), and role promote/demote with last-admin/self-lockout guards. Extends Phase 1 role model + Phase 5 admin dual-auth.*
*2026-07-12 — Phase 10 added (post-v1): Categories & Brands CRUD (ADMN-12/13). Admin CRUD over catalog taxonomy with soft-delete; storefront category taxonomy decoupled from hardcoded slug lists. Delete semantics locked to soft-delete by owner.*
