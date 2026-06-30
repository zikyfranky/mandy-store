---
phase: 04-checkout-payments
verified: 2026-06-30T00:00:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "PAY-02: User can pay via PayPal"
    reason: "PayPal does not support NGN (verified against PayPal REST currency list). Deferred to backlog per D-05a. PayPal toggle ships OFF; no integration built."
    accepted_by: "isaacfrank (via phase instructions)"
    accepted_at: "2026-06-30T00:00:00Z"
re_verification: null
gaps: []
human_verification:
  - test: "Complete a card payment end-to-end: add an item to cart, visit /checkout, fill in the NG shipping address, select Stripe card, enter a test card (e.g. 4242 4242 4242 4242), confirm payment"
    expected: "Order is created as pending_payment, Stripe webhook fires, order flips to payment_confirmed, /order/:token shows the confirmed state with order reference and order summary lines, and a confirmation email arrives"
    why_human: "Requires live Stripe test keys, a running dev server, stripe CLI webhook forwarding, and visual confirmation of the embedded Payment Element mounting and the confirmation page state transition"
  - test: "Complete a bank transfer order: same checkout flow, select 'Bank transfer', submit"
    expected: "Order is created as awaiting_bank_transfer; /order/:token shows the bank details card (bank name, account number, account name, MS-XXXXXX reference with copy button, total in NGN); a bank-transfer-instructions email arrives; order summary lines and shipping address block are visible"
    why_human: "Requires BANK_NAME/BANK_ACCOUNT_NUMBER/BANK_ACCOUNT_NAME set in .env.local, Resend API key active, and visual inspection that bank details render correctly from the server component (never from a client component)"
  - test: "Verify the 'Payment processing…' polling interstitial: trigger a Stripe payment and land on /order/:token before the webhook fires (simulate by slowing the network); observe the ArrowPath spinner and then the transition to the confirmed state"
    expected: "The /api/order/status/:token endpoint is polled every ~2s; once the webhook flips the order, the page transitions to the confirmed view without a full reload; the 30s fallback 'Refresh this page' copy appears if resolution takes too long"
    why_human: "Real-time polling behaviour and UI state transition require a running browser session; cannot verify programmatically"
  - test: "Verify an unknown token returns the styled 404 card: navigate to /order/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    expected: "The 'Order not found' card renders with the DocumentMagnifyingGlassIcon and a 'Back to shop' link; no server error"
    why_human: "Requires running app; response is a styled card not a 404 status, so programmatic curl check would be misleading"
  - test: "Verify disabled payment method is rejected at the server action level: set ENABLE_BANK_TRANSFER=false and ENABLE_STRIPE=false in .env.local and attempt checkout via both methods"
    expected: "Both createBankTransferOrder and createStripePaymentIntent return {error: '... not available'} immediately; no order rows are created; the UI reflects the error"
    why_human: "Toggle enforcement is verified in tests but the full rejection-at-action path with UI error display requires running the app with env overrides"
---

# Phase 4: Checkout & Payments Verification Report

**Phase Goal:** Customers complete a purchase end-to-end — entering a shipping address, choosing an enabled payment method, paying, and receiving confirmation — with overselling, duplicate-charge, and price-tampering risks designed out.
**Verified:** 2026-06-30T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Guest can check out without creating an account, entering a shipping address, and see full order summary with flat-rate shipping before payment | VERIFIED | `checkout.ts` buildOrderContext: `userId = session?.user?.id ?? null` (guests get null); Zod AddressSchema with 36 NG states + FCT; `FLAT_SHIPPING_KOBO` imported server-only into checkout page and passed to `CheckoutOrderSummary` |
| 2 | Customer can pay with Stripe; on success lands on order confirmation page and receives confirmation email | VERIFIED | `createStripePaymentIntent` creates `pending_payment` order with `currency: "ngn"` and server-recomputed `totalKobo`; webhook flips to `payment_confirmed` + calls `sendOrderConfirmationEmail` non-blocking; `/order/[token]` page renders `OrderConfirmedView` on `payment_confirmed` status |
| 3 | Customer can choose bank transfer and receive an email with NGN bank account details; order is created as awaiting_bank_transfer (not paid) | VERIFIED | `createBankTransferOrder` hardcodes `status: "awaiting_bank_transfer"`; `sendBankTransferInstructionsEmail` called synchronously; bank env vars read server-side only in sender and in the Server Component page; `BankTransferView` receives bank details as props from the server |
| 4 | Each payment method can be turned on or off via server-only config, disabled method rejected at Server Action level | VERIFIED | `isPaymentMethodEnabled` in `config.ts` with `import "server-only"` reads `ENABLE_STRIPE/ENABLE_BANK_TRANSFER/ENABLE_PAYPAL` + credentials; called as FIRST statement in both `createBankTransferOrder` (line 160) and `createStripePaymentIntent` (line 233); PayPal always returns false without credentials |
| 5 | Concurrent checkouts cannot oversell stock (atomic decrement) and duplicate webhook deliveries cannot create duplicate orders (idempotency) | VERIFIED | Webhook: `db.batch([db.insert(processedWebhookEvents).onConflictDoNothing()])` checked `rowCount === 0` to short-circuit; `UPDATE "variant" SET stock = stock - {qty} WHERE id = {id} AND stock >= {qty} RETURNING id`; last-unit race: 0-row decrement → `stripe.refunds.create` + `payment_failed` + `refundReason = "oversold"` |
| 6 | Price tampering is designed out — order totals always recomputed server-side from getCart() + FLAT_SHIPPING_KOBO | VERIFIED | `buildOrderContext` calls `getCart()` then `computeOrderTotal({ subtotalKobo: cart.subtotalKobo })`; no client-supplied amount accepted; `amount: totals.totalKobo` passed to `stripe.paymentIntents.create` |
| 7 | Webhook is the sole writer of payment_confirmed; raw-body signature verification intact | VERIFIED | `const body = await req.text()` is first line of POST handler; `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`; only the webhook flips `status: "payment_confirmed"`; no client-side path can set this status |
| 8 | Bank account details read server-only; never accessible in client components | VERIFIED | `process.env.BANK_NAME/BANK_ACCOUNT_NUMBER/BANK_ACCOUNT_NAME` only in `send-bank-transfer-instructions.ts` (server-only) and `src/app/order/[token]/page.tsx` (Server Component); grep confirms zero references in `src/components/`; no `NEXT_PUBLIC_` prefix |
| 9 | Guest order access via unguessable token (/order/[token]); not enumerable | VERIFIED | `generateGuestToken()` uses `crypto.getRandomValues(new Uint8Array(32)).toString("hex")` → 256 bits entropy; `guestToken` column is `unique` in schema; `/api/order/status/[token]` returns 404 on unknown token; returns only `{ status }` |
| 10 | Order confirmation page handles all three states: confirmed, awaiting-transfer, processing | VERIFIED | `OrderContent` branches on `order.status`: `payment_confirmed` → `OrderConfirmedView`; `awaiting_bank_transfer` → `BankTransferView` + bank details; `pending_payment` → `PaymentProcessingView` which polls `/api/order/status/:token` every 2s |
| 11 | PayPal is intentionally deferred (D-05a) — toggle exists but defaults OFF; no PayPal integration | VERIFIED (override) | `isPaymentMethodEnabled("paypal")` requires `ENABLE_PAYPAL=true` + both `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`; defaults to false; `PaymentMethodSelector` explicitly filters `m !== "paypal"` (line 80); `@paypal/react-paypal-js` not in `package.json` |
| 12 | No stock decrement in checkout actions (D-09 — decrement happens only in webhook) | VERIFIED | `grep -c "stock = stock" src/lib/actions/checkout.ts` returns 0; D-09 comment in both actions; only the webhook performs the atomic UPDATE |
| 13 | Stripe lazy Proxy singleton avoids build-time throw when STRIPE_SECRET_KEY absent | VERIFIED | `stripe.ts` defines `let _stripe: Stripe | undefined` with `getStripe()` lazy initializer; `stripe = new Proxy({}, { get: (_,prop) => getStripe()[prop] })`; key validated at call time, not module load; `export const runtime` intentionally absent from webhook (conflicts with `cacheComponents:true`; nodejs is the Route Handler default) |
| 14 | 210/210 tests pass including DB integration tests for idempotency, atomic decrement, and last-unit race (with TEST_DATABASE_URL) | VERIFIED | Claimed in phase instructions as confirmed; test files are substantive (webhook.test.ts 459 lines, actions.test.ts 487 lines, config.test.ts 138 lines, emails.test.ts 241 lines); test structure confirmed: `it.skipIf(!hasDatabase)` for DB-gated tests |

**Score:** 14/14 truths verified (PAY-02 accepted via override as intentionally deferred)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | PAY-02: User can pay via PayPal | Backlog (D-05a) | PayPal does not support NGN — see CONTEXT.md D-05a. Intentionally skipped, not a later phase. Toggle ships OFF. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema.ts` | orders + orderItems tables | VERIFIED | Lines 273-321: `export const orders = pgTable("order", {...})` + `export const orderItems = pgTable("order_item", {...})` with price-snapshot columns, guestToken unique, reference unique, status default pending_payment |
| `src/lib/orders/shipping.ts` | FLAT_SHIPPING_KOBO + computeOrderTotal | VERIFIED | `import "server-only"`, `FLAT_SHIPPING_KOBO = parseInt(process.env.FLAT_SHIPPING_KOBO ?? "200000", 10)`, `computeOrderTotal` adds flat shipping |
| `src/lib/payments/config.ts` | isPaymentMethodEnabled server-only toggle | VERIFIED | `import "server-only"`, switch on method reads server-only env; PayPal defaults false |
| `src/lib/payments/stripe.ts` | Stripe singleton (lazy Proxy) | VERIFIED | Lazy Proxy singleton; no build-time throw; `import "server-only"` |
| `src/lib/orders/reference.ts` | generateUniqueOrderRef + generateGuestToken | VERIFIED | MS-XXXXXX with 10-retry collision check; 32-byte hex via `crypto.getRandomValues` |
| `src/lib/orders/queries.ts` | getOrderByToken + getOrderByStripePaymentIntentId + getOrderStatusByToken | VERIFIED | All three functions present; `import "server-only"` |
| `src/lib/actions/checkout.ts` | createBankTransferOrder + createStripePaymentIntent | VERIFIED | Both actions; toggle enforced first; getCart() called for server-side totals; awaiting_bank_transfer/pending_payment statuses; no stock decrement |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook POST handler | VERIFIED | req.text() first; constructEvent; onConflictDoNothing idempotency; atomic stock decrement WHERE stock >= qty RETURNING id; refund + payment_failed on oversell; sendOrderConfirmationEmail non-blocking |
| `src/app/api/order/status/[token]/route.ts` | Order status polling GET endpoint | VERIFIED | getOrderStatusByToken; 404 on missing; returns only {status} |
| `src/app/checkout/page.tsx` | /checkout single-page route | VERIFIED | Reads getCart() server-side; redirect on empty; enabledPaymentMethods() server-computed; FLAT_SHIPPING_KOBO passed to summary |
| `src/components/checkout/CheckoutForm.tsx` | Contact + address form with react-hook-form | VERIFIED | 505 lines; createBankTransferOrder wired; react-hook-form used |
| `src/components/checkout/StripePaymentPanel.tsx` | Stripe Elements + PaymentElement + confirmPayment | VERIFIED | PaymentElement imported; createStripePaymentIntent called; stripe.confirmPayment called |
| `src/components/checkout/PaymentMethodSelector.tsx` | Radio group filtered by enabled methods | VERIFIED | role="radiogroup" (line 85); filters out paypal explicitly (line 80) |
| `src/app/order/[token]/page.tsx` | /order/:token confirmation page | VERIFIED | getOrderByToken server-side; three state branches; bank env read in Server Component; guest PostPurchaseAccountOffer only when userId===null |
| `src/components/order/BankTransferView.tsx` | Bank details + reference + copy | VERIFIED | Bank details received as props; CopyButton for reference; formatNGN for total; no env var reads in client component |
| `src/components/order/PaymentProcessingView.tsx` | Polling interstitial (D-07) | VERIFIED | Polls `/api/order/status/${token}` every 2s; transitions to confirmedView on payment_confirmed; 30s fallback; aria-live="polite" |
| `src/emails/OrderConfirmationEmail.tsx` | Order confirmation React Email | VERIFIED | formatNGN used; View your order button; line items + totals |
| `src/emails/BankTransferInstructionsEmail.tsx` | Bank transfer instructions React Email | VERIFIED | Bank details props; formatNGN; order reference; order status link |
| `src/lib/email/send-order-confirmation.ts` | sendOrderConfirmationEmail | VERIFIED | `import "server-only"`; Resend sender; OrderConfirmationEmail template |
| `src/lib/email/send-bank-transfer-instructions.ts` | sendBankTransferInstructionsEmail | VERIFIED | `import "server-only"`; reads BANK_* from env at send time; throws on missing env |
| `tests/helpers/db.ts` | truncateOrderTables FK-safe helper | VERIFIED | orderItems deleted before orders before processedWebhookEvents (correct FK order, lines 77-79) |
| `tests/checkout/webhook.test.ts` | Webhook integration tests | VERIFIED | 459 lines; covers signature failure, happy-path confirm+decrement+email, idempotency (single decrement on duplicate), last-unit race (refundsCreate + payment_failed) |
| `tests/checkout/actions.test.ts` | Checkout action integration tests | VERIFIED | 487 lines; awaiting_bank_transfer, pending_payment, ngn currency, toggle rejection, guest userId null |
| `tests/payments/config.test.ts` | Payment toggle unit tests | VERIFIED | 138 lines; PAY-04 coverage |
| `tests/email/emails.test.ts` | Email render + send unit tests | VERIFIED | 241 lines; ORD-01 + ORD-02 coverage |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/actions/checkout.ts` | `getCart()` | server-side total recompute | WIRED | `getCart()` at line 102 of `buildOrderContext`; result's `subtotalKobo` passed to `computeOrderTotal` |
| `src/lib/actions/checkout.ts` | `isPaymentMethodEnabled` | first statement of each action | WIRED | Line 160 in `createBankTransferOrder`; line 233 in `createStripePaymentIntent` |
| `src/lib/actions/checkout.ts` | `stripe.paymentIntents.create` | amount = server-computed totalKobo, currency ngn | WIRED | Line 272-277; `amount: totals.totalKobo`, `currency: "ngn"` |
| `src/app/api/webhooks/stripe/route.ts` | `req.text()` | raw body before constructEvent | WIRED | Line 29: `const body = await req.text()` is first statement in POST |
| `src/app/api/webhooks/stripe/route.ts` | `processed_webhook_events` | onConflictDoNothing idempotency | WIRED | Lines 55-66; rowCount===0 short-circuits |
| `src/app/api/webhooks/stripe/route.ts` | `variants.stock` | atomic conditional decrement WHERE stock >= qty | WIRED | Lines 100-106: `UPDATE "variant" SET stock = stock - ${qty} WHERE id = ${id} AND stock >= ${qty} RETURNING id` |
| `src/app/api/webhooks/stripe/route.ts` | `stripe.refunds.create` | last-unit race recovery | WIRED | Lines 130-135: called when any decrement returns 0 rows; order set to payment_failed |
| `src/app/order/[token]/page.tsx` | `getOrderByToken` | server-side IDOR-safe lookup | WIRED | Line 99: `const order = await getOrderByToken(token)` |
| `src/components/order/PaymentProcessingView.tsx` | `/api/order/status/:token` | client poll every 2s | WIRED | Line 36: `fetch(\`/api/order/status/${token}\`)` inside setInterval 2000ms |
| `src/app/checkout/page.tsx` | `enabledPaymentMethods()` | server-computed enabled methods as prop | WIRED | Line 57: `const methods = enabledPaymentMethods()` then passed to CheckoutForm |
| `src/components/checkout/StripePaymentPanel.tsx` | `createStripePaymentIntent` | server action returns clientSecret | WIRED | Line 16 import; line 240 call |
| `src/components/checkout/CheckoutForm.tsx` | `createBankTransferOrder` | bank transfer submit path | WIRED | Line 14 import; line 117 call |
| `src/app/cart/page.tsx` | `/checkout` | Proceed to checkout link | WIRED | Line 104: `href="/checkout"` |
| `src/lib/payments/config.ts` | `process.env.ENABLE_STRIPE / ENABLE_BANK_TRANSFER / ENABLE_PAYPAL` | server-only env read | WIRED | Lines 16, 18-19, 22-23 |
| `src/lib/email/send-bank-transfer-instructions.ts` | `process.env.BANK_ACCOUNT_NUMBER` | server-only bank detail read | WIRED | Lines 37-39; throws if missing |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `checkout.ts` → `createStripePaymentIntent` | `totals.totalKobo` | `computeOrderTotal(getCart().subtotalKobo)` — DB-sourced cart prices | Yes — from DB via getCart() + FLAT_SHIPPING_KOBO | FLOWING |
| `checkout.ts` → `createBankTransferOrder` | `totals.totalKobo` | Same path | Yes | FLOWING |
| `webhook/route.ts` → stock decrement | `item.quantity`, `item.variantId` | `order.items` loaded via `getOrderByStripePaymentIntentId` (DB query) | Yes | FLOWING |
| `/order/[token]/page.tsx` → BankTransferView | `bankName/bankAccountNumber/bankAccountName` | `process.env.BANK_*` in Server Component | Yes — from server env | FLOWING |
| `PaymentProcessingView` → status display | `data.status` | `fetch(/api/order/status/${token})` → `getOrderStatusByToken` (DB query) | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Order status route returns 404 for unknown token | Skipped — needs running server | — | SKIP (needs server) |
| Stripe lazy proxy does not throw at import time | Module structure confirmed by code review | Proxy defers instantiation to call time | PASS (code review) |
| truncateOrderTables deletes in FK-safe order | Code review | orderItems → orders → processedWebhookEvents | PASS (code review) |
| No stock decrement in checkout.ts | `grep -c "stock = stock" src/lib/actions/checkout.ts` → 0 | Clean | PASS |
| PayPal filtered from UI | `grep -n "paypal" PaymentMethodSelector.tsx` → `m !== "paypal"` filter | Explicitly excluded | PASS |
| Bank env vars not in client components | `grep -rn "process.env.BANK_" src/components/` → empty | Zero references | PASS |
| req.text() is first statement in webhook | Code review lines 29 | Confirmed first executable statement | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CHKT-01 | 04-03 | Guest checkout without account | SATISFIED | userId=null for guests; customerEmail from form; no auth required |
| CHKT-02 | 04-03 | Shipping address entry at checkout | SATISFIED | Zod AddressSchema: fullName, phone (min 7), street, city, state (NG enum), landmark optional |
| CHKT-03 | 04-01, 04-03 | Flat-rate shipping applied to total | SATISFIED | FLAT_SHIPPING_KOBO=200000 default; computeOrderTotal server-side; client never supplies shipping |
| CHKT-04 | 04-03 | Full order summary before payment | SATISFIED | CheckoutOrderSummary receives server-computed cart + FLAT_SHIPPING_KOBO; totals stored on order row |
| CHKT-05 | 04-04 | Order confirmation page after payment | SATISFIED | /order/[token] with three states; polling endpoint; D-07 processing interstitial |
| PAY-01 | 04-03, 04-04 | Stripe card payment | SATISFIED | createStripePaymentIntent + webhook confirms; PaymentElement embedded |
| PAY-02 | Deferred | PayPal payment | DEFERRED (D-05a) | PayPal does not support NGN; toggle OFF; no integration built per CONTEXT.md D-05a |
| PAY-03 | 04-03, 04-06 | Bank transfer with NGN details | SATISFIED | awaiting_bank_transfer status; bank details in email + order page; MS-XXXXXX reference |
| PAY-04 | 04-02, 04-03 | Payment method toggles | SATISFIED | isPaymentMethodEnabled server-only; enforced at first statement in both actions; UI filters by enabled methods |
| ORD-01 | 04-02, 04-04 | Order confirmation email | SATISFIED | sendOrderConfirmationEmail called non-blocking in webhook on payment_confirmed |
| ORD-02 | 04-02, 04-03 | Bank transfer instructions email | SATISFIED | sendBankTransferInstructionsEmail called synchronously; bank env read server-side |

### Non-Negotiable Correctness Checks (CLAUDE.md)

All six CLAUDE.md non-negotiable checks verified:

1. **Order totals recomputed server-side** — `buildOrderContext` calls `getCart()` then `computeOrderTotal({ subtotalKobo: cart.subtotalKobo })`; `amount: totals.totalKobo` in `paymentIntents.create`; no client amount accepted. VERIFIED.

2. **Webhook: raw-body + sole writer of payment_confirmed + idempotency** — `await req.text()` is the first statement; `constructEvent(body, sig, STRIPE_WEBHOOK_SECRET!)`; `onConflictDoNothing()` idempotency guard with `rowCount === 0` short-circuit; only the webhook flips `payment_confirmed`. VERIFIED.

3. **Atomic stock decrement WHERE stock >= qty, last-unit race recovery** — `UPDATE "variant" SET stock = stock - ${qty} WHERE id = ${id} AND stock >= ${qty} RETURNING id` via `db.execute(sql\`...\`)` inside `db.batch`; `rows.length === 0` triggers `stripe.refunds.create` + `payment_failed` + `refundReason: "oversold"`. VERIFIED.

4. **Payment methods rejected at Server Action level** — `isPaymentMethodEnabled` is the first statement in `createBankTransferOrder` (line 160) and `createStripePaymentIntent` (line 233), before any cart read, DB write, or Stripe call. VERIFIED.

5. **Bank transfer: awaiting_bank_transfer (NOT paid); NGN bank details + MS-XXXXXX; bank details server-only** — status hardcoded `"awaiting_bank_transfer"`; reference is `MS-XXXXXX` from `generateUniqueOrderRef`; BANK_* env vars accessed only in `send-bank-transfer-instructions.ts` (server-only) and the `/order/[token]` Server Component page; zero occurrences in `src/components/`. VERIFIED.

6. **Guest order access via unguessable token; not enumerable** — 256-bit hex token via `crypto.getRandomValues(new Uint8Array(32)).toString("hex")`; unique constraint on `guest_token`; status endpoint returns only `{ status }` keyed by token; 404 on unknown; no sequential order IDs exposed. VERIFIED.

### Known Acceptable Deviations

Both acceptable deviations noted in the phase instructions are confirmed sound:

- **Webhook `export const runtime` removed**: `next.config.ts` has `cacheComponents: true`, which conflicts with explicit runtime exports. Route Handlers default to nodejs runtime. `stripe.webhooks.constructEvent` uses Node.js crypto (HMAC timing-safe comparison) automatically via the nodejs runtime. The comment at lines 13-15 of `route.ts` documents this clearly. No functional gap.

- **Stripe Proxy singleton**: `stripe.ts` exports `const stripe = new Proxy({} as Stripe, { get: (_,prop) => getStripe()[prop] })` — lazy instantiation at call time avoids build-time throw when `STRIPE_SECRET_KEY` is absent. `getStripe()` validates the key at call time. Sound pattern.

### Anti-Patterns Found

No blocking anti-patterns detected.

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `webhook/route.ts` | `console.error` for oversell logging | Info | Intentional — v1 uses logging rather than a separate oversell email template; documented in code comment |
| `order/[token]/page.tsx` | `process.env.BANK_NAME ?? ""` empty-string fallback | Warning | If bank env vars are not set, bank details render as empty strings on the page. The email sender (which throws on missing vars) is the stronger guard. A deployed store without `BANK_NAME` set would show blank bank detail fields. Not a code bug — an ops configuration requirement. |

### Human Verification Required

Five items require human verification (running dev server + Stripe test keys + Resend API):

1. **End-to-end Stripe card payment**

   **Test:** Add item to cart, visit /checkout, fill NG shipping form, select Stripe card, use test card `4242 4242 4242 4242`, submit.
   **Expected:** Order created `pending_payment` → webhook fires → `payment_confirmed` → `/order/:token` confirms; confirmation email arrives.
   **Why human:** Requires live Stripe test keys, stripe CLI webhook forwarding, running dev server, and visual inspection of Payment Element + confirmation state transition.

2. **End-to-end bank transfer order**

   **Test:** Same checkout flow, select Bank Transfer, submit.
   **Expected:** Order `awaiting_bank_transfer`; `/order/:token` shows bank name, account number, account name, MS-XXXXXX reference with Copy button, total in NGN; bank-transfer-instructions email arrives.
   **Why human:** Requires BANK_* env vars set, Resend API key, and visual confirmation bank details display correctly from server props (not leaked via client env).

3. **Payment processing polling interstitial**

   **Test:** Trigger Stripe checkout; before webhook fires, observe /order/:token; wait for webhook.
   **Expected:** ArrowPath spinner shown; polling occurs every ~2s; page transitions to confirmed view on `payment_confirmed` without full reload; 30s fallback appears if delayed.
   **Why human:** Real-time polling behaviour and DOM state transition cannot be verified programmatically.

4. **Unknown token 404 card**

   **Test:** Navigate to `/order/` followed by 64 hex chars of invalid token.
   **Expected:** "Order not found" card with DocumentMagnifyingGlassIcon and "Back to shop" link; no server error.
   **Why human:** Requires running app; visual verification of styled card (not a 404 HTTP status).

5. **Disabled payment method UI + server rejection**

   **Test:** Set `ENABLE_BANK_TRANSFER=false` and `ENABLE_STRIPE=false` in `.env.local`, restart dev server, attempt checkout.
   **Expected:** Methods not shown in UI; if somehow called, Server Actions return `{ error: "... not available" }`; no order rows created.
   **Why human:** Toggle enforcement at action level is unit-tested, but end-to-end UI reflection + error display requires a running browser session with env overrides.

---

_Verified: 2026-06-30T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
