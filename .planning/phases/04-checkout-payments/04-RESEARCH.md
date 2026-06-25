# Phase 4: Checkout & Payments — Research

**Researched:** 2026-06-25
**Domain:** Payment processing (Stripe + PayPal + bank transfer), order schema design, webhook idempotency, atomic inventory management, transactional email
**Confidence:** HIGH (architecture/Stripe/DB patterns), MEDIUM (PayPal NGN workaround — see blocker), HIGH (schema design)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Single-page `/checkout` — address on left, sticky order summary on right, payment method inline. No wizard.
- **D-02:** Guest identity = email field only. Logged-in users have email prefilled from session.
- **D-03:** Optional account creation offered AFTER purchase on the confirmation page. Never on the critical path.
- **D-04:** NG address fields: full name, phone (required), street, city, State dropdown (36 states + FCT), optional landmark. No postal code.
- **D-05:** Embedded on-site payments — Stripe Payment Element + PayPal JS buttons. No hosted redirect.
- **D-06:** Webhook is the SOLE authority for `payment_confirmed`. Client redirect never trusted.
- **D-07:** Confirmation page shows "Payment processing…" until webhook lands, then resolves.
- **D-08:** Failed payment stays on `/checkout` with inline error; cart + address preserved; order stays `pending_payment`.
- **D-09 (locked by Claude):** Stock decremented atomically ONLY on confirmed payment. For Stripe/PayPal: inside the idempotent webhook transaction. For bank transfer: when admin confirms (Phase 5). Recovery path for last-unit race (atomic decrement returns 0 rows for a paid order) MUST be designed — mark order for refund/manual review, notify customer.
- **D-10:** NGN bank account details from server-only env config (no `NEXT_PUBLIC_` prefix).
- **D-11:** Short order reference e.g. `MS-7F3K2A`. Order created as `awaiting_bank_transfer`.
- **D-12:** Guest order access via unguessable long random token link. No login required.
- **D-13:** Each payment method independently enable/disable via server-only config, rejected at Server Action / Route Handler level.
- **D-14:** Two new Resend emails: order confirmation (on `payment_confirmed`) + bank-transfer instructions (on bank-transfer order creation).

### Claude's Discretion

- Order schema design: exact columns for `orders`/`order_items`/address. Must snapshot price-at-purchase into `order_items`.
- Order-reference generation collision handling.
- Token length/encoding for guest access link.
- Stripe PaymentIntent vs newer API surface; PayPal SDK version; webhook route structure.
- "Payment processing…" reconciliation mechanism (poll vs server-render-on-load).
- Whether order creation happens before PaymentIntent creation.

### Deferred Ideas (OUT OF SCOPE)

- Admin order management + bank-transfer confirmation + fulfillment status updates → Phase 5
- Logged-in customer order history → Phase 6
- Status-change emails (shipped/delivered) → Phase 5 (ORD-03)
- Discount codes / promotions → v2
- Address validation API / saved addresses → out of scope
- Inventory hold + timeout-release for abandoned/unpaid orders → not built

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHKT-01 | Guest checkout without account | D-02/D-03: email-only identity, optional post-purchase account offer |
| CHKT-02 | Shipping address entry | D-04: NG-appropriate fields, State dropdown, react-hook-form + Zod |
| CHKT-03 | Flat-rate shipping fee applied | Order total = cart subtotal + flat shipping constant; recomputed server-side |
| CHKT-04 | Full order summary before payment | Sticky summary panel from `getCart()` + flat shipping server-recomputed |
| CHKT-05 | Order confirmation page | Token-bearing URL (D-12); "Payment processing…" reconciliation (D-07) |
| PAY-01 | Stripe card payments | Stripe Payment Element + PaymentIntent flow; webhook `payment_intent.succeeded` |
| PAY-02 | PayPal payments | **BLOCKER: PayPal does not support NGN** — see Architectural Decision Required section |
| PAY-03 | Bank transfer (NGN account details) | Server-only env config; `MS-XXXXXX` ref; `awaiting_bank_transfer` status |
| PAY-04 | Payment method server-only toggles | `isPaymentMethodEnabled()` checked at top of every action/route handler |
| ORD-01 | Order confirmation email | Resend + React Email; fires in webhook handler on `payment_confirmed` |
| ORD-02 | Bank transfer instructions email | Resend + React Email; fires when bank-transfer order created; includes NGN account + ref |

</phase_requirements>

---

## Summary

Phase 4 wires the cart Checkout CTA stub into a complete end-to-end purchase flow: address collection, payment, order creation, confirmation, and transactional email. The existing schema provides `orderStatusEnum` (8 values), `processedWebhookEvents` (with a unique constraint on event ID), and `variants.stock` (the atomic decrement target). This phase adds `orders`, `order_items`, and a shipping address snapshot.

**Critical BLOCKER discovered:** PayPal's REST API does not support NGN (Nigerian Naira) as a transaction currency. The supported currency list (AUD, BRL, CAD, CNY, CZK, DKK, EUR, HKD, HUF, ILS, JPY, MYR, MXN, TWD, NZD, NOK, PHP, PLN, GBP, SGD, SEK, CHF, THB, USD) does not include NGN. This must be resolved as an architectural decision before planning begins. The two viable paths are: (A) charge in USD with live exchange rate conversion, or (B) disable PayPal for the initial launch. See the Open Questions section.

**Stripe and NGN:** Stripe does support NGN as a presentment currency for Nigerian payment methods (minimum 500 NGN; maximum 100,000,000 NGN). Amounts are specified in kobo (the subunit: 1 NGN = 100 kobo), which matches the existing `priceKobo` convention already established in the schema. However, Stripe's NGN support currently requires a US-based Stripe account with USD settlement. If the merchant account is based in Nigeria, verify account eligibility with Stripe support before planning. [VERIFIED: docs.stripe.com/payments/countries/nigeria]

**Neon HTTP driver limitation:** The current `db` client (`drizzle-orm/neon-http`) does not support interactive `db.transaction()`. The webhook handler requires atomicity (insert idempotency record + update order status + decrement stock in one transaction). The plan must either switch the webhook's DB client to the WebSocket driver (`drizzle-orm/neon-serverless`) or use Drizzle's batch API (which is atomic for neon-http). [VERIFIED: orm.drizzle.team/docs/connect-neon]

**Primary recommendation:** Use Stripe Payment Element + PaymentIntent for card payments; resolve PayPal/NGN blocker before or at planning; build bank transfer as the safe fallback that always works; use Drizzle batch API (atomic, neon-http compatible) for webhook transactions; use `getCart()` + server-side flat shipping constant as the single source of order total truth.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Checkout form (address + email) | Frontend (Server Component + Client islands) | — | Form state is client; initial prefill from server session |
| Order summary calculation | API/Backend (Server Action) | — | Never trust client prices; always recompute from `getCart()` |
| PaymentIntent creation | API/Backend (Server Action or Route Handler) | — | Secret key server-only; amount recomputed server-side |
| Stripe Payment Element render | Browser/Client | — | Card data tokenized client-side for PCI SAQ-A |
| PayPal Buttons render | Browser/Client | — | `@paypal/react-paypal-js` client component |
| PayPal create-order / capture-order | API/Backend (Route Handler) | — | Server-side PayPal API calls; amount recomputed server-side |
| Stripe webhook handler | API/Backend (Route Handler) | — | Raw body required for signature; never edge runtime |
| PayPal webhook handler | API/Backend (Route Handler) | — | Same as Stripe |
| Order creation + stock decrement | API/Backend (inside webhook txn) | — | Atomic; only webhook marks payment_confirmed |
| Bank transfer order creation | API/Backend (Server Action) | — | Writes `awaiting_bank_transfer`; no third-party SDK |
| Guest access token generation | API/Backend (Server Action) | — | Must be cryptographically random; server-only |
| Confirmation page polling | Browser/Client | Frontend Server | Client polls `/api/order-status/:token`; or server re-render on load |
| Transactional email send | API/Backend (webhook handler + checkout action) | — | Resend API call server-only; uses existing Resend seam |
| Payment method toggle enforcement | API/Backend (every action/route handler) | — | Server-only env check; UI only reflects config |

---

## Standard Stack

### Core (new installs this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe | 22.3.0 | Stripe Node.js SDK — PaymentIntent creation, webhook verification | Official SDK; server-only |
| @stripe/stripe-js | 9.8.0 | Stripe.js loader — loads `window.Stripe` asynchronously | Required for PCI-compliant client-side Elements |
| @stripe/react-stripe-js | 6.6.0 | React Elements wrapper — `<Elements>`, `<PaymentElement>` | Official React wrapper for Payment Element |
| @paypal/react-paypal-js | 10.1.0 | PayPal Buttons + SDK provider | Official React SDK; supports createOrder/onApprove |
| react-hook-form | 7.80.0 | Checkout form state management | Minimal re-renders; built for complex address forms |
| @hookform/resolvers | 5.4.0 | Connects Zod to react-hook-form | Bridge package |

**Already installed (no new install needed):**

| Library | Current Version | Purpose |
|---------|----------------|---------|
| zod | 4.4.3 | Server + client schema validation (address, inputs) |
| resend | 6.14.0 | Transactional email delivery |
| @react-email/components | 1.0.12 | React Email template components |
| drizzle-orm | 0.45.2 | DB ORM — used for all order writes |
| @neondatabase/serverless | 1.1.0 | Neon driver — HTTP for reads; need WebSocket for transactions |

**Version verification:** [VERIFIED: npm registry 2026-06-25]

```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js @paypal/react-paypal-js react-hook-form @hookform/resolvers
```

**Note on Neon WebSocket driver for transactions:**
The webhook handler needs atomicity. Options (both valid):

Option A — Drizzle batch API (stays on neon-http, avoids new driver):
```typescript
// Atomic for neon-http: all-or-nothing (same as a transaction)
import { db } from "@/lib/db/client"
await db.batch([
  db.insert(processedWebhookEvents).values({ id: eventId, provider: "stripe" }),
  db.update(orders).set({ status: "payment_confirmed" }).where(eq(orders.id, orderId)),
  db.sql`UPDATE variant SET stock = stock - ${qty} WHERE id = ${variantId} AND stock >= ${qty}`,
])
```
[VERIFIED: orm.drizzle.team/docs/batch-api — "If all statements succeed, the transaction commits. If any fail, the entire transaction rolls back."]

Option B — Switch webhook client to neon-serverless (WebSocket, full db.transaction()):
```typescript
import { Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const txDb = drizzle({ client: pool, schema })
await txDb.transaction(async (tx) => { ... })
```

**Recommendation:** Use the Drizzle batch API (Option A) to avoid introducing a second DB client and a second connection mode. The batch API is documented as transactional for Neon. Mark as Claude's discretion in the plan.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stripe Payment Element | Stripe Checkout (hosted) | Hosted redirect breaks D-05 (on-site) requirement |
| Drizzle batch API | Neon-serverless WebSocket + db.transaction() | Both are valid; batch avoids new driver; WebSocket gives richer semantics |
| react-hook-form | Native form + useFormState | RHF has better UX (per-field errors, controlled state without re-renders) |
| JWT guest token | UUID guest token | UUIDs are 36 chars, cryptographically sufficient; JWT adds signature overhead for no benefit here |

---

## Architecture Patterns

### System Architecture Diagram

```
Browser                     Next.js Server              Stripe/PayPal      Neon DB
─────────────────────────────────────────────────────────────────────────────────
/checkout (page)
  │  SSR: getCart() + session prefill
  │◄──────────────────────────────────────────────────── orders + cart read
  │
  [Address + Email Form]
  [Order Summary (server-computed)]
  [Payment Method Selector]
  │
  [Stripe tab selected]──► createCheckoutPaymentIntent()  ──► Stripe API
  │                         (Server Action)               ◄── client_secret
  │                         • recompute total from getCart()
  │                         • create order row (pending_payment)
  │                         • store paymentIntentId on order
  │◄── client_secret returned
  │
  [<Elements> mounts with client_secret]
  [<PaymentElement> renders card fields]
  │
  [Customer fills card]
  │──► stripe.confirmPayment()  ──► Stripe
  │                              ◄── redirects to /order/confirm?token=XXX
  │
/order/confirm?token=XXX
  [Server render: lookup order by token]
  │  status = pending_payment → show "Payment processing..."
  │  status = payment_confirmed → show "Success!"
  │  (or: client polls /api/order/status/:token every 2s until confirmed)
  │
  ▼ (async — seconds later)

POST /api/webhooks/stripe         ──► Stripe webhook
  • request.text() for raw body
  • stripe.webhooks.constructEvent(body, sig, secret)
  • Check event.type === "payment_intent.succeeded"
  • Batch (atomic):
      INSERT INTO processed_webhook_events (CONFLICT DO NOTHING)
      UPDATE orders SET status = "payment_confirmed"
      UPDATE variant SET stock = stock - qty WHERE stock >= qty RETURNING stock
      (if stock returns 0 rows: mark order "payment_failed", trigger refund API)
  • Send order confirmation email via Resend
  • Return 200 OK (always — even on duplicate)

─────────────────────────────────────────────────────────────────────────────────

[PayPal tab selected]──► createPayPalOrder()         ──► PayPal API
  │                       (Route Handler)             ◄── orderId
  │◄── orderId
  [<PayPalButtons> renders]
  [Customer approves PayPal]
  │──► capturePayPalOrder()                           ──► PayPal API
       (Route Handler — server captures)              ◄── capture result
       • verify capture status === "COMPLETED"
       • order stays pending_payment until webhook arrives

POST /api/webhooks/paypal
  • verify webhook signature
  • PAYMENT.CAPTURE.COMPLETED event
  • Same batch pattern as Stripe webhook

─────────────────────────────────────────────────────────────────────────────────

[Bank transfer selected]──► createBankTransferOrder()
  │                          (Server Action)
  │                          • recompute total from getCart()
  │                          • create order (awaiting_bank_transfer)
  │                          • generate MS-XXXXXX reference
  │                          • generate guest token
  │◄── redirect to /order/confirm?token=XXX
  │    (shows NGN account details + reference)
  • Send bank-transfer instructions email
  (Stock NOT decremented — admin confirms in Phase 5)
```

### Recommended Project Structure (new files this phase)

```
src/
├── app/
│   ├── checkout/
│   │   └── page.tsx                    # /checkout — single-page checkout
│   └── order/
│       └── [token]/
│           └── page.tsx                # /order/:token — guest confirmation/status page
├── api/
│   ├── webhooks/
│   │   ├── stripe/route.ts             # POST — Stripe webhook (raw body, constructEvent)
│   │   └── paypal/route.ts             # POST — PayPal webhook
│   ├── checkout/
│   │   ├── paypal-create-order/route.ts
│   │   └── paypal-capture-order/route.ts
│   └── order/
│       └── status/[token]/route.ts     # GET — polling endpoint for confirmation page
├── lib/
│   ├── actions/
│   │   └── checkout.ts                 # Server Actions: createStripePaymentIntent, createBankTransferOrder
│   ├── orders/
│   │   ├── queries.ts                  # getOrderByToken, getOrderForWebhook
│   │   └── reference.ts               # generateOrderRef (MS-XXXXXX), generateGuestToken
│   ├── payments/
│   │   ├── config.ts                   # isPaymentMethodEnabled() — server-only
│   │   ├── stripe.ts                   # Stripe client singleton (server-only)
│   │   └── paypal.ts                   # PayPal API helpers (server-only)
│   └── email/
│       ├── send-order-confirmation.ts
│       └── send-bank-transfer-instructions.ts
└── emails/
    ├── OrderConfirmationEmail.tsx
    └── BankTransferInstructionsEmail.tsx
```

### Pattern 1: Server-Side PaymentIntent Creation (Stripe)

```typescript
// src/lib/actions/checkout.ts
"use server"
import "server-only"
import { getCart } from "@/lib/cart/queries"
import { stripe } from "@/lib/payments/stripe"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { FLAT_SHIPPING_KOBO } from "@/lib/orders/shipping"

export async function createStripePaymentIntent(input: CheckoutInput) {
  // PAY-04: enforce server-side toggle
  if (!isPaymentMethodEnabled("stripe")) {
    return { error: "Payment method not available" }
  }

  // CLAUDE.md: never trust client prices — recompute from DB
  const cart = await getCart()
  if (cart.items.length === 0) return { error: "Cart is empty" }
  if (cart.hasOOS) return { error: "Remove out-of-stock items before checkout" }

  const totalKobo = cart.subtotalKobo + FLAT_SHIPPING_KOBO

  // Create order row (pending_payment) BEFORE PaymentIntent
  // — so we have an orderId to attach to the PI metadata
  const orderId = crypto.randomUUID()
  const guestToken = generateGuestToken()        // 32-byte hex = 64 chars
  const orderRef = await generateOrderRef()      // MS-XXXXXX

  await db.insert(orders).values({
    id: orderId,
    guestToken,
    reference: orderRef,
    status: "pending_payment",
    subtotalKobo: cart.subtotalKobo,
    shippingKobo: FLAT_SHIPPING_KOBO,
    totalKobo,
    customerEmail: input.email,
    // ...shipping address snapshot, userId (nullable)
  })

  // Create PaymentIntent — amount is the server-computed total in KOBO
  // Stripe treats NGN as a two-decimal currency (kobo = subunit)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalKobo,           // kobo (1 NGN = 100 kobo)
    currency: "ngn",
    automatic_payment_methods: { enabled: true },
    metadata: { orderId, orderRef },
  })

  // Attach PI id to order for webhook lookup
  await db.update(orders)
    .set({ stripePaymentIntentId: paymentIntent.id })
    .where(eq(orders.id, orderId))

  return { clientSecret: paymentIntent.client_secret!, guestToken }
}
```

[ASSUMED] NGN in Stripe accepts kobo as the smallest unit (two-decimal); the docs explicitly confirm NGN minimum 500 NGN and the currency is listed under Nigerian payment methods. The kobo-as-subunit assumption aligns with standard Stripe two-decimal currency behavior and the existing `priceKobo` schema convention.

### Pattern 2: Stripe Webhook Route Handler (App Router)

```typescript
// src/app/api/webhooks/stripe/route.ts
// Must NOT be edge runtime — needs Node.js crypto for signature verification
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { stripe } from "@/lib/payments/stripe"
import { db } from "@/lib/db/client"
import { processedWebhookEvents, orders, variants } from "@/lib/db/schema"
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation"

export async function POST(req: NextRequest) {
  // CRITICAL: use .text() — never .json() — raw body required for signature
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent
    const { orderId } = pi.metadata

    // Drizzle batch = atomic for neon-http (all-or-nothing)
    // insert-first idempotency: if event already processed, CONFLICT DO NOTHING
    // and subsequent reads return the order already marked confirmed — safe to re-200
    const [idempotencyResult] = await db.batch([
      db.insert(processedWebhookEvents)
        .values({ id: event.id, provider: "stripe" })
        .onConflictDoNothing(),
    ])

    // If 0 rows inserted, event was already processed — return 200 immediately
    if (idempotencyResult.rowCount === 0) {
      return NextResponse.json({ received: true })
    }

    // Look up order items for stock decrement
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { items: true },
    })

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 400 })
    }

    // Atomic batch: update order + decrement all variant stock
    // Stock decrement uses raw SQL to guarantee atomicity (WHERE stock >= qty)
    const stockDecrements = order.items.map((item) =>
      db.execute(sql`
        UPDATE variant
        SET stock = stock - ${item.quantity}
        WHERE id = ${item.variantId}
          AND stock >= ${item.quantity}
      `)
    )

    await db.batch([
      db.update(orders)
        .set({ status: "payment_confirmed", paidAt: new Date() })
        .where(eq(orders.id, orderId)),
      ...stockDecrements,
    ])

    // Check for last-unit race: any item where stock decrement returned 0 affected rows
    // (stock went to 0 between payment and webhook) — trigger refund + notify
    // NOTE: neon-http batch returns affected row counts — check each stockDecrement result
    // If any returned rowCount === 0 for a line item, that variant was oversold:
    //   1. stripe.refunds.create({ payment_intent: pi.id })
    //   2. db.update(orders).set({ status: "payment_failed", refundReason: "oversold" })
    //   3. Send oversell-notification email to customer
    // (Planner must design this handler path explicitly)

    // Send confirmation email (non-blocking — don't fail webhook on email error)
    await sendOrderConfirmationEmail(order).catch(console.error)
  }

  // Always return 200 — even for unhandled event types or duplicates
  return NextResponse.json({ received: true })
}
```

[CITED: docs.stripe.com/webhooks — "Use request.text() not request.json() — raw body required for constructEvent"]
[CITED: orm.drizzle.team/docs/batch-api — "If all statements succeed, the transaction commits. If any fail, the entire transaction rolls back"]

### Pattern 3: PayPal Server-Side Order Creation/Capture

```typescript
// src/app/api/checkout/paypal-create-order/route.ts
export async function POST(req: NextRequest) {
  if (!isPaymentMethodEnabled("paypal")) {
    return NextResponse.json({ error: "Payment method not available" }, { status: 400 })
  }

  // ⚠ BLOCKER: PayPal does not support NGN.
  // If this route runs, amount must be in a supported currency.
  // See Open Questions — architectural decision required BEFORE this code is written.

  const cart = await getCart()
  const totalKobo = cart.subtotalKobo + FLAT_SHIPPING_KOBO

  // If implementing USD workaround: convert totalKobo to USD using live rate
  // const totalUSD = (totalKobo / 100 / exchangeRate).toFixed(2)

  const accessToken = await getPayPalAccessToken()
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: { currency_code: "USD", value: totalUSD }, // NOT NGN
      }],
    }),
  })
  const order = await response.json()
  return NextResponse.json({ orderId: order.id })
}
```

### Pattern 4: Payment Method Toggles (server-only config)

```typescript
// src/lib/payments/config.ts
import "server-only"

type PaymentMethod = "stripe" | "paypal" | "bank_transfer"

export function isPaymentMethodEnabled(method: PaymentMethod): boolean {
  switch (method) {
    case "stripe":
      return process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY
    case "paypal":
      return process.env.ENABLE_PAYPAL === "true"
        && !!process.env.PAYPAL_CLIENT_ID
        && !!process.env.PAYPAL_CLIENT_SECRET
    case "bank_transfer":
      return process.env.ENABLE_BANK_TRANSFER === "true"
        && !!process.env.BANK_ACCOUNT_NUMBER
        && !!process.env.BANK_ACCOUNT_NAME
        && !!process.env.BANK_NAME
  }
}
```

[CITED: CLAUDE.md + PITFALLS.md Pitfall 5 — payment feature flags enforced server-side, no NEXT_PUBLIC_ prefix]

### Pattern 5: Order Reference + Guest Token Generation

```typescript
// src/lib/orders/reference.ts
import "server-only"
import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // omit O/0 I/1 for readability

export function generateOrderRef(): string {
  // MS-XXXXXX — 6 random chars from charset = 32^6 = 1.07B combinations
  // Collision probability negligible at small order volumes; retry on conflict
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => CHARS[b % CHARS.length])
    .join("")
  return `MS-${suffix}`
}

// Called with retry loop in checkout action: generate → check DB → retry on conflict
export async function generateUniqueOrderRef(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const ref = generateOrderRef()
    const existing = await db.query.orders.findFirst({
      where: eq(orders.reference, ref),
      columns: { id: true },
    })
    if (!existing) return ref
  }
  throw new Error("Failed to generate unique order reference after 10 attempts")
}

export function generateGuestToken(): string {
  // 32 random bytes → 64 hex chars = 256 bits of entropy
  // Unguessable; used as the guest order access URL token
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")
}
```

[ASSUMED] 32 bytes (64 hex) is sufficient for guest token security; aligns with common practice. No external verification done.

### Pattern 6: Flat Shipping Constant

```typescript
// src/lib/orders/shipping.ts
import "server-only"

// Flat-rate shipping in kobo (CHKT-03). Configured via env for easy adjustment.
// Default: 2000 NGN = 200000 kobo
export const FLAT_SHIPPING_KOBO = parseInt(
  process.env.FLAT_SHIPPING_KOBO ?? "200000",
  10
)
```

### Pattern 7: Confirmation Page Reconciliation (D-07)

The confirmation page at `/order/[token]` reconciles the order status against the webhook landing window:

**Server-render-on-load approach (recommended for simplicity):**
- Server Component reads order by token at load time
- If `status === "pending_payment"`: render a minimal client island that polls `GET /api/order/status/:token` every 2 seconds until status changes, then updates UI
- If `status === "payment_confirmed"`: render success state immediately
- Client polling is the cleaner pattern over a full page re-render loop and avoids flash

**Why not rely solely on Stripe's return_url redirect:**
The `return_url` fires on client-side confirmPayment completion, which can precede the webhook. Using `redirect: "if_required"` avoids mandatory redirect for cards that don't need 3DS, but D-07 explicitly requires reconciliation.

[CITED: docs.stripe.com/payments/payment-intents/verifying-status]

### Pattern 8: React Email — Order Confirmation Template Structure

Model on the existing `VerificationEmail.tsx` pattern:

```typescript
// src/emails/OrderConfirmationEmail.tsx
import { Html, Body, Container, Heading, Text, Button, Hr, Preview } from "@react-email/components"

interface OrderConfirmationEmailProps {
  orderRef: string
  orderToken: string        // for the guest access link
  customerEmail: string
  items: Array<{ productName: string; variantLabel: string; quantity: number; lineTotalKobo: number }>
  subtotalKobo: number
  shippingKobo: number
  totalKobo: number
  shippingAddress: ShippingAddressSnapshot
}

export function OrderConfirmationEmail({ orderRef, orderToken, ... }: OrderConfirmationEmailProps) {
  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/order/${orderToken}`
  // Use inline styles (same pattern as VerificationEmail.tsx)
  // Use formatNGN() for all money amounts
  ...
}
```

[CITED: src/emails/VerificationEmail.tsx — established pattern]

### Anti-Patterns to Avoid

- **Trusting client-submitted totals:** `createPaymentIntent({ amount: req.body.total })` — always recompute from `getCart()` server-side.
- **Using `request.json()` before `constructEvent`:** Consumes the body; Stripe signature fails. Always `request.text()` first.
- **Marking order paid on client redirect alone:** The `return_url` fires before the webhook. Only the webhook (D-06) may flip to `payment_confirmed`.
- **Using `middleware.ts` instead of `proxy.ts`:** Not applicable here (checkout is public), but ensure webhook route is excluded from proxy auth check.
- **Storing NGN bank details in `NEXT_PUBLIC_` env vars:** Server-only; D-10 / CLAUDE.md.
- **Skipping the idempotency check on webhook:** Stripe retries on non-2xx responses. Always `INSERT ... ON CONFLICT DO NOTHING` first.
- **Using neon-http `db` for `db.transaction()`:** The HTTP driver does not support interactive transactions. Use Drizzle batch API or switch to neon-serverless for the webhook handler.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card tokenization | Custom card input + encryption | Stripe Payment Element | PCI scope; Stripe handles 3DS, card validation |
| Webhook signature verification | Custom HMAC comparison | `stripe.webhooks.constructEvent()` | Timing-safe comparison; handles edge cases |
| PayPal order lifecycle | Direct REST calls without verification | `@paypal/react-paypal-js` + server-side capture Route Handler | SDK handles OAuth, retry, webhook format |
| Order reference collisions | Custom unique string with no retry | `generateUniqueOrderRef()` with DB check + retry loop | Guaranteed uniqueness at DB level |
| Guest token entropy | `Math.random()` | `crypto.getRandomValues(new Uint8Array(32))` | Cryptographically random; Math.random is predictable |
| Email rendering | String template HTML | React Email `@react-email/components` | Already in the project; HTML email is notoriously fiddly |
| Currency formatting | Custom NGN formatter | `formatNGN()` already in `src/lib/catalog/format.ts` | Already exists |

**Key insight:** The Stripe webhook handler looks simple but has multiple layers of subtle correctness requirements (raw body, timing-safe signature, idempotency, atomic DB write, refund-on-oversell). Every layer where you shortcut creates a financial correctness bug.

---

## Order Schema Design (Claude's Discretion — Recommended Design)

### New Tables This Phase

```sql
-- orders: one row per checkout attempt
CREATE TABLE "order" (
  id               TEXT PRIMARY KEY,                    -- crypto.randomUUID()
  reference        TEXT NOT NULL UNIQUE,                -- MS-XXXXXX (shown to customer)
  guest_token      TEXT NOT NULL UNIQUE,                -- 64-char hex (guest access URL)
  status           order_status NOT NULL DEFAULT 'pending_payment',
  user_id          TEXT REFERENCES "user"(id),          -- NULL for guests
  customer_email   TEXT NOT NULL,                       -- from form; prefilled for authed
  subtotal_kobo    INTEGER NOT NULL,
  shipping_kobo    INTEGER NOT NULL,
  total_kobo       INTEGER NOT NULL,                    -- subtotal + shipping, server-computed
  -- Shipping address snapshot (denormalized — never join to a live address table)
  shipping_name    TEXT NOT NULL,
  shipping_phone   TEXT NOT NULL,
  shipping_street  TEXT NOT NULL,
  shipping_city    TEXT NOT NULL,
  shipping_state   TEXT NOT NULL,                       -- one of 36 states + FCT
  shipping_landmark TEXT,
  -- Payment provider linkage (nullable — only set when provider is used)
  stripe_payment_intent_id TEXT,
  paypal_order_id          TEXT,
  bank_transfer_ref        TEXT,                        -- equals reference for bank transfer orders
  -- Timestamps
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  paid_at          TIMESTAMP,                           -- set when payment_confirmed
  INDEX(user_id),
  INDEX(stripe_payment_intent_id),
  INDEX(guest_token)
);

-- order_items: one row per line item, price snapshot at purchase time
CREATE TABLE order_item (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id      TEXT NOT NULL REFERENCES variant(id), -- preserved for Phase 6 history
  quantity        INTEGER NOT NULL,
  price_kobo      INTEGER NOT NULL,                     -- snapshot: variants.priceKobo AT purchase time
  product_name    TEXT NOT NULL,                        -- snapshot: product.name AT purchase time
  variant_label   TEXT NOT NULL,                        -- snapshot: "Black / 128GB" AT purchase time
  line_total_kobo INTEGER NOT NULL,                     -- price_kobo * quantity (server-computed)
  INDEX(order_id)
);
```

**Design decisions:**
- **Address as columns** (not JSON): Drizzle type-safety; individual columns for future admin filter by state.
- **Price snapshot required** (CONTEXT.md + Pitfall 15): `price_kobo` on `order_item` is the financial record; Phase 6 SC2 explicitly requires "final total as captured at purchase time."
- **`variant_id` FK preserved** even though it's nullable in practice if the variant is deleted — Phase 6 links order history to variants. Keep the FK but consider `ON DELETE SET NULL` for future-proofing.
- **`guest_token` on `orders` table** (not a separate table): simplest approach; unique constraint guarantees non-collision; index for O(1) lookup on confirmation page.
- **No separate addresses table**: snapshot approach avoids join complexity and is the standard ecommerce pattern for immutable order records.

### Relations to Add in schema.ts

```typescript
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user:  one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order:   one(orders,   { fields: [orderItems.orderId],   references: [orders.id] }),
  variant: one(variants, { fields: [orderItems.variantId], references: [variants.id] }),
}))
```

---

## Common Pitfalls

### Pitfall 1: Raw Body Consumed Before Stripe Signature Verification
**What goes wrong:** Calling `req.json()` or any middleware parsing before `stripe.webhooks.constructEvent()` causes `WebhookSignatureVerificationError` because the body is re-serialized (whitespace/key ordering may differ).
**How to avoid:** Always `const body = await req.text()` as the first line of the webhook route handler. Never use edge runtime for Stripe webhooks.
**Warning signs:** `StripeSignatureVerificationError` in production logs even with a correct `STRIPE_WEBHOOK_SECRET`.

### Pitfall 2: Webhook Idempotency Race (Two Deliveries Simultaneously)
**What goes wrong:** Two simultaneous Stripe retries both pass the `processed_webhook_events` check before either writes, creating duplicate order updates and stock decrements.
**How to avoid:** Use `INSERT ... ON CONFLICT DO NOTHING` and check `rowCount === 0` to short-circuit. The DB unique constraint is the true guard, not an application-level "if exists" check. With the Drizzle batch API the insert is the first statement in the batch — if it conflicts, the batch is aborted atomically.
**Warning signs:** Duplicate order status updates in logs.

### Pitfall 3: Last-Unit Race (D-09 edge case)
**What goes wrong:** Two customers pay for the last unit. The first webhook runs, decrements stock to 0. The second webhook runs, `UPDATE variant SET stock = stock - 1 WHERE stock >= 1` returns 0 rows. If this case is not handled, the order shows `payment_confirmed` but the item cannot be fulfilled.
**How to avoid:** Check `rowCount` of each stock decrement in the webhook batch. If any decrement returns 0 rows AND the order was already flipped to `payment_confirmed`:
  1. Issue `stripe.refunds.create({ payment_intent: pi.id })` (or PayPal equivalent)
  2. `UPDATE orders SET status = "payment_failed"` with a `refund_reason = "oversold"`
  3. Send customer notification email
**Warning signs:** No rowCount check after atomic stock decrement in webhook handler.

### Pitfall 4: Neon HTTP Driver Transactionality
**What goes wrong:** Developer uses `db.transaction()` with the existing `drizzle-orm/neon-http` client — this may silently fall back to non-transactional behavior or throw at runtime.
**How to avoid:** Use Drizzle batch API for the webhook handler (documented as atomic for Neon) or create a separate WebSocket-based DB client for transaction-sensitive operations.
**Warning signs:** `TypeError: db.transaction is not a function` or partial writes in tests.

### Pitfall 5: PayPal + NGN Currency Mismatch
**What goes wrong:** `createOrder` sent with `currency_code: "NGN"` — PayPal API returns error: "CURRENCY_NOT_SUPPORTED". The PayPal button renders but every payment fails.
**How to avoid:** See Open Questions #1 — resolve the PayPal/NGN architecture decision before implementing PayPal route handlers.
**Warning signs:** PayPal API returning 422 with `CURRENCY_NOT_SUPPORTED` error code.

### Pitfall 6: Stripe Client Secret Exposed in RSC Payload
**What goes wrong:** `clientSecret` is returned from a Server Action and passed to a Client Component. It's included in the RSC payload which is accessible in browser DevTools. This is acceptable for Stripe (the client secret is designed to be used in the browser for a single use), but the Server Action must NOT return the `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`.
**How to avoid:** Only return `clientSecret` (not the secret key). The Stripe `clientSecret` expires after the PaymentIntent is used; this is Stripe's intended flow.

### Pitfall 7: Double-Submission Creates Two Orders
**What goes wrong:** "Place Order" button clicked twice before the Server Action responds. Two `createStripePaymentIntent` calls create two pending orders and two PaymentIntents.
**How to avoid:** Disable the submit button on first click using `useState` in the checkout form client component. Additionally, the Server Action can check for a recent `pending_payment` order for the same email+cart combination and return the existing PaymentIntent.

### Pitfall 8: Bank Transfer Order Created with `payment_confirmed` Status
**What goes wrong:** Bank transfer is mistakenly created as `payment_confirmed` instead of `awaiting_bank_transfer`. Admin confirms payment (Phase 5) but the order is already marked paid, creating a double-confirmation.
**How to avoid:** Bank transfer Server Action must hardcode `status: "awaiting_bank_transfer"`. Add a DB CHECK constraint or application-level assertion. Stock is NOT decremented at creation time (D-09).

---

## Architectural Decision Required Before Planning

### Open Question #1: PayPal + NGN Currency

**Status:** BLOCKER — must resolve before PAY-02 is implemented.

**Finding:** [VERIFIED: developer.paypal.com/api/rest/reference/currency-codes/] PayPal's REST API supported currencies list (AUD, BRL, CAD, CNY, CZK, DKK, EUR, HKD, HUF, ILS, JPY, MYR, MXN, TWD, NZD, NOK, PHP, PLN, GBP, SGD, SEK, CHF, THB, USD) does not include NGN. Sending `currency_code: "NGN"` to the PayPal Orders API will return `CURRENCY_NOT_SUPPORTED`.

**Options:**

**Option A — Charge PayPal in USD with live exchange rate conversion:**
- At checkout, fetch live NGN/USD rate (e.g., from ExchangeRates API or a hardcoded buffer rate)
- Show the customer the NGN equivalent ("Pay $12.50 USD ≈ ₦20,000")
- Create PayPal order in USD; record the exchange rate on the order
- Risk: rate fluctuation between display and charge; regulatory/compliance considerations
- Complexity: exchange rate API dependency; FX buffer logic; customer communication

**Option B — Disable PayPal for launch; ship only Stripe + bank transfer:**
- PAY-02 is a v1 requirement but the project ships Stripe (working) + bank transfer (working)
- PayPal can be added in a v1.1 when/if PayPal adds NGN support or a workaround is confirmed
- Simplest path; no currency conversion complexity; no regulatory risk
- Toggle `ENABLE_PAYPAL=false` in env; server-side enforcement already designed (D-13)

**Recommendation (Claude's default):** Option B (disable PayPal at launch). The store serves the Nigerian market, NGN is the stated currency (REQUIREMENTS.md), and charging customers in USD without explicitly displaying the conversion and getting customer consent creates a trust/compliance risk. Stripe + bank transfer covers the critical payment flows.

**Action required:** User must confirm Option A or Option B before the planner writes PayPal tasks. If Option A: the plan needs exchange rate API selection, FX buffer %, and customer UX for the USD display.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | Next.js 16, argon2 | ✓ | 22.x (.nvmrc) | — |
| Neon Postgres | Order schema | ✓ | Running | — |
| Stripe account | PAY-01 | Unknown (env not set) | — | Set STRIPE_SECRET_KEY in .env.local |
| PayPal account | PAY-02 | Unknown (env not set) | — | Disable via ENABLE_PAYPAL=false (see Open Q #1) |
| Resend API key | ORD-01, ORD-02 | Partial (RESEND_API_KEY not confirmed) | — | Set RESEND_API_KEY in .env.local |
| Stripe CLI | Local webhook testing | Unknown | — | Install: `brew install stripe/stripe-cli/stripe` |
| TEST_DATABASE_URL | Integration tests | Unknown (not in .env.local.example) | — | Create separate Neon branch; add to .env.local |

**New env vars to add to `.env.local.example` this phase:**
```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ENABLE_STRIPE=true

# PayPal (see Open Q #1 — may disable)
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox             # "sandbox" | "live"
ENABLE_PAYPAL=false             # default false until NGN blocker resolved

# Bank transfer
BANK_NAME=
BANK_ACCOUNT_NUMBER=
BANK_ACCOUNT_NAME=
ENABLE_BANK_TRANSFER=true

# Flat-rate shipping
FLAT_SHIPPING_KOBO=200000       # 2000 NGN default — adjust as needed

# Stripe/PayPal publishable key for client (safe to expose)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Note: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is intentionally `NEXT_PUBLIC_` — the publishable key is designed to be browser-visible (Stripe's PCI model requires it). All other payment credentials stay server-only.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `TEST_DATABASE_URL=... npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHKT-01 | Guest can checkout (no account) | Integration | `npm test -- tests/checkout/guest.test.ts` | ❌ Wave 0 |
| CHKT-02 | Address validation (NG fields, state enum) | Unit | `npm test -- tests/checkout/address.test.ts` | ❌ Wave 0 |
| CHKT-03 | Flat shipping applied to total | Unit | `npm test -- tests/orders/pricing.test.ts` | ❌ Wave 0 |
| CHKT-04 | Order summary from getCart() (server-computed) | Unit | existing cart tests cover getCart(); checkout integration needed | ❌ Wave 0 |
| CHKT-05 | Confirmation page resolves status | Integration | `npm test -- tests/checkout/confirmation.test.ts` | ❌ Wave 0 |
| PAY-01 | Stripe PaymentIntent creates with server total | Unit (mock Stripe) | `npm test -- tests/payments/stripe.test.ts` | ❌ Wave 0 |
| PAY-02 | PayPal createOrder/capture (or disabled) | Unit (mock PayPal) | `npm test -- tests/payments/paypal.test.ts` | ❌ Wave 0 |
| PAY-03 | Bank transfer order created as `awaiting_bank_transfer` | Integration | `npm test -- tests/checkout/bank-transfer.test.ts` | ❌ Wave 0 |
| PAY-04 | Disabled method rejected at action/route handler | Unit | `npm test -- tests/payments/config.test.ts` | ❌ Wave 0 |
| ORD-01 | Order confirmation email sent after `payment_confirmed` | Unit (mock Resend) | `npm test -- tests/email/order-confirmation.test.ts` | ❌ Wave 0 |
| ORD-02 | Bank transfer email sent with NGN details + ref | Unit (mock Resend) | `npm test -- tests/email/bank-transfer.test.ts` | ❌ Wave 0 |
| SC5 | Webhook idempotency: duplicate event skipped | Integration | `npm test -- tests/webhooks/stripe.test.ts` | ❌ Wave 0 |
| SC5 | Atomic stock decrement: concurrent checkout no oversell | Integration (DB) | `npm test -- tests/webhooks/stock.test.ts` | ❌ Wave 0 |
| D-09 | Last-unit race triggers refund path | Unit (mock Stripe) | included in `tests/webhooks/stock.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- tests/[relevant-file].test.ts`
- **Per wave merge:** `npm test` (full suite, DB tests skipped unless TEST_DATABASE_URL set)
- **Phase gate:** `TEST_DATABASE_URL=... npm test` (full suite including DB integration tests)

### Wave 0 Gaps

- [ ] `tests/checkout/guest.test.ts` — covers CHKT-01/CHKT-03/CHKT-04
- [ ] `tests/checkout/address.test.ts` — covers CHKT-02 (Zod address schema, 36 states + FCT)
- [ ] `tests/checkout/confirmation.test.ts` — covers CHKT-05 (token lookup, status polling)
- [ ] `tests/checkout/bank-transfer.test.ts` — covers PAY-03 (awaiting_bank_transfer status)
- [ ] `tests/payments/stripe.test.ts` — covers PAY-01 (mock stripe.paymentIntents.create)
- [ ] `tests/payments/paypal.test.ts` — covers PAY-02 (or disabled path)
- [ ] `tests/payments/config.test.ts` — covers PAY-04 (toggle enforcement)
- [ ] `tests/webhooks/stripe.test.ts` — covers SC5 idempotency (mock constructEvent)
- [ ] `tests/webhooks/stock.test.ts` — covers SC5 atomic decrement + D-09 last-unit race
- [ ] `tests/email/order-confirmation.test.ts` — covers ORD-01
- [ ] `tests/email/bank-transfer.test.ts` — covers ORD-02
- [ ] `tests/helpers/db.ts` — add `truncateOrderTables()` for checkout/order integration tests

**Webhook handler testing strategy:**
- Mock `stripe.webhooks.constructEvent` using `vi.mock('stripe')` — no actual HTTP call
- Construct typed `Stripe.Event` fixture objects in test
- Run the handler function directly (not via HTTP) — same pattern as cart action tests
- For DB-backed webhook tests (idempotency, stock decrement): gate on `hasDatabase` + TEST_DATABASE_URL

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (guest checkout has no auth; authed path uses existing dal.ts) | — |
| V3 Session Management | Partial (guest token is not an auth session; IDOR protection via unguessable token) | 64-char hex token; no sequential IDs |
| V4 Access Control | Yes — payment method toggles enforced server-side | `isPaymentMethodEnabled()` in every action/route handler |
| V5 Input Validation | Yes — address form, amounts, variantIds | Zod schemas; never trust client totals; variantId UUID validation |
| V6 Cryptography | Yes — guest token generation, Stripe signature | `crypto.getRandomValues()` for token; Stripe SDK for webhook sig |
| V7 Error Handling | Yes — webhook errors must always return 200 | No stack traces in responses; Stripe retries on non-2xx |
| V8 Data Protection | Yes — bank account details server-only | Never NEXT_PUBLIC_; never returned to client |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-submitted price tampering | Tampering | Server always recomputes from `getCart()` before any PaymentIntent/order creation |
| IDOR on order access | Information Disclosure | Unguessable 64-char hex token (not sequential order ID) in order URLs |
| Webhook replay / duplicate charges | Spoofing / DoS | `processed_webhook_events` INSERT ON CONFLICT; idempotent batch |
| Overselling via race condition | Tampering | Atomic `UPDATE ... WHERE stock >= qty RETURNING stock` |
| Payment method bypass (UI only) | Elevation of Privilege | `isPaymentMethodEnabled()` re-checked in every Server Action / Route Handler |
| Bank details in browser | Information Disclosure | All bank env vars are server-only (no NEXT_PUBLIC_) |
| Double-submission | DoS / Duplicate Charges | Disable submit on click; Server Action idempotency check |
| Stripe webhook spoofing | Spoofing | `stripe.webhooks.constructEvent()` signature verification (timing-safe) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Stripe NGN uses kobo as subunit (two-decimal, 1 NGN = 100 kobo) — amount in PaymentIntent is in kobo, matching `priceKobo` schema convention | Standard Stack / Pattern 1 | If Stripe treats NGN as zero-decimal, amounts would be 100x wrong — all PaymentIntents would be for 1/100th the correct amount. Verify with Stripe support or test account before launch. |
| A2 | Drizzle batch API (neon-http) provides full transactional atomicity equivalent to a SQL transaction | Standard Stack / Pitfall 4 | If batch is not fully atomic, the webhook handler could partially write (order updated but stock not decremented, or vice versa). Verify against orm.drizzle.team/docs/batch-api in implementation. |
| A3 | 32-byte hex (64 chars) is sufficient entropy for the guest order token | Pattern 5 | If insufficient, tokens could be guessed. 256 bits is standard — unlikely to be wrong but not formally audited. |
| A4 | PayPal webhook signature verification uses PAYPAL-TRANSMISSION-ID / PAYPAL-AUTH-ALGO headers and a similar construct-event pattern | Pitfall section (PayPal webhook) | If PayPal's verification API changes, webhooks could be spoofed. Verify current PayPal webhook verification docs before implementing. |
| A5 | The existing `@react-email/components@1.0.12` version is compatible with the email template patterns used for VerificationEmail | Standard Stack | If there are breaking API changes from the version at install time vs now, email rendering could fail. Verify before adding new templates. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| Stripe Checkout (hosted redirect) | Stripe Payment Element (embedded) | Ongoing | No redirect; PCI scope stays SAQ-A |
| middleware.ts | proxy.ts (Next.js 16) | Next.js 16.0.0 | All route protection must use proxy.ts |
| PaymentIntent amount in dollars | Amount in smallest currency unit (kobo for NGN) | Always | 1 NGN = 100 kobo — amount in API must be kobo |
| Client-side cart prices | Server-recomputed from DB | Always | Foundational security requirement |
| Polling for webhook status | Server-push (SSE / WebSocket) | Not yet adopted | Polling is sufficient and simpler for v1; revisit if latency is a problem |

**Deprecated/outdated:**
- `middleware.ts`: replaced by `proxy.ts` in Next.js 16. Any tutorial using `middleware.ts` must be adapted.
- `stripe.charges.create()`: replaced by PaymentIntents API. Do not use the Charges API for new integrations.
- PayPal `v1/payments/payment`: replaced by `v2/checkout/orders`. Use v2 Orders API.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: developer.paypal.com/api/rest/reference/currency-codes/] — PayPal supported currencies, NGN not listed
- [VERIFIED: docs.stripe.com/payments/countries/nigeria] — Stripe supports NGN; US accounts only; USD settlement
- [VERIFIED: docs.stripe.com/webhooks] — `request.text()` for raw body; `constructEvent` signature verification
- [VERIFIED: orm.drizzle.team/docs/connect-neon] — neon-http does not support interactive `db.transaction()`; WebSocket driver needed
- [VERIFIED: orm.drizzle.team/docs/batch-api] — Drizzle batch API is atomic for Neon (all-or-nothing)
- [VERIFIED: npm registry 2026-06-25] — stripe@22.3.0, @stripe/stripe-js@9.8.0, @stripe/react-stripe-js@6.6.0, @paypal/react-paypal-js@10.1.0
- [CITED: src/lib/db/schema.ts] — `orderStatusEnum`, `processedWebhookEvents`, `variants.stock` already in schema
- [CITED: src/lib/cart/queries.ts + logic.ts] — `getCart()` / `hydrateCart()` as authoritative server-side total source
- [CITED: src/lib/db/client.ts] — current neon-http driver; needs attention for webhook transactions
- [CITED: src/lib/email/send-verification.ts + src/emails/VerificationEmail.tsx] — established Resend + React Email pattern

### Secondary (MEDIUM confidence)
- [CITED: docs.stripe.com/payments/payment-intents/verifying-status] — confirmation page reconciliation approach
- [WebSearch verified] — Stripe Payment Element + PaymentIntent + Next.js App Router Server Action pattern; multiple 2025/2026 sources agree on `request.text()` for raw body
- [WebSearch verified] — PayPal NGN CURRENCY_NOT_SUPPORTED confirmed in PayPal Community forums

### Tertiary (LOW confidence)
- [ASSUMED] — Stripe NGN uses kobo as two-decimal subunit (standard for non-zero-decimal currencies); not explicitly stated in docs for NGN specifically
- [ASSUMED] — PayPal webhook verification uses header-based HMAC pattern similar to Stripe; verify in PayPal developer docs before implementing

---

## Metadata

**Confidence breakdown:**
- Standard stack (Stripe/PayPal versions): HIGH — npm registry verified 2026-06-25
- PayPal NGN blocker: HIGH — PayPal official currency list verified
- Stripe NGN support + kobo subunit: MEDIUM — NGN support verified; kobo-as-subunit is ASSUMED for the amount field
- Architecture/patterns: HIGH — established patterns verified against Stripe docs and existing codebase
- Drizzle batch atomicity: MEDIUM — documented as atomic; verify in implementation
- Open Questions resolution: BLOCKED — PayPal/NGN decision needed from user

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (30 days) — payment provider currency support policies can change; re-verify PayPal NGN if planning is delayed
