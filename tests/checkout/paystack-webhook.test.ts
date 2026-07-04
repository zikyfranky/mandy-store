// tests/checkout/paystack-webhook.test.ts
// Paystack webhook handler tests.
// PAY-05: Paystack charge.success → payment_confirmed + stock decrement + email.
//
// ALWAYS-RUNS (no DB): signature failure → 400, non-charge.success → 200, toggle disabled → 400
// DB-GATED: happy path, idempotency, last-unit race, order not found
//
// HMAC helper: crypto.createHmac("sha512", secret).update(rawBody).digest("hex")
// (Pitfall 4: feed raw string, never re-stringify parsed JSON)

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import crypto from "crypto"
import { hasDatabase, truncateOrderTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/email/send-order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock paystackRefund for oversold tests — spy on it without hitting real Paystack
vi.mock("@/lib/payments/gateways/paystack", () => ({
  paystackInitialize: vi.fn(),
  paystackVerify: vi.fn(),
  paystackRefund: vi.fn().mockResolvedValue(undefined),
  paystackAdapter: { provider: "paystack" },
}))

// ─── HMAC helper ──────────────────────────────────────────────────────────────

const TEST_PAYSTACK_SECRET = "sk_test_paystack_webhook_secret"

/** Compute the valid x-paystack-signature for a given raw body. */
function signPaystackBody(rawBody: string, secret: string = TEST_PAYSTACK_SECRET): string {
  return crypto.createHmac("sha512", secret).update(rawBody).digest("hex")
}

/** Build a minimal NextRequest-like stub for webhook POST. */
function makeRequest(body: string, signature: string, paystackEnabled = true) {
  return {
    text: async () => body,
    headers: {
      get: (name: string) => {
        if (name === "x-paystack-signature") return signature
        return null
      },
    },
  } as unknown as import("next/server").NextRequest
}

/** Build a minimal Paystack charge.success event payload. */
function makeChargeSuccessEvent(reference: string, amountKobo: number = 10_200_000) {
  return {
    event: "charge.success",
    data: {
      id: Math.floor(Math.random() * 1e9),
      status: "success",
      reference,
      amount: amountKobo,
      currency: "NGN",
      customer: { email: "customer@example.com" },
    },
  }
}

// ─── Env setup ─────────────────────────────────────────────────────────────────
// Set in outer scope so always-runs tests work (they don't have DB access)
process.env.PAYSTACK_SECRET_KEY = TEST_PAYSTACK_SECRET
process.env.ENABLE_PAYSTACK = "true"

// ─── Seed helpers (DB-gated only) ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedCatalog(db: any, schema: typeof import("@/lib/db/schema")) {
  const categoryId = crypto.randomUUID()
  const brandId = crypto.randomUUID()
  const productId = crypto.randomUUID()

  await db.insert(schema.categories).values({
    id: categoryId,
    name: `Cat-${categoryId.slice(0, 6)}`,
    slug: `cat-${categoryId.slice(0, 6)}`,
  })
  await db.insert(schema.brands).values({
    id: brandId,
    name: `Brand-${brandId.slice(0, 6)}`,
  })
  await db.insert(schema.products).values({
    id: productId,
    name: "Test Product",
    slug: `test-prod-${productId.slice(0, 6)}`,
    categoryId,
    brandId,
  })
  return { categoryId, brandId, productId }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedVariant(db: any, productId: string, stock: number) {
  const variantId = crypto.randomUUID()
  await db.insert((await import("@/lib/db/schema")).variants).values({
    id: variantId,
    productId,
    priceKobo: 10_000_000,
    stock,
  })
  return variantId
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedOrder(db: any, schema: typeof import("@/lib/db/schema"), variantId: string, quantity: number, reference: string) {
  const orderId = crypto.randomUUID()
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
  const priceKobo = 10_000_000

  await db.insert(schema.orders).values({
    id: orderId,
    reference: `MS-${orderId.slice(0, 6).toUpperCase()}`,
    guestToken: token,
    status: "pending_payment",
    customerEmail: "customer@example.com",
    subtotalKobo: priceKobo * quantity,
    shippingKobo: 200_000,
    totalKobo: priceKobo * quantity + 200_000,
    gatewayProvider: "paystack",
    gatewayReference: reference,
    shippingName: "Test User",
    shippingPhone: "08012345678",
    shippingStreet: "1 Test St",
    shippingCity: "Lagos",
    shippingState: "Lagos",
  })
  await db.insert(schema.orderItems).values({
    id: crypto.randomUUID(),
    orderId,
    variantId,
    quantity,
    priceKobo,
    productName: "Test Product",
    variantLabel: "Default",
    lineTotalKobo: priceKobo * quantity,
  })

  return { orderId, token }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Paystack webhook handler", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = TEST_PAYSTACK_SECRET
    process.env.ENABLE_PAYSTACK = "true"
  })

  afterEach(async () => {
    if (hasDatabase) {
      await truncateOrderTables()
      await truncateCatalogTables()
    }
    vi.clearAllMocks()
  })

  // ── Test 1: Signature failure — ALWAYS RUNS (no DB needed) ──────────────────
  it("returns 400 when x-paystack-signature verification fails", async () => {
    const body = JSON.stringify(makeChargeSuccessEvent("ref-bad-sig"))
    const badSignature = "deadbeef_not_a_valid_signature"

    const { POST } = await import("@/app/api/webhooks/paystack/route")
    const req = makeRequest(body, badSignature)
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")
  })

  // ── Test 2: Non-charge.success event — ALWAYS RUNS ──────────────────────────
  it("returns 200 for non-charge.success events (no processing)", async () => {
    const payload = { event: "transfer.success", data: {} }
    const body = JSON.stringify(payload)
    const sig = signPaystackBody(body)

    const { POST } = await import("@/app/api/webhooks/paystack/route")
    const req = makeRequest(body, sig)
    const res = await POST(req)

    expect(res.status).toBe(200)
  })

  // ── Test 3: Toggle disabled — ALWAYS RUNS ───────────────────────────────────
  it("returns 400 when Paystack gateway is disabled (toggle check first)", async () => {
    process.env.ENABLE_PAYSTACK = ""
    process.env.PAYSTACK_SECRET_KEY = ""

    const body = JSON.stringify(makeChargeSuccessEvent("ref-disabled"))
    const sig = signPaystackBody(body)

    // Re-import after env change (module caching means isPaymentMethodEnabled re-reads env)
    const { POST } = await import("@/app/api/webhooks/paystack/route")
    const req = makeRequest(body, sig)
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")

    // Restore for subsequent tests
    process.env.PAYSTACK_SECRET_KEY = TEST_PAYSTACK_SECRET
    process.env.ENABLE_PAYSTACK = "true"
  })

  // ── Test 4: Happy path — DB-GATED ─────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] charge.success → order payment_confirmed, stock decremented, confirmation email sent",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send-order-confirmation")
      const { eq } = await import("drizzle-orm")

      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, productId, 5)
      const reference = `ref-happy-${crypto.randomUUID().slice(0, 8)}`
      const { orderId } = await seedOrder(db, schema, variantId, 2, reference)

      // Amount matches order.totalKobo: 2 × 10_000_000 + 200_000 = 20_200_000
      const payload = makeChargeSuccessEvent(reference, 20_200_000)
      const body = JSON.stringify(payload)
      const sig = signPaystackBody(body)

      const { POST } = await import("@/app/api/webhooks/paystack/route")
      const req = makeRequest(body, sig)
      const res = await POST(req)

      expect(res.status).toBe(200)

      // Order status should be payment_confirmed
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      })
      expect(order?.status).toBe("payment_confirmed")
      expect(order?.paidAt).not.toBeNull()

      // Stock decremented by 2 (5 - 2 = 3)
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(3)

      // Confirmation email sent once
      expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1)
    }
  )

  // ── Test 5: Idempotency — DB-GATED ─────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] duplicate charge.success event (same reference) → second is no-op via processedWebhookEvents",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send-order-confirmation")
      const { eq } = await import("drizzle-orm")

      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, productId, 5)
      const reference = `ref-idem-${crypto.randomUUID().slice(0, 8)}`
      await seedOrder(db, schema, variantId, 2, reference)

      const payload = makeChargeSuccessEvent(reference, 20_200_000)
      const body = JSON.stringify(payload)
      const sig = signPaystackBody(body)

      const { POST } = await import("@/app/api/webhooks/paystack/route")
      const req1 = makeRequest(body, sig)
      const req2 = makeRequest(body, sig)

      // Send same event twice
      const res1 = await POST(req1)
      const res2 = await POST(req2)

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      // Stock decremented ONCE only (5 - 2 = 3)
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(3)

      // Email sent only once (idempotency guard fired on second call)
      expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1)
    }
  )

  // ── Test 6: Last-unit race — DB-GATED ───────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] charge.success where stock < qty → payment_failed + paystackRefund called + 200",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")
      const { paystackRefund } = await import("@/lib/payments/gateways/paystack")

      // stock=1, order wants qty=2 → oversold
      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, productId, 1)
      const reference = `ref-race-${crypto.randomUUID().slice(0, 8)}`
      const { orderId } = await seedOrder(db, schema, variantId, 2, reference)

      // Amount: 2 × 10_000_000 + 200_000 = 20_200_000
      const payload = makeChargeSuccessEvent(reference, 20_200_000)
      const body = JSON.stringify(payload)
      const sig = signPaystackBody(body)

      const { POST } = await import("@/app/api/webhooks/paystack/route")
      const req = makeRequest(body, sig)
      const res = await POST(req)

      // Webhook always returns 200 (even on oversold — to prevent Paystack retry)
      expect(res.status).toBe(200)

      // Order should be payment_failed
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      })
      expect(order?.status).toBe("payment_failed")
      expect(order?.refundReason).toBe("oversold")

      // paystackRefund spy should have been called with the reference
      expect(paystackRefund).toHaveBeenCalledWith(reference)

      // Stock unchanged (conditional decrement didn't succeed)
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(1)
    }
  )

  // ── Test 7: Order not found — DB-GATED ──────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] charge.success with unknown reference → 400 (order not found)",
    async () => {
      const reference = `ref-unknown-${crypto.randomUUID().slice(0, 8)}`
      const payload = makeChargeSuccessEvent(reference, 10_200_000)
      const body = JSON.stringify(payload)
      const sig = signPaystackBody(body)

      const { POST } = await import("@/app/api/webhooks/paystack/route")
      const req = makeRequest(body, sig)
      const res = await POST(req)

      // 400 when order not found (allows Paystack retry — same as Stripe pattern)
      expect(res.status).toBe(400)
    }
  )
})
