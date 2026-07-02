# Phase 7: Nigerian Payment Gateways — Research

**Researched:** 2026-07-02
**Domain:** NGN payment gateway integration (Paystack + Flutterwave) in Next.js 16 App Router
**Confidence:** MEDIUM-HIGH (API mechanics verified via docs/web; some SDK edge cases ASSUMED)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Paystack + Flutterwave this phase only. PAY-07..PAY-11 → fast-follow Phase 7.1.
- **D-02:** Build a gateway-adapter interface: `initPayment`, `verifyTransaction`, `webhook-handle`, `refund`. Paystack + Flutterwave are first implementations.
- **D-03:** Inline popup / on-site flow (customer stays on `/checkout`). Paystack Inline JS + Flutterwave inline JS modals.
- **D-04:** Confirmation = server-side verify-on-callback + webhook, BOTH funneling through ONE shared idempotent confirmation path (`processed_webhook_events` ON CONFLICT DO NOTHING → atomic order flip + stock decrement → email). Webhook remains ultimate backstop.
- **D-05:** Flat radio list (Card/Paystack/Flutterwave/Bank Transfer), driven by `enabledPaymentMethods()`. No grouping hierarchy.
- **D-06:** Each gateway independently server-toggleable: `ENABLE_PAYSTACK=true && !!PAYSTACK_SECRET_KEY` (mirrors existing Stripe pattern). Enforcement as first statement in every action/route.
- **D-07:** Go-live default: Paystack + Flutterwave + bank transfer ON. Approved live merchant accounts + verified webhooks required before production.
- **D-08:** Test keys in dev/preview, live keys in production. No `NEXT_PUBLIC_` on secrets. Publishable/public keys are the only client-exposed values.

### Claude's Discretion

- Exact adapter interface shape/signatures, file layout (`src/lib/payments/gateways/*`?)
- Whether webhook routes are per-gateway or one dispatched route
- Exact `confirmOrderPaid()` extraction boundary from the Stripe webhook body
- SDK vs raw REST per gateway
- Idempotency event-id sourcing strategy
- Schema generalization: `gatewayProvider` + `gatewayReference` columns vs per-gateway columns

### Deferred Ideas (OUT OF SCOPE)

- Opay, Palmpay, Interswitch, GTPay, Remita direct integrations (PAY-07..PAY-11) → Phase 7.1
- Passing gateway transaction fees on to customer → v2
- Per-gateway confirmation email variants → existing email reused
- PayPal (PAY-02) → deferred (no NGN support)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAY-05 | User can pay via Paystack (NGN) | Paystack Inline JS v2 popup flow + server-side initialize + verify + webhook documented below |
| PAY-06 | User can pay via Flutterwave (NGN) | Flutterwave inline checkout v3 + verify + webhook documented below |
| PAY-12 | Each NG gateway independently toggleable via server-only config, rejected at action/route level when disabled (extends PAY-04) | Extends existing `isPaymentMethodEnabled` pattern; new cases added to config.ts |
</phase_requirements>

---

## Summary

Phase 7 adds Paystack and Flutterwave as first-class NGN payment methods behind a reusable gateway-adapter interface. Both gateways use client-side inline popup SDKs (customer stays on `/checkout`), server-side transaction initialization, server-side verify-on-popup-callback, and webhooks as the ultimate authority — all funneled into one shared idempotent confirmation path extracted from the existing Stripe webhook body.

The most critical technical difference between the two gateways is amount units: **Paystack uses kobo (integer, same as Stripe)** while **Flutterwave uses whole naira (major units)**. Every place the adapter converts `totalKobo` must divide by 100 for Flutterwave and pass the integer directly for Paystack. Getting this wrong is a 100× pricing bug — the single highest-risk implementation detail in the phase.

The second critical complexity is the verify-on-callback idempotency race. Both the popup success callback (verify-on-callback Server Action) and the webhook must use the same idempotency key so exactly one of them wins via `processedWebhookEvents ON CONFLICT DO NOTHING`. A deterministic composite event ID — `"paystack:{data.reference}"` for the callback and `"paystack:{data.reference}"` for the webhook (both using the same reference) — provides natural collision and correct deduplication. For Flutterwave the same composite works with `tx_ref`.

Schema requires two new columns on `orders`: `gatewayProvider` (text nullable) and `gatewayReference` (text nullable, indexed), generalizing the existing `stripePaymentIntentId` column. The existing column stays for Stripe orders.

**Primary recommendation:** Use raw REST calls to both gateway APIs (no server-side SDK wrappers needed at this scale); load the inline popup SDKs as client-only npm imports in `"use client"` components with dynamic import and `{ ssr: false }`. Keep webhook routes per-gateway (one file per gateway, cleaner separation, no dispatch complexity).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gateway popup init (access_code / tx_ref) | API/Backend (Server Action) | — | Must call gateway API with secret key; client never sees secret |
| Inline popup render + payment collection | Browser/Client | — | Popup scripts are client-only; PCI scope on gateway's iframe |
| Popup success callback → verify | API/Backend (Server Action) | — | Never trust client-reported status; re-fetch from gateway server-side |
| Webhook signature verify + confirmation | API/Backend (Route Handler) | — | Secret key required; raw body needed for HMAC |
| Toggle enforcement | API/Backend | — | Must be server-side; client UI follows from server state |
| Amount unit conversion (kobo→naira) | API/Backend | — | Conversion must be correct before any gateway call |
| `confirmOrderPaid()` shared logic | API/Backend (shared lib) | — | Called by webhook route AND verify-on-callback action |
| UI radio list (PaymentMethodSelector) | Browser/Client | — | Driven by `enabledPaymentMethods()` from server |
| Status polling fallback | Browser/Client → API | — | Existing `/api/order/status/[token]` endpoint reused unchanged |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@paystack/inline-js` | 2.23.1 | Client-side Paystack popup | Official Paystack npm package for inline popup; `resumeTransaction(accessCode)` pattern |
| `flutterwave-node-v3` | 1.4.1 | Server-side Flutterwave verify + refund | Official Node.js SDK; avoids raw fetch boilerplate for server calls |
| `flutterwave-react-v3` | 1.3.3 | Client-side Flutterwave popup | Official React package; `useFlutterwave` hook; peer-compatible with React 19 |

**Version verification:** [VERIFIED: npm registry 2026-07-02]
- `npm view @paystack/inline-js version` → `2.23.1`
- `npm view flutterwave-node-v3 version` → `1.4.1`
- `npm view flutterwave-react-v3 version` → `1.3.3`

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `crypto` (built-in) | — | Paystack HMAC SHA-512 signature verify | Always — no extra install; same module used for existing Stripe HMAC |
| `next/script` | (Next.js 16) | Alternative: load Flutterwave from CDN | Only if avoiding `flutterwave-react-v3` npm; CDN URL: `https://checkout.flutterwave.com/v3.js` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `flutterwave-react-v3` | Raw fetch to FLW API from client | React package abstracts popup lifecycle; raw fetch doesn't support inline modal |
| `flutterwave-node-v3` | Raw `fetch` to `api.flutterwave.com` | SDK is thin wrapper; raw fetch is fine for verify/refund but SDK provides typed helpers |
| `@paystack/inline-js` | CDN `<script>` via `next/script` | npm package is tree-shakeable and avoids global-window dependency; prefer npm |

**Installation:**
```bash
npm install @paystack/inline-js flutterwave-react-v3 flutterwave-node-v3
```

---

## Architecture Patterns

### System Architecture Diagram

```
Customer on /checkout
    │
    ▼
[PaymentMethodSelector] ← enabledPaymentMethods() (server, passed as prop)
    │ selects "paystack" or "flutterwave"
    ▼
[PaystackPanel / FlutterwavePanel]  (client components, "use client")
    │
    │ "Place order" click
    ▼
Server Action: initPaystackPayment(input) / initFlutterwavePayment(input)
    │  1. isPaymentMethodEnabled check (first statement)
    │  2. buildOrderContext() — server-side total recompute, Zod validate
    │  3. db.batch: insert order (pending_payment) + orderItems
    │  4. POST /transaction/initialize (Paystack) OR FlutterwaveCheckout params
    │  5. db.update: set gatewayProvider + gatewayReference on order
    │  Returns: { accessCode, reference, publicKey, guestToken }
    │           or { txRef, publicKey, guestToken, amount_naira, ... }
    ▼
Client: popup.resumeTransaction(accessCode) [Paystack]
     OR FlutterwaveCheckout({ tx_ref, amount, ... }) [Flutterwave]
    │
    │ (Popup handles card / USSD / bank channels inside modal)
    │
    ├─ SUCCESS CALLBACK ──────────────────────────────────────────────────────┐
    │                                                                         │
    │  Server Action: verifyPaystackPayment({ reference })                   │
    │              or verifyFlutterwavePayment({ transaction_id, tx_ref })   │
    │    1. isPaymentMethodEnabled check                                     │
    │    2. GET /transaction/verify/:reference (Paystack)                    │
    │       or GET /v3/transactions/:id/verify (Flutterwave)                 │
    │    3. Validate: status=success, amount matches, currency=NGN           │
    │    4. → confirmOrderPaid(order, { provider, eventId })                 │
    │       (shared path — idempotency via processedWebhookEvents)           │
    │    5. Returns { guestToken } → redirect to /order/{guestToken}         │
    │                                                                         │
    ├─ CANCEL / CLOSE ────────────────────────────────────────────────────────┤
    │    onCancel: show "Payment cancelled" inline; re-enable button         │
    │    Order stays pending_payment (left to expire)                        │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘

SIMULTANEOUSLY (ultimate backstop):

Gateway Webhook → POST /api/webhooks/paystack
                  POST /api/webhooks/flutterwave
    │  1. req.text() raw body first
    │  2. Signature verify (HMAC SHA512 [Paystack] or HMAC SHA256 base64 [FLW])
    │  3. Filter event type: charge.success (Paystack), charge.completed (FLW)
    │  4. → confirmOrderPaid(order, { provider, eventId })
    │     (same shared path as callback verify — idempotency guards double-run)
    │  5. Return 200 always (except signature failure → 400)

confirmOrderPaid(order, { provider, eventId }):
    1. db.insert(processedWebhookEvents, { id: eventId, provider })
       .onConflictDoNothing()
       → rowCount === 0? return (already processed)
    2. db.batch([
         update orders set status=payment_confirmed, paidAt=now(),
         ...decrementStatements (UPDATE variant SET stock = stock - qty
                                  WHERE id=? AND stock >= qty RETURNING id)
       ])
    3. Check anyOversold → refund + payment_failed (D-09 last-unit-race)
    4. sendOrderConfirmationEmail(...).catch(console.error)  [non-blocking]

Fallback (popup closed / network drop):
    PaymentProcessingView polling /api/order/status/[token] every 2s
    (existing endpoint, unchanged)
```

### Recommended Project Structure

```
src/
├── lib/payments/
│   ├── config.ts               # EXTEND: add "paystack" | "flutterwave" cases
│   ├── stripe.ts               # unchanged
│   ├── gateways/
│   │   ├── types.ts            # GatewayAdapter interface
│   │   ├── paystack.ts         # PaystackAdapter: initPayment, verifyTransaction, refund
│   │   └── flutterwave.ts      # FlutterwaveAdapter: initPayment, verifyTransaction, refund
│   └── shared/
│       └── confirm-order-paid.ts  # Extracted from stripe webhook — confirmOrderPaid()
├── lib/actions/
│   └── checkout.ts             # EXTEND: initPaystackPayment, initFlutterwavePayment,
│                               #         verifyPaystackPayment, verifyFlutterwavePayment
├── app/api/webhooks/
│   ├── stripe/route.ts         # unchanged (now calls confirmOrderPaid from shared)
│   ├── paystack/route.ts       # NEW: Paystack webhook handler
│   └── flutterwave/route.ts    # NEW: Flutterwave webhook handler
├── components/checkout/
│   ├── PaymentMethodSelector.tsx  # EXTEND: add paystack + flutterwave configs
│   ├── PaystackPaymentPanel.tsx   # NEW: "use client", resumeTransaction popup
│   └── FlutterwavePaymentPanel.tsx # NEW: "use client", FlutterwaveCheckout popup
└── lib/db/schema.ts            # EXTEND: gatewayProvider + gatewayReference columns
```

### Pattern 1: Paystack Server-Side Initialize + Client Popup

**What:** Server Action creates Paystack transaction → gets `access_code` + `reference` → client calls `resumeTransaction(accessCode)` to open popup without redirect.

**When to use:** Always for Paystack. The `resumeTransaction` flow is the recommended on-site approach: server initializes (secret key never on client), client completes via access code.

```typescript
// src/lib/payments/gateways/paystack.ts [CITED: paystack.com/docs/payments/accept-payments/]
// Server-side: initialize transaction
export async function paystackInitialize(params: {
  email: string
  amountKobo: number  // Paystack uses KOBO (same as Stripe)
  reference: string
  orderId: string
  metadata?: Record<string, string>
}): Promise<{ accessCode: string; reference: string }> {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,     // integer kobo — NOT naira
      reference: params.reference,   // our order reference for lookup
      currency: "NGN",
      metadata: { orderId: params.orderId, ...params.metadata },
    }),
  })
  if (!res.ok) throw new Error("Paystack initialize failed")
  const data = await res.json()
  return {
    accessCode: data.data.access_code,
    reference: data.data.reference,
  }
}
```

```typescript
// src/lib/payments/gateways/paystack.ts
// Server-side: verify transaction
export async function paystackVerify(reference: string): Promise<{
  status: "success" | "failed" | "abandoned"
  amountKobo: number
  currency: string
}> {
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    }
  )
  if (!res.ok) throw new Error("Paystack verify failed")
  const data = await res.json()
  return {
    status: data.data.status,    // "success" | "failed" | "abandoned"
    amountKobo: data.data.amount, // integer kobo [VERIFIED: paystack.com docs]
    currency: data.data.currency,  // "NGN"
  }
}
```

```typescript
// src/components/checkout/PaystackPaymentPanel.tsx ("use client")
// [CITED: npmjs.com/package/@paystack/inline-js, paystack.com/docs/developer-tools/inlinejs/]
import { useCallback, useState } from "react"

async function openPaystackPopup(accessCode: string, onSuccess: (ref: string) => void, onCancel: () => void) {
  // Dynamic import — client-only, never SSR (avoids window-is-undefined in App Router)
  const PaystackPop = (await import("@paystack/inline-js")).default
  const popup = new PaystackPop()
  popup.resumeTransaction(accessCode, {
    onSuccess: (response: { reference: string }) => {
      // response.reference is the transaction reference [CITED: paystack InlineJS docs]
      onSuccess(response.reference)
    },
    onCancel: () => {
      // User closed popup without paying
      onCancel()
    },
  })
}
```

### Pattern 2: Flutterwave Server-Side Params + Client Popup

**What:** Server Action computes all parameters → returns them to client → client calls `FlutterwaveCheckout({...})` to open popup. Flutterwave does NOT have a server-side "initialize" endpoint — the params are assembled server-side and passed to the client popup function.

**When to use:** Always for Flutterwave. NOTE: unlike Paystack, the amount passed to FlutterwaveCheckout is in **NAIRA (whole units)**, not kobo. Divide `totalKobo / 100` before passing.

```typescript
// src/lib/payments/gateways/flutterwave.ts
// Server-side: build checkout params
// Amount for FLW is NAIRA (major units) — critical conversion required
export function flutterwaveBuildParams(params: {
  email: string
  amountKobo: number  // our internal unit
  txRef: string
  orderId: string
  customerName: string
  phone?: string
}) {
  return {
    public_key: process.env.FLUTTERWAVE_PUBLIC_KEY!,  // client-safe
    tx_ref: params.txRef,
    amount: params.amountKobo / 100,  // CRITICAL: kobo → naira [CITED: developer.flutterwave.com]
    currency: "NGN",
    customer: {
      email: params.email,
      name: params.customerName,
      phone_number: params.phone,
    },
    meta: { orderId: params.orderId },
    customizations: {
      title: "Mandy Store",
      description: "Payment for your order",
    },
  }
}

// Server-side: verify transaction
export async function flutterwaveVerify(transactionId: number | string): Promise<{
  status: "successful" | "failed" | "pending"
  amountNaira: number   // FLW returns naira, NOT kobo [VERIFIED: developer.flutterwave.com]
  currency: string
  txRef: string
}> {
  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
    {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
    }
  )
  if (!res.ok) throw new Error("Flutterwave verify failed")
  const data = await res.json()
  return {
    status: data.data.status,       // "successful" | "failed" | "pending"
    amountNaira: data.data.amount,  // NAIRA — multiply by 100 to compare to totalKobo
    currency: data.data.currency,   // "NGN"
    txRef: data.data.tx_ref,
  }
}
```

```typescript
// src/components/checkout/FlutterwavePaymentPanel.tsx ("use client")
// [CITED: developer.flutterwave.com/v3.0/docs/inline, flutterwave-react-v3 npm]
import { useFlutterwave, closePaymentModal } from "flutterwave-react-v3"

// Or via window global (when loading via next/script CDN):
// declare const FlutterwaveCheckout: (config: object) => { close: () => void }
//
// useFlutterwave hook wraps window.FlutterwaveCheckout; requires the script loaded
// flutterwave-react-v3 loads https://checkout.flutterwave.com/v3.js automatically
```

### Pattern 3: Shared `confirmOrderPaid()` — Extracted from Stripe Webhook

**What:** Extract the idempotency-first + atomic batch + email pattern from `src/app/api/webhooks/stripe/route.ts` into a reusable helper. Both the new gateway webhook handlers AND the verify-on-callback Server Actions call this.

**When to use:** Anywhere an authoritative payment confirmation event arrives (webhook or callback verify).

```typescript
// src/lib/payments/shared/confirm-order-paid.ts
// [ASSUMED shape — extract from existing stripe/route.ts body]
import "server-only"
import { db } from "@/lib/db/client"
import { processedWebhookEvents, orders, variants } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation"

type OrderWithItems = {
  id: string
  status: string
  customerEmail: string
  reference: string
  guestToken: string
  subtotalKobo: number
  shippingKobo: number
  totalKobo: number
  items: Array<{ variantId: string; quantity: number; productName: string; variantLabel: string; lineTotalKobo: number }>
}

export type ConfirmResult =
  | { outcome: "confirmed" }
  | { outcome: "duplicate" }
  | { outcome: "oversold"; refundNeeded: true }

export async function confirmOrderPaid(
  order: OrderWithItems,
  { provider, eventId }: { provider: string; eventId: string }
): Promise<ConfirmResult> {
  // 1. Idempotency guard — same pattern as Stripe webhook
  const [idempotencyResult] = await db.batch([
    db
      .insert(processedWebhookEvents)
      .values({ id: eventId, provider })
      .onConflictDoNothing(),
  ])
  if (idempotencyResult.rowCount === 0) {
    return { outcome: "duplicate" }
  }

  // 2. Already confirmed guard
  if (order.status === "payment_confirmed") {
    return { outcome: "duplicate" }
  }

  // 3. Atomic: flip order + decrement stock
  type DecrementResult = { rows: { id: string }[] }
  const decrementStatements = order.items.map((item) =>
    db.execute<{ id: string }>(sql`
      UPDATE "variant"
      SET stock = stock - ${item.quantity}
      WHERE id = ${item.variantId}
        AND stock >= ${item.quantity}
      RETURNING id
    `)
  )

  const [, ...decrementResults] = (await db.batch([
    db
      .update(orders)
      .set({ status: "payment_confirmed", paidAt: new Date() })
      .where(eq(orders.id, order.id)),
    ...decrementStatements,
  ])) as [unknown, ...DecrementResult[]]

  // 4. Last-unit race
  const anyOversold = decrementResults.some((r) => r.rows.length === 0)
  if (anyOversold) {
    await db
      .update(orders)
      .set({ status: "payment_failed", refundReason: "oversold" })
      .where(eq(orders.id, order.id))
    return { outcome: "oversold", refundNeeded: true }
  }

  // 5. Confirmation email (non-blocking)
  sendOrderConfirmationEmail({
    customerEmail: order.customerEmail,
    reference: order.reference,
    guestToken: order.guestToken,
    items: order.items.map((i) => ({
      productName: i.productName,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      lineTotalKobo: i.lineTotalKobo,
    })),
    subtotalKobo: order.subtotalKobo,
    shippingKobo: order.shippingKobo,
    totalKobo: order.totalKobo,
  }).catch(console.error)

  return { outcome: "confirmed" }
}
```

### Pattern 4: Paystack Webhook Signature Verification

```typescript
// src/app/api/webhooks/paystack/route.ts
// [CITED: paystack.com/docs/payments/webhooks/]
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // CRITICAL: raw body FIRST — same pattern as Stripe webhook
  const body = await req.text()
  const signature = req.headers.get("x-paystack-signature") ?? ""

  // HMAC SHA-512 — Paystack signs with SECRET_KEY [VERIFIED: multiple sources]
  const expectedSig = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(body)       // raw string body — do NOT re-stringify parsed JSON
    .digest("hex")

  if (expectedSig !== signature) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  const event = JSON.parse(body)

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true })  // 200 for all other events
  }

  // event.data.reference = Paystack transaction reference
  // event.data.id = Paystack transaction ID (integer)
  // event.data.amount = amount in KOBO [VERIFIED: charge.success payload example]
  // event.data.status = "success"
  // Idempotency key: use "paystack:" + event.data.reference for both webhook and callback
  const reference = event.data.reference
  const eventId = `paystack:${reference}`

  // ... look up order by gatewayReference, call confirmOrderPaid(order, { provider: "paystack", eventId })
}
```

### Pattern 5: Flutterwave Webhook Signature Verification

```typescript
// src/app/api/webhooks/flutterwave/route.ts
// [CITED: developer.flutterwave.com/docs/webhooks]
import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text()

  // Flutterwave uses HMAC-SHA256 base64 — newer "flutterwave-signature" header [VERIFIED]
  // Fallback check "verif-hash" for legacy / transition period [MEDIUM confidence]
  const signature =
    req.headers.get("flutterwave-signature") ??
    req.headers.get("verif-hash") ?? ""

  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH!
  const expectedSig = crypto
    .createHmac("sha256", secretHash)
    .update(body)
    .digest("base64")

  if (expectedSig !== signature) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  const event = JSON.parse(body)

  // event.type = "charge.completed"
  // event.data.id = top-level transaction ID (use as idempotency key)
  // event.data.tx_ref = merchant's txRef
  // event.data.status = "successful" (NOT "success" — different from Paystack)
  // event.data.amount = NAIRA (major units) [VERIFIED: FLW docs examples]
  // event.data.currency = "NGN"

  if (event.type !== "charge.completed" || event.data?.status !== "successful") {
    return NextResponse.json({ received: true })
  }

  const txRef = event.data.tx_ref
  const eventId = `flutterwave:${txRef}` // same key as callback verify uses

  // ... look up order by gatewayReference = txRef, call confirmOrderPaid
}
```

### Pattern 6: Schema Extension

```typescript
// src/lib/db/schema.ts — add to orders table
// [ASSUMED schema strategy — generalizing existing stripePaymentIntentId pattern]

// In orders pgTable definition, add these columns alongside stripePaymentIntentId:
gatewayProvider:    text("gateway_provider"),   // "paystack" | "flutterwave" | null (Stripe uses stripePaymentIntentId)
gatewayReference:   text("gateway_reference"),  // Paystack reference or Flutterwave tx_ref

// Add index:
index("order_gateway_ref_idx").on(table.gatewayReference)

// In queries.ts, add:
export async function getOrderByGatewayReference(reference: string) {
  return db.query.orders.findFirst({
    where: eq(orders.gatewayReference, reference),
    with: { items: true },
  })
}
```

**Schema migration note:** `drizzle-kit push` has TTY prompt issues on this machine. Apply via direct SQL through `@neondatabase/serverless`. Run against both `DATABASE_URL` and `TEST_DATABASE_URL` separately.

```sql
-- Apply via @neondatabase/serverless neon() client:
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS gateway_provider text;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS gateway_reference text;
CREATE INDEX IF NOT EXISTS order_gateway_ref_idx ON "order" (gateway_reference);
```

### Pattern 7: Idempotency Event ID Strategy

The same confirm path serves two callers: the popup success callback (fast path) and the webhook (backstop). They MUST use the same `eventId` to collide in `processedWebhookEvents`.

| Gateway | Callback eventId | Webhook eventId | Collision? |
|---------|-----------------|-----------------|------------|
| Paystack | `"paystack:" + reference` | `"paystack:" + event.data.reference` | Yes — same reference [VERIFIED: reference persists across both] |
| Flutterwave | `"flutterwave:" + tx_ref` | `"flutterwave:" + event.data.tx_ref` | Yes — `tx_ref` is merchant-controlled and stable [VERIFIED] |

First caller to insert wins; second hits ON CONFLICT DO NOTHING and returns early. This is idempotent and race-safe.

### Anti-Patterns to Avoid

- **Flutterwave amount in kobo:** Passing `totalKobo` directly to Flutterwave will charge 100× the correct price (e.g., ₦1000 order becomes ₦100,000 charge). Always divide by 100 before `FlutterwaveCheckout({ amount: ... })`.
- **Re-stringifying parsed body for Paystack HMAC:** `crypto.createHmac("sha512", key).update(JSON.stringify(JSON.parse(rawBody)))` may differ from the original raw body string. Feed `req.text()` (the raw string) directly to `.update()`.
- **Trusting popup callback amount/status:** The popup `onSuccess` only provides `reference` (Paystack) or `transaction_id` (Flutterwave). The server Action must re-fetch from the gateway verify endpoint to get authoritative status and amount.
- **Exporting `runtime = "nodejs"` from new webhook routes:** Same constraint as existing Stripe webhook — breaks `cacheComponents: true`. Node.js is the default; no explicit export needed.
- **Delivering value on callback before server verify returns:** Client popup close is fast; if the `verifyPaystackPayment` Server Action throws, do NOT redirect to confirmation. Return `{ error }` and show inline error instead.
- **Using `data.id` as idempotency key for Flutterwave webhook alone:** `data.id` is the webhook transport ID (not stable across retries in the same way as `tx_ref`). Using `tx_ref` guarantees the callback and webhook collide correctly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Paystack HMAC SHA-512 | Custom crypto pipeline | Node.js `crypto.createHmac("sha512", ...)` | Built-in, timing-safe when using `===` comparison; already pattern in codebase |
| Flutterwave verify/refund REST | Raw fetch wrapper | `flutterwave-node-v3` library | Official SDK handles auth headers, error shapes, and type safety |
| Popup script loading in Next.js | Custom `<script>` injection | `@paystack/inline-js` npm + dynamic import; `flutterwave-react-v3` hook | Handles script lifecycle, avoids window-undefined SSR crashes |
| Duplicate webhook processing | Custom deduplication table | Existing `processedWebhookEvents` + `ON CONFLICT DO NOTHING` | Already proven in Stripe webhook; both gateways plug into same table |
| Amount conversion validation | Tolerance-based comparison | Exact integer comparison: `verifiedAmountKobo !== order.totalKobo` → reject | Avoid floating-point tolerance bugs; convert FLW naira → kobo (×100) before compare |

**Key insight:** Gateway webhooks are the place where most custom logic creep happens. Keep all gateway-specific code inside the adapter module (`src/lib/payments/gateways/`) and the webhook route. The `confirmOrderPaid()` shared helper should be gateway-agnostic — it receives normalized data and doesn't know which gateway triggered it.

---

## Common Pitfalls

### Pitfall 1: Flutterwave Kobo/Naira 100× Bug
**What goes wrong:** Developer passes `totalKobo` (e.g., 150000 kobo = ₦1,500) directly to Flutterwave `amount` field → customer is charged 150,000 Naira (₦150,000).
**Why it happens:** Stripe and Paystack use kobo (minor units). Flutterwave uses naira (major units). It is not obvious from the field name.
**How to avoid:** In `flutterwaveBuildParams()`, always compute `amount: amountKobo / 100`. Add a unit assertion in the adapter: `if (amount > 1_000_000) throw new Error("FLW amount > ₦1M — check unit conversion")`.
**Warning signs:** Orders show amounts 100× expected; no error thrown.
[VERIFIED: FLW docs examples use naira — "amount: 3400" for ₦3,400]

### Pitfall 2: Popup Closed Without Payment — Orphaned `pending_payment` Orders
**What goes wrong:** Customer opens Paystack popup and closes it without paying. The order was already inserted as `pending_payment` with `gatewayReference` set. No confirmation arrives.
**Why it happens:** Order is created before popup opens (required to pass `orderId` in metadata). Popup close does not trigger a webhook.
**How to avoid:** `onCancel` handler should show an inline "Payment cancelled — you can try again" message and leave the page in the original pre-payment state. The `pending_payment` orphan order is acceptable (same behavior as Stripe). For cleanup, a future cron/Phase 5+ job can mark stale `pending_payment` orders older than 24h as `cancelled`.
**Warning signs:** Growing count of `pending_payment` orders with gateway references but no webhooks.

### Pitfall 3: Verify-on-Callback Race with Webhook
**What goes wrong:** Callback arrives and verify Server Action succeeds → order confirmed. Milliseconds later, webhook arrives with the same reference → double-stocks-decrement.
**Why it happens:** Callback verify and webhook both try to run `confirmOrderPaid()`.
**How to avoid:** Idempotent eventId collision in `processedWebhookEvents`. The second caller hits ON CONFLICT DO NOTHING and returns `{ outcome: "duplicate" }` immediately. No double decrement is possible.
**Warning signs:** Stock decremented more than expected per order.

### Pitfall 4: Paystack Raw Body HMAC
**What goes wrong:** `crypto.createHmac("sha512", key).update(JSON.stringify(req.body))` produces a different signature than Paystack's.
**Why it happens:** `JSON.stringify(JSON.parse(rawBody))` may reorder keys or change whitespace, invalidating the HMAC.
**How to avoid:** `const body = await req.text()` first; feed `body` (raw string) directly to `.update(body)`. Identical pattern to the existing Stripe webhook.
**Warning signs:** `x-paystack-signature` verification fails for valid Paystack events.

### Pitfall 5: Flutterwave Header Ambiguity (verif-hash vs flutterwave-signature)
**What goes wrong:** Code checks only `verif-hash` but Flutterwave sends `flutterwave-signature` (newer API).
**Why it happens:** Flutterwave updated from a plaintext hash comparison (`verif-hash`) to HMAC SHA-256 (`flutterwave-signature`) in their newer API.
**How to avoid:** Check both headers with fallback: `req.headers.get("flutterwave-signature") ?? req.headers.get("verif-hash")`. Verify using HMAC SHA-256 against `FLUTTERWAVE_WEBHOOK_HASH`.
[MEDIUM confidence — documentation inconsistency found; checking both headers is safest]

### Pitfall 6: Dynamic Import SSR Crash for `@paystack/inline-js`
**What goes wrong:** `import PaystackPop from "@paystack/inline-js"` at module level in a component throws `window is not defined` during server rendering.
**Why it happens:** `PaystackPop` accesses `window` on import; Next.js SSR runs in Node.js context.
**How to avoid:** Use `await import("@paystack/inline-js")` inside the click handler or inside `useEffect`. Never at module level. Same concern applies to `flutterwave-react-v3` — the library auto-loads the CDN script, which must happen client-side.
**Warning signs:** Build succeeds but page crashes with `window is not defined` on first load.

### Pitfall 7: Flutterwave Status String Difference
**What goes wrong:** Code checks `status === "success"` (Paystack's string) on Flutterwave response → always rejects successful Flutterwave payments.
**Why it happens:** Paystack uses `"success"`. Flutterwave uses `"successful"`. Different strings, same concept.
**How to avoid:** Gateway adapter normalizes status: Paystack adapter maps `"success"` → `confirmed`; Flutterwave adapter maps `"successful"` → `confirmed`. Caller sees a unified type, not gateway strings.
[VERIFIED: multiple sources confirm Flutterwave uses "successful"]

### Pitfall 8: Amount Mismatch Validation on Callback Verify
**What goes wrong:** Callback verify compares Flutterwave's `amountNaira` directly to `order.totalKobo` → amounts appear wrong even on legitimate payments.
**Why it happens:** Wrong unit on one side of the comparison.
**How to avoid:** In the verify Action: `const verifiedKobo = Math.round(flutterwaveResult.amountNaira * 100)`. Then `verifiedKobo < order.totalKobo → reject`. Use `<` not `!==` (allow minor floating-point when converting back, though FLW amounts should be integers).

### Pitfall 9: HTTPS Required for Webhooks
**What goes wrong:** Paystack/Flutterwave dashboard webhook URL set to `http://localhost:3000` → no webhook events received locally.
**Why it happens:** Both gateways require HTTPS webhook endpoints.
**How to avoid:** Use ngrok or Cloudflare Tunnel for local webhook testing. Test keys from both gateways work with ngrok. Alternative: write unit tests that mock the HTTP layer and simulate full webhook payloads with correct HMAC.

---

## Code Examples

### Verified Patterns

#### Paystack Initialize Transaction
```typescript
// [CITED: paystack.com/docs/api/transaction/]
// POST https://api.paystack.co/transaction/initialize
// Authorization: Bearer PAYSTACK_SECRET_KEY
// Body: { email, amount (kobo), reference, currency: "NGN", metadata }
// Response: { data: { access_code, reference, authorization_url } }
```

#### Paystack Verify Transaction
```typescript
// [CITED: paystack.com/docs/payments/verify-payments/]
// GET https://api.paystack.co/transaction/verify/:reference
// Authorization: Bearer PAYSTACK_SECRET_KEY
// Response: { data: { status, amount (kobo), currency, reference, ... } }
// data.status === "success" means paid
```

#### Paystack Refund
```typescript
// [CITED: paystack.com/docs/api/refund/]
// POST https://api.paystack.co/refund
// Body: { transaction: reference_or_id, amount?: kobo_partial }
// Omit amount for full refund
```

#### Flutterwave Verify Transaction
```typescript
// [CITED: developer.flutterwave.com/v3.0/docs/transaction-verification]
// GET https://api.flutterwave.com/v3/transactions/:id/verify
// Authorization: Bearer FLUTTERWAVE_SECRET_KEY
// Response: { data: { status, amount (naira), currency, tx_ref, ... } }
// data.status === "successful" means paid (NOT "success")
```

#### Flutterwave Refund
```typescript
// [CITED: developer.flutterwave.com/v3.0/docs/refunds]
// POST https://api.flutterwave.com/v3/transactions/:id/refund
// Body: { id: transactionId, amount?: naira_amount }  
// Minimum refund: NGN 100 (₦100)
// Omit amount for full refund
```

#### Flutterwave Webhook Payload (charge.completed)
```json
{
  "type": "charge.completed",
  "id": "wbk_W5p6ktwU0jQ8RO4By860",
  "data": {
    "id": 593416278,
    "status": "successful",
    "tx_ref": "order-ref-abc123",
    "amount": 1500,
    "currency": "NGN",
    "customer": { "email": "...", "name": "..." }
  }
}
```
Use `event.data.tx_ref` as the idempotency key prefix (stable across retries). [CITED: developer.flutterwave.com/docs/webhooks, dev.to Flutterwave webhook article]

#### Paystack Webhook Payload (charge.success)
```json
{
  "event": "charge.success",
  "data": {
    "id": 5408587751,
    "status": "success",
    "reference": "72otvvm6el",
    "amount": 700000,
    "currency": "NGN",
    "customer": { "email": "..." }
  }
}
```
Use `event.data.reference` as the idempotency key prefix. No top-level event `id` field (unlike Stripe). [CITED: multiple webhook payload examples from dev.to and Medium articles]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Paystack InlineJS v1 (`callback`, `onClose`) | InlineJS v2 (`onSuccess`, `onCancel`, `resumeTransaction`) | ~2022 | Must use `@paystack/inline-js` npm; old CDN patterns outdated |
| Flutterwave `verif-hash` plaintext string compare | `flutterwave-signature` HMAC-SHA256 base64 | ~2023 | Check both headers during transition; use HMAC verify |
| Per-gateway separate idempotency tables | Single `processedWebhookEvents` table with `provider` column | Phase 4 design | Already built; just add new `provider` values |

**Deprecated/outdated:**
- Paystack InlineJS v1: the `callback(response)` handler and `onClose()` are v1 patterns. v2 uses `onSuccess` and `onCancel`. The npm package `@paystack/inline-js` is always v2.
- `flutterwave-react-v3` older peer deps listed React 15/16 — now supports React 19 (current) [VERIFIED: peerDependencies: `"react": "^15.0.0 || ^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"`].

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `confirmOrderPaid()` can be extracted from stripe/route.ts body with the interface shown — no hidden dependencies on Stripe-specific types | Pattern 3 | Refactor may require more surgery; low risk given clean structure |
| A2 | `@paystack/inline-js` v2 `resumeTransaction()` takes `(accessCode, { onSuccess, onCancel })` signature | Pattern 1 | Integration breaks; fallback: use CDN popup with `callback` / `onClose` |
| A3 | Flutterwave `flutterwave-signature` header value is base64-encoded HMAC-SHA256 (not hex) | Pattern 5 | Sig verify always fails; try both encodings if needed |
| A4 | Paystack webhook payload has no top-level event `id` field (only `data.id` and `data.reference`) | Pattern 4 / Pitfall examples | If there IS a top-level `id`, prefer it as idempotency key |
| A5 | `flutterwave-node-v3` v1.4.1 `Transaction.refund({ id, amount })` accepts `id` as the FLW transaction integer ID | Code Examples | Refund may require a different field; fall back to raw REST fetch |
| A6 | Both headers (`verif-hash` and `flutterwave-signature`) may be present or only one — checking both with fallback is safe | Pattern 5 | Could accept an invalid request if only one is set incorrectly; test with real FLW test events |

---

## Open Questions

1. **Flutterwave `flutterwave-signature` vs `verif-hash`**
   - What we know: Current docs say `flutterwave-signature` (HMAC SHA256 base64). Older community articles say `verif-hash` (plaintext compare). Multiple sources contradict.
   - What's unclear: Is `verif-hash` still sent by Flutterwave alongside `flutterwave-signature` in 2026, or deprecated?
   - Recommendation: Check both headers in the webhook route; verify against HMAC SHA256. If HMAC fails, fall back to plaintext compare. Test with actual FLW test webhook delivery to confirm which header arrives.

2. **Paystack top-level event `id`**
   - What we know: Multiple sources show payload structure without a top-level `id`. Stripe has `evt_xxx` top-level id; Paystack examples show only `event` and `data`.
   - What's unclear: Does Paystack's current API include a stable top-level event ID?
   - Recommendation: Use `"paystack:" + event.data.reference` as idempotency key. If a top-level ID exists in real payloads, prefer it and update.

3. **Schema column strategy: `gatewayProvider`/`gatewayReference` vs per-gateway columns**
   - What we know: Existing `stripePaymentIntentId` is Stripe-specific. `paypalOrderId` column is reserved. Adding two generic columns is simpler for Phase 7.1 extensibility.
   - Recommendation: Add `gatewayProvider` + `gatewayReference` (planner's call per CONTEXT.md). Keep `stripePaymentIntentId` for Stripe (existing Stripe webhook relies on it).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | npm install, build | ✓ | v22 (via .nvmrc) | — |
| `@paystack/inline-js` | PAY-05 client popup | ✗ (not installed) | — | Install: `npm install @paystack/inline-js` |
| `flutterwave-react-v3` | PAY-06 client popup | ✗ (not installed) | — | Install: `npm install flutterwave-react-v3` |
| `flutterwave-node-v3` | PAY-06 server verify/refund | ✗ (not installed) | — | Install: `npm install flutterwave-node-v3` |
| Paystack merchant account | PAY-05 go-live | Unknown | — | Test keys available at dashboard.paystack.com |
| Flutterwave merchant account | PAY-06 go-live | Unknown | — | Test keys available at dashboard.flutterwave.com |
| ngrok / Cloudflare Tunnel | Webhook local testing | Unknown | — | Unit test with mocked payloads (viable) |
| Separate TEST_DATABASE_URL | Integration tests | Unknown | — | Required for integration test coverage; create Neon branch |

**Missing dependencies with no fallback:**
- `@paystack/inline-js`, `flutterwave-react-v3`, `flutterwave-node-v3` must be installed before implementation begins. These are standard npm installs, not blockers.

**Missing dependencies with fallback:**
- ngrok: unit tests with synthetic payloads + correct HMAC cover webhook integration without ngrok. Ngrok needed only for end-to-end popup testing against real gateway.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing, no new config needed) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npm test` |
| Full suite command | `TEST_DATABASE_URL=<neon-test-branch> npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAY-12 | `isPaymentMethodEnabled("paystack")` returns false when `ENABLE_PAYSTACK` unset or secret missing | unit | `npm test -- tests/payments/config.test.ts` | ❌ Wave 0 — extend config.test.ts |
| PAY-12 | `isPaymentMethodEnabled("flutterwave")` returns false when `ENABLE_FLUTTERWAVE` unset or secret missing | unit | `npm test -- tests/payments/config.test.ts` | ❌ Wave 0 |
| PAY-12 | `initPaystackPayment` returns `{ error }` when toggle disabled | unit | `npm test -- tests/checkout/actions.test.ts` | ❌ Wave 0 — extend actions.test.ts |
| PAY-12 | `initFlutterwavePayment` returns `{ error }` when toggle disabled | unit | `npm test -- tests/checkout/actions.test.ts` | ❌ Wave 0 |
| PAY-05 | Paystack webhook: valid `charge.success` → order `payment_confirmed`, stock decremented, email sent | integration (DB-gated) | `TEST_DATABASE_URL=... npm test -- tests/checkout/paystack-webhook.test.ts` | ❌ Wave 0 |
| PAY-05 | Paystack webhook: duplicate event → no-op (idempotency) | integration (DB-gated) | same | ❌ Wave 0 |
| PAY-05 | Paystack webhook: invalid signature → 400 (always-runs) | unit | `npm test -- tests/checkout/paystack-webhook.test.ts` | ❌ Wave 0 |
| PAY-05 | Paystack verify-on-callback: valid reference → `payment_confirmed` (idempotency with webhook) | integration (DB-gated) | `npm test -- tests/checkout/paystack-webhook.test.ts` | ❌ Wave 0 |
| PAY-06 | Flutterwave webhook: valid `charge.completed` + status `successful` → `payment_confirmed`, decrement, email | integration (DB-gated) | `TEST_DATABASE_URL=... npm test -- tests/checkout/flutterwave-webhook.test.ts` | ❌ Wave 0 |
| PAY-06 | Flutterwave webhook: duplicate `tx_ref` → no-op (idempotency) | integration (DB-gated) | same | ❌ Wave 0 |
| PAY-06 | Flutterwave webhook: invalid signature → 400 (always-runs) | unit | same | ❌ Wave 0 |
| PAY-06 | Flutterwave amount: verify rejects when `amountNaira × 100 < order.totalKobo` | unit | `npm test -- tests/payments/gateways.test.ts` | ❌ Wave 0 |
| — | Last-unit race: Paystack → refund API called + `payment_failed` + `refundReason` | integration (DB-gated) | same | ❌ Wave 0 |
| — | Last-unit race: Flutterwave → refund API called + `payment_failed` | integration (DB-gated) | same | ❌ Wave 0 |
| — | `confirmOrderPaid()` idempotency: called twice with same eventId → one stock decrement | integration (DB-gated) | `npm test -- tests/payments/confirm-order-paid.test.ts` | ❌ Wave 0 |

### Critical Security Properties → Test Coverage

| Security Property | Test Strategy |
|-------------------|---------------|
| Never trust client price | `initPaystackPayment` with wrong client amount → server recomputes from `getCart()` (unit, mock getCart) |
| Signature verify required | Both webhook tests include bad-signature → 400 assertion (unit, always-runs) |
| Amount matches order before confirm | Verify actions: stub gateway verify to return wrong amount → expect `{ error }` returned (unit) |
| Atomic stock decrement, no read-then-write | Integration: seed stock=1, order qty=2 → oversold path; seed stock=5, qty=2 → stock=3 post-confirm |
| Toggle enforcement first-statement | Unit: stub `ENABLE_PAYSTACK=false` → action returns `{ error }` without calling gateway |
| No secret in client | Inspect returned action data: must not contain `PAYSTACK_SECRET_KEY` or `FLUTTERWAVE_SECRET_KEY` |
| Gateway ref → order lookup (not enumerable) | Order lookup by gatewayReference; wrong ref → `undefined` → 400 from webhook |

### Sampling Rate
- **Per task commit:** `npm test` (unit tests, no DB required)
- **Per wave merge:** `TEST_DATABASE_URL=<test-branch> npm test` (full suite including integration)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/payments/config.test.ts` — add Paystack + Flutterwave toggle cases
- [ ] `tests/checkout/paystack-webhook.test.ts` — signature fail, happy path, idempotency, race
- [ ] `tests/checkout/flutterwave-webhook.test.ts` — signature fail, happy path, idempotency, amount unit
- [ ] `tests/checkout/actions.test.ts` — extend with Paystack/Flutterwave init action toggle rejection tests
- [ ] `tests/payments/confirm-order-paid.test.ts` — shared helper: idempotency, oversold, email
- [ ] `tests/payments/gateways.test.ts` — unit: Flutterwave amount conversion, status string mapping

*(Existing test infrastructure reused; vitest + `vi.stubEnv` + DB helpers already established. No new framework config needed.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `isPaymentMethodEnabled` first-statement in every action/route; order lookup only by `gatewayReference` + `guestToken` |
| V5 Input Validation | yes | Zod `CheckoutSchema` (existing); amount validation on verify: server-fetched amount must equal order total |
| V6 Cryptography | yes | HMAC SHA-512 (Paystack); HMAC SHA-256 (Flutterwave); never compare raw user-supplied string to secret |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fake webhook from attacker | Spoofing | HMAC signature verification before processing; raw body must match |
| Client-reported payment amount | Tampering | Server Action always re-fetches from gateway verify endpoint; client reference only |
| Replay attack (duplicate webhook delivery) | Repudiation | `processedWebhookEvents ON CONFLICT DO NOTHING`; return 200 immediately on duplicate |
| Order enumeration via gatewayReference | Information Disclosure | `gatewayReference` is opaque merchant reference (UUID-based); webhook 400 on miss |
| Double charge (popup submitted twice) | Tampering | Gateway itself prevents double-charging same reference; idempotency guard handles webhook duplicates |
| Secret key exposure in client bundle | Information Disclosure | No `NEXT_PUBLIC_` on any secret; only `PAYSTACK_PUBLIC_KEY` and `FLUTTERWAVE_PUBLIC_KEY` exposed |
| Stock oversell under high concurrency | Elevation of Privilege | Atomic `UPDATE ... WHERE stock >= qty RETURNING id`; oversold path triggers refund |

---

## Sources

### Primary (HIGH confidence)
- `paystack.com/docs/payments/accept-payments/` — Initialize + popup + verify flow
- `paystack.com/docs/payments/webhooks/` — `x-paystack-signature`, HMAC SHA512, `charge.success`
- `paystack.com/docs/api/transaction/` — Initialize endpoint, verify endpoint
- `paystack.com/docs/payments/verify-payments/` — `data.status`, `data.amount` (kobo)
- `paystack.com/docs/api/refund/` — Refund endpoint, `amount` in kobo, full vs partial
- `developer.flutterwave.com/v3.0/docs/inline` — `FlutterwaveCheckout()` params, callback fields
- `developer.flutterwave.com/v3.0/docs/transaction-verification` — Verify endpoint, response structure
- `developer.flutterwave.com/docs/webhooks` — `flutterwave-signature` header, HMAC SHA256
- `developer.flutterwave.com/v3.0/docs/refunds` — Refund endpoint, NGN minimum ₦100
- npm registry: `@paystack/inline-js@2.23.1`, `flutterwave-node-v3@1.4.1`, `flutterwave-react-v3@1.3.3`

### Secondary (MEDIUM confidence)
- dev.to/ifedayo — Paystack webhook handler: `data.reference` as idempotency key, raw body HMAC
- dev.to/flutterwaveeng — Flutterwave webhook: `event.type`, `event.data`, `event.id` vs `tx_ref`
- jovistudio.com — Flutterwave integration: webhook payload shape, verif-hash plaintext compare
- WebFetch: developer.flutterwave.com/v3.0/docs/webhooks — `flutterwave-signature` header confirmed
- WebFetch: developer.flutterwave.com/v3.0/docs/inline — `FlutterwaveCheckout` param structure
- Multiple sources confirming Flutterwave NGN amounts in naira (major units)

### Tertiary (LOW confidence)
- Community articles re: Flutterwave header migration (verif-hash → flutterwave-signature) — contradictory sources; check both headers
- `data.reference` vs top-level `id` on Paystack webhook — no official payload spec accessed directly; inferred from multiple examples

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm versions verified against registry
- Paystack API mechanics (initialize, verify, refund, HMAC SHA512): HIGH — multiple consistent sources
- Flutterwave amount units (naira, not kobo): HIGH — multiple sources, docs examples confirm 100=₦100
- Flutterwave webhook header name: MEDIUM — contradiction between verif-hash and flutterwave-signature; both covered
- Flutterwave webhook HMAC scheme: MEDIUM — current docs say SHA256 base64; needs live test to confirm
- Adapter interface/file layout: ASSUMED — planner discretion per CONTEXT.md
- idempotency event-id strategy: MEDIUM — reference/tx_ref approach is well-supported; no official doc specifying "use reference as idempotency key"

**Research date:** 2026-07-02
**Valid until:** 2026-08-02 (30 days — Paystack/Flutterwave APIs are relatively stable)
