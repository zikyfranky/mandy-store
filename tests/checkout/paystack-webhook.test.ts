// tests/checkout/paystack-webhook.test.ts
// Wave 0 scaffold: Paystack webhook handler tests.
// PAY-05: Paystack charge.success → payment_confirmed + stock decrement + email.
//
// ALWAYS-RUNS (no DB): signature failure → 400
// DB-GATED: happy path, idempotency, last-unit race (green in Plan 02)
//
// HMAC helper: crypto.createHmac("sha512", secret).update(rawBody).digest("hex")
// (Pitfall 4: feed raw string, never re-stringify parsed JSON)

import { describe, it, expect, afterEach, vi } from "vitest"
import crypto from "crypto"
import { hasDatabase, truncateOrderTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/email/send-order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

// ─── HMAC helper ──────────────────────────────────────────────────────────────

const TEST_PAYSTACK_SECRET = "sk_test_paystack_webhook_secret"

/** Compute the valid x-paystack-signature for a given raw body. */
function signPaystackBody(rawBody: string, secret: string = TEST_PAYSTACK_SECRET): string {
  return crypto.createHmac("sha512", secret).update(rawBody).digest("hex")
}

/** Build a minimal NextRequest-like stub for webhook POST. */
function makeRequest(body: string, signature: string) {
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
function makeChargeSuccessEvent(reference: string, amountKobo: number = 150_000_00) {
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
process.env.PAYSTACK_SECRET_KEY = TEST_PAYSTACK_SECRET
process.env.ENABLE_PAYSTACK = "true"

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Paystack webhook handler", () => {
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

  // ── Test 3: Happy path — DB-GATED (green in Plan 02) ──────────────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 02] charge.success → order payment_confirmed, stock decremented, confirmation email sent"
  )

  // ── Test 4: Idempotency — DB-GATED (green in Plan 02) ───────────────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 02] duplicate charge.success event (same reference) → second is no-op via processedWebhookEvents"
  )

  // ── Test 5: Last-unit race — DB-GATED (green in Plan 02) ────────────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 02] charge.success where stock < qty → payment_failed + refundReason + Paystack refund API called"
  )

  // ── Test 6: Order not found — DB-GATED (green in Plan 02) ───────────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 02] charge.success with unknown reference → 400 (order not found)"
  )
})
