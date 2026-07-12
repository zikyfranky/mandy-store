// tests/checkout/flutterwave-webhook.test.ts
// Flutterwave webhook handler tests.
// PAY-06: Flutterwave charge.completed/status:successful → payment_confirmed + stock decrement + email.
//
// ALWAYS-RUNS (no DB): signature failure → 400, non-charge.completed → 200, status !== "successful" → 200
// DB-GATED: happy path, idempotency, last-unit race, order not found
//
// HMAC helper: crypto.createHmac("sha256", hash).update(rawBody).digest("base64")
// (RESEARCH Pattern 5: newer "flutterwave-signature" header uses HMAC-SHA256 base64)
// (Pitfall 5: check both "flutterwave-signature" and "verif-hash" headers with fallback)

import { describe, it, expect, afterEach, vi } from "vitest"
import crypto from "crypto"
import { hasDatabase, truncateOrderTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/email/send-order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock flutterwaveRefund for oversold tests — spy without hitting real Flutterwave
vi.mock("@/lib/payments/gateways/flutterwave", () => ({
  flutterwaveBuildParams: vi.fn(),
  flutterwaveVerify: vi.fn(),
  flutterwaveRefund: vi.fn().mockResolvedValue(undefined),
  flutterwaveAdapter: { provider: "flutterwave" },
}))

// Phase 8 (08-06 / D-03 / ADMN-07): mock getGatewayConfig ITSELF (the public function both
// isPaymentMethodEnabled and the webhook route call) rather than the internally-referenced
// getGatewayCredentialsMap export (spreading `actual` and overriding only that named export
// does NOT intercept getGatewayConfig's internal same-module self-reference call — see
// 08-06-PLAN.md caveat — so the real Neon round trip would still fire underneath). Mocking
// the PUBLIC function every external caller imports properly intercepts both call sites, and
// keeps this DB-gated test file's real `db` (seedCatalog/seedVariant/seedOrder, truncate
// helpers) completely untouched — only credential resolution is faked, to the same
// DB-always-empty / env-fallback behavior the real resolver has today.
vi.mock("@/lib/payments/gateway-credentials", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/gateway-credentials")>()
  return {
    ...actual,
    getGatewayConfig: vi.fn(async (provider: string) => {
      const manifest = actual.FIELD_MANIFEST[provider] ?? []
      const result: Record<string, string> = {}
      for (const spec of manifest) {
        const value = process.env[spec.envVar]
        if (value) result[spec.field] = value
      }
      return result
    }),
  }
})

// ─── HMAC helper ──────────────────────────────────────────────────────────────

const TEST_FLW_WEBHOOK_HASH = "flutterwave-webhook-hash-secret"

/**
 * Compute the valid flutterwave-signature for a given raw body.
 * RESEARCH Pattern 5: HMAC-SHA256, output as base64.
 */
function signFlutterwaveBody(rawBody: string, hash: string = TEST_FLW_WEBHOOK_HASH): string {
  return crypto.createHmac("sha256", hash).update(rawBody).digest("base64")
}

/** Build a minimal NextRequest-like stub for webhook POST. */
function makeRequest(body: string, signature: string, headerName = "flutterwave-signature") {
  return {
    text: async () => body,
    headers: {
      get: (name: string) => {
        if (name === headerName) return signature
        return null
      },
    },
  } as unknown as import("next/server").NextRequest
}

/** Build a minimal Flutterwave charge.completed event payload. */
function makeChargeCompletedEvent(
  txRef: string,
  amountNaira: number = 1500,
  txnId: number = Math.floor(Math.random() * 1e9)
) {
  return {
    type: "charge.completed",
    id: `wbk_${crypto.randomUUID().slice(0, 8)}`,
    data: {
      id: txnId,                      // Flutterwave transaction ID (integer) — used for refund
      status: "successful",           // Pitfall 7: Flutterwave uses "successful", NOT "success"
      tx_ref: txRef,                  // merchant's txRef — the idempotency key
      amount: amountNaira,            // NAIRA (major units) — Pitfall 1
      currency: "NGN",
      customer: { email: "customer@example.com", name: "Test Customer" },
    },
  }
}

// ─── Env setup ─────────────────────────────────────────────────────────────────
process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-testkey"
process.env.FLUTTERWAVE_WEBHOOK_HASH = TEST_FLW_WEBHOOK_HASH
process.env.ENABLE_FLUTTERWAVE = "true"

// ─── Seed helpers (DB-gated only) ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedCatalog(db: any, schema: typeof import("@/lib/db/schema")) {
  const categoryId = crypto.randomUUID()
  const brandId = crypto.randomUUID()
  const productId = crypto.randomUUID()

  await db.insert(schema.categories).values({
    id: categoryId,
    name: `Cat-FLW-${categoryId.slice(0, 6)}`,
    slug: `cat-flw-${categoryId.slice(0, 6)}`,
  })
  await db.insert(schema.brands).values({
    id: brandId,
    name: `Brand-FLW-${brandId.slice(0, 6)}`,
  })
  await db.insert(schema.products).values({
    id: productId,
    name: "Test Product FLW",
    slug: `test-prod-flw-${productId.slice(0, 6)}`,
    categoryId,
    brandId,
  })
  return { categoryId, brandId, productId }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedVariant(db: any, schema: typeof import("@/lib/db/schema"), productId: string, stock: number) {
  const variantId = crypto.randomUUID()
  await db.insert(schema.variants).values({
    id: variantId,
    productId,
    priceKobo: 10_000_000,
    stock,
  })
  return variantId
}

/**
 * Seed a pending_payment order with Flutterwave gateway fields.
 * totalKobo = priceKobo * quantity + 200_000 (shipping).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedFlutterwaveOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  schema: typeof import("@/lib/db/schema"),
  variantId: string,
  quantity: number,
  txRef: string
) {
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
    gatewayProvider: "flutterwave",
    gatewayReference: txRef,
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
    productName: "Test Product FLW",
    variantLabel: "Default",
    lineTotalKobo: priceKobo * quantity,
  })

  return { orderId, token, totalKobo: priceKobo * quantity + 200_000 }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Flutterwave webhook handler", () => {
  afterEach(async () => {
    if (hasDatabase) {
      await truncateOrderTables()
      await truncateCatalogTables()
    }
    vi.clearAllMocks()
  })

  // ── Test 1: Signature failure — ALWAYS RUNS (no DB needed) ──────────────────
  it("returns 400 when flutterwave-signature verification fails", async () => {
    const body = JSON.stringify(makeChargeCompletedEvent("txref-bad-sig"))
    const badSignature = "invalid_base64_signature_that_wont_match"

    const { POST } = await import("@/app/api/webhooks/flutterwave/route")
    const req = makeRequest(body, badSignature)
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")
  })

  // ── Test 2: Non-charge.completed event — ALWAYS RUNS ────────────────────────
  it("returns 200 for non-charge.completed events (no processing)", async () => {
    const payload = { type: "transfer.completed", data: {} }
    const body = JSON.stringify(payload)
    const sig = signFlutterwaveBody(body)

    const { POST } = await import("@/app/api/webhooks/flutterwave/route")
    const req = makeRequest(body, sig)
    const res = await POST(req)

    expect(res.status).toBe(200)
  })

  // ── Test 3: charge.completed with status !== "successful" — ALWAYS RUNS ──────
  // Pitfall 7: "successful" is Flutterwave's success string — NOT "success" (that's Paystack)
  it("returns 200 for charge.completed with status !== 'successful' (Pitfall 7 gate)", async () => {
    const payload = {
      type: "charge.completed",
      data: { status: "failed", tx_ref: "txref-failed", amount: 1500, currency: "NGN" },
    }
    const body = JSON.stringify(payload)
    const sig = signFlutterwaveBody(body)

    const { POST } = await import("@/app/api/webhooks/flutterwave/route")
    const req = makeRequest(body, sig)
    const res = await POST(req)

    expect(res.status).toBe(200)
  })

  // ── Test 4: verif-hash plaintext fallback — ALWAYS RUNS (Pitfall 5) ──────────
  it("accepts verif-hash plaintext when it equals FLUTTERWAVE_WEBHOOK_HASH (legacy fallback)", async () => {
    // The legacy verif-hash scheme compares the header value as a plaintext string
    // against FLUTTERWAVE_WEBHOOK_HASH (not HMAC). Route accepts this as a fallback.
    const payload = { type: "transfer.completed", data: {} }
    const body = JSON.stringify(payload)

    // Use the plaintext hash as the header value (legacy verif-hash scheme)
    const { POST } = await import("@/app/api/webhooks/flutterwave/route")
    const req = makeRequest(body, TEST_FLW_WEBHOOK_HASH, "verif-hash")
    const res = await POST(req)

    // Should succeed (plaintext match accepted) and return 200 (non-charge.completed)
    expect(res.status).toBe(200)
  })

  // ── Test 4b: Not configured — fail closed BEFORE any HMAC compute (08-06 / ADMN-07) ──
  it("returns 400 (gateway not configured) when webhook_hash resolves empty, even though secret_key (toggle) is present", async () => {
    // Unlike Paystack, Flutterwave's webhook_hash is a DEDICATED field distinct from
    // secret_key (08-06 plan interface note) — so this scenario is genuinely reachable:
    // ENABLE_FLUTTERWAVE=true + FLUTTERWAVE_SECRET_KEY present means isPaymentMethodEnabled's
    // toggle check PASSES, and the route's own getGatewayConfig("flutterwave") call must
    // independently fail closed on the missing webhook_hash BEFORE any HMAC compute.
    delete process.env.FLUTTERWAVE_WEBHOOK_HASH

    const body = JSON.stringify(makeChargeCompletedEvent("txref-not-configured"))
    // Any signature value — the route must reject before it ever reaches the HMAC compare.
    const signature = "irrelevant-signature-value"

    const { POST } = await import("@/app/api/webhooks/flutterwave/route")
    const req = makeRequest(body, signature)
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error", "Gateway not configured")

    // Restore for subsequent tests.
    process.env.FLUTTERWAVE_WEBHOOK_HASH = TEST_FLW_WEBHOOK_HASH
  })

  // ── Test 5: Happy path — DB-GATED ─────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] charge.completed + status:successful → order payment_confirmed, stock decremented, email sent",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send-order-confirmation")
      const { eq } = await import("drizzle-orm")

      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, schema, productId, 5)
      const txRef = `flw-ref-happy-${crypto.randomUUID().slice(0, 8)}`
      const { orderId, totalKobo } = await seedFlutterwaveOrder(db, schema, variantId, 2, txRef)

      // Amount in NAIRA (Flutterwave major units) — totalKobo / 100
      const amountNaira = totalKobo / 100  // (2 × 10_000_000 + 200_000) / 100 = 202_000 naira
      const txnId = 593416278
      const payload = makeChargeCompletedEvent(txRef, amountNaira, txnId)
      const body = JSON.stringify(payload)
      const sig = signFlutterwaveBody(body)

      const { POST } = await import("@/app/api/webhooks/flutterwave/route")
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

  // ── Test 6: Idempotency by tx_ref — DB-GATED ─────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] duplicate charge.completed event (same tx_ref) → second is no-op via processedWebhookEvents",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send-order-confirmation")
      const { eq } = await import("drizzle-orm")

      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, schema, productId, 5)
      const txRef = `flw-ref-idem-${crypto.randomUUID().slice(0, 8)}`
      const { totalKobo } = await seedFlutterwaveOrder(db, schema, variantId, 2, txRef)

      const amountNaira = totalKobo / 100
      const payload = makeChargeCompletedEvent(txRef, amountNaira)
      const body = JSON.stringify(payload)
      const sig = signFlutterwaveBody(body)

      const { POST } = await import("@/app/api/webhooks/flutterwave/route")
      const req1 = makeRequest(body, sig)
      const req2 = makeRequest(body, sig)

      // Send same event twice (simulates Flutterwave retry)
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

  // ── Test 7: Last-unit race — DB-GATED ─────────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] charge.completed where stock < qty → payment_failed + flutterwaveRefund called + 200",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")
      const { flutterwaveRefund } = await import("@/lib/payments/gateways/flutterwave")

      // stock=1, order wants qty=2 → oversold (last-unit race)
      const { productId } = await seedCatalog(db, schema)
      const variantId = await seedVariant(db, schema, productId, 1)
      const txRef = `flw-ref-race-${crypto.randomUUID().slice(0, 8)}`
      const { orderId, totalKobo } = await seedFlutterwaveOrder(db, schema, variantId, 2, txRef)

      const amountNaira = totalKobo / 100
      const txnId = 111222333
      const payload = makeChargeCompletedEvent(txRef, amountNaira, txnId)
      const body = JSON.stringify(payload)
      const sig = signFlutterwaveBody(body)

      const { POST } = await import("@/app/api/webhooks/flutterwave/route")
      const req = makeRequest(body, sig)
      const res = await POST(req)

      // Webhook always returns 200 (even on oversold — prevents Flutterwave retry)
      expect(res.status).toBe(200)

      // Order should be payment_failed with refundReason
      const order = await db.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      })
      expect(order?.status).toBe("payment_failed")
      expect(order?.refundReason).toBe("oversold")

      // flutterwaveRefund spy should have been called with the numeric txnId as string
      expect(flutterwaveRefund).toHaveBeenCalledWith(String(txnId))

      // Stock unchanged (conditional decrement failed — stock was insufficient)
      const variant = await db.query.variants.findFirst({
        where: eq(schema.variants.id, variantId),
      })
      expect(variant?.stock).toBe(1)
    }
  )

  // ── Test 8: Order not found — DB-GATED ──────────────────────────────────────
  it.skipIf(!hasDatabase)(
    "[DB] charge.completed with unknown tx_ref → 400 (order not found by gatewayReference)",
    async () => {
      const txRef = `flw-ref-unknown-${crypto.randomUUID().slice(0, 8)}`
      const payload = makeChargeCompletedEvent(txRef, 102_000)
      const body = JSON.stringify(payload)
      const sig = signFlutterwaveBody(body)

      const { POST } = await import("@/app/api/webhooks/flutterwave/route")
      const req = makeRequest(body, sig)
      const res = await POST(req)

      // 400 when order not found (allows Flutterwave retry)
      expect(res.status).toBe(400)
    }
  )
})
