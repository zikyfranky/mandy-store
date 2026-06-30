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
- [ ] **AUTH-04**: Logged-in user can view their order history

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

### Orders & Notifications

- [x] **ORD-01**: Customer receives order confirmation email after successful payment *(delivered: Plan 04-04 — sendOrderConfirmationEmail called non-blocking in webhook on payment_confirmed)*
- [x] **ORD-02**: Customer receives bank transfer instructions email when that method is chosen *(delivered: Plan 04-03 — sendBankTransferInstructionsEmail called synchronously in createBankTransferOrder)*
- [ ] **ORD-03**: Customer receives email when fulfillment status changes (e.g. shipped, delivered)

### Admin

- [ ] **ADMN-01**: Admin can add, edit, and delete products with images
- [ ] **ADMN-02**: Admin can manage product variants with individual prices and stock levels
- [ ] **ADMN-03**: Admin can view all orders and update fulfillment status
- [ ] **ADMN-04**: Admin can toggle Stripe / PayPal / bank transfer on or off

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
| AUTH-04 | Phase 6 | Pending |
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
| ORD-03 | Phase 5 | Pending |
| ADMN-01 | Phase 5 | Pending |
| ADMN-02 | Phase 5 | Pending |
| ADMN-03 | Phase 5 | Pending |
| ADMN-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-06*
*Last updated: 2026-06-06 after initial definition*
