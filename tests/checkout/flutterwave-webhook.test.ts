// tests/checkout/flutterwave-webhook.test.ts
// Wave 0 scaffold: Flutterwave webhook handler tests.
// PAY-06: Flutterwave charge.completed/status:successful → payment_confirmed + stock decrement + email.
//
// ALWAYS-RUNS (no DB): signature failure → 400
// DB-GATED: happy path, idempotency, amount-unit validation, last-unit race (green in Plan 03)
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
function makeChargeCompletedEvent(txRef: string, amountNaira: number = 1500) {
  return {
    type: "charge.completed",
    id: `wbk_${crypto.randomUUID().slice(0, 8)}`,
    data: {
      id: Math.floor(Math.random() * 1e9),  // Flutterwave transaction ID (integer)
      status: "successful",                 // Pitfall 7: Flutterwave uses "successful", NOT "success"
      tx_ref: txRef,                        // merchant's txRef — the idempotency key
      amount: amountNaira,                  // NAIRA (major units) — Pitfall 1
      currency: "NGN",
      customer: { email: "customer@example.com", name: "Test Customer" },
    },
  }
}

// ─── Env setup ─────────────────────────────────────────────────────────────────
process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-testkey"
process.env.FLUTTERWAVE_WEBHOOK_HASH = TEST_FLW_WEBHOOK_HASH
process.env.ENABLE_FLUTTERWAVE = "true"

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
    const badSignature = "invalid_base64_signature"

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

  // ── Test 3: charge.completed with status != "successful" — ALWAYS RUNS ──────
  it("returns 200 for charge.completed with status !== 'successful' (no processing)", async () => {
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

  // ── Test 4: Happy path — DB-GATED (green in Plan 03) ──────────────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 03] charge.completed + status:successful → order payment_confirmed, stock decremented, email sent. " +
    "Amount unit check: event.data.amount in naira; compare amountNaira × 100 to order.totalKobo."
  )

  // ── Test 5: Idempotency by tx_ref — DB-GATED (green in Plan 03) ─────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 03] duplicate charge.completed event (same tx_ref) → second is no-op. " +
    "Idempotency key: 'flutterwave:' + tx_ref (same for webhook and callback verify)."
  )

  // ── Test 6: Amount unit mismatch — DB-GATED (green in Plan 03) ──────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 03] charge.completed where amountNaira × 100 !== order.totalKobo → reject. " +
    "Guards against Pitfall 8: Flutterwave returns naira; multiply × 100 before comparing to kobo."
  )

  // ── Test 7: Last-unit race — DB-GATED (green in Plan 03) ────────────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 03] charge.completed where stock < qty → payment_failed + refundReason + Flutterwave refund API called"
  )

  // ── Test 8: Order not found — DB-GATED (green in Plan 03) ───────────────────
  it.skipIf(!hasDatabase).todo(
    "[Plan 03] charge.completed with unknown tx_ref → 400 (order not found by gatewayReference)"
  )
})
