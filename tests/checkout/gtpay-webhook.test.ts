// tests/checkout/gtpay-webhook.test.ts
// GTPay notification webhook handler tests (Phase 8 / 08-07 / ADMN-07).
//
// NEW test file — the GTPay/Remita webhook routes previously had ZERO dedicated coverage
// (only the verify-on-return CALLBACK route was tested, in gtpay-callback.test.ts). This
// file covers the webhook route's own toggle-first + resolver-backed fail-closed guard +
// plain SHA-512 notify-hash verify + confirm flow.
//
// All mocked (no DB) — mirrors gtpay-callback.test.ts's mock style, plus getGatewayConfig
// mocked directly (08-06 caveat: mock the PUBLIC function, not getGatewayCredentialsMap).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import crypto from "crypto"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/payments/config", () => ({ isPaymentMethodEnabled: vi.fn() }))
vi.mock("@/lib/payments/gateway-credentials", () => ({ getGatewayConfig: vi.fn() }))
vi.mock("@/lib/orders/queries", () => ({ getOrderByGatewayReference: vi.fn() }))
vi.mock("@/lib/payments/shared/confirm-order-paid", () => ({ confirmOrderPaid: vi.fn() }))
vi.mock("@/lib/payments/gateways/gtpay", () => ({
  gtpayAdapter: { provider: "gtpay", refund: vi.fn() },
}))

import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getGatewayConfig } from "@/lib/payments/gateway-credentials"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"

const MOCK_ORDER = { id: "o1", guestToken: "gt-xyz", totalKobo: 10_200_000 }
const HASH_KEY = "test-gtpay-hash-key"

/** Compute the notify-hash exactly as the route does: tranx_id + amt + status_code + curr + hashKey. */
function computeHash(tranxId: string, amt: string, statusCode: string, curr: string, hashKey: string): string {
  return crypto.createHash("sha512").update(tranxId + amt + statusCode + curr + hashKey).digest("hex")
}

/** Build a minimal NextRequest-like stub for POST with a URLSearchParams-style form body. */
function makeRequest(body: string) {
  return {
    text: async () => body,
  } as unknown as import("next/server").NextRequest
}

function makeBody(fields: { tranxId: string; amt: string; statusCode: string; curr: string; hash: string }): string {
  const params = new URLSearchParams()
  params.set("gtpay_tranx_id", fields.tranxId)
  params.set("gtpay_tranx_amt", fields.amt)
  params.set("gtpay_tranx_status_code", fields.statusCode)
  params.set("gtpay_tranx_curr", fields.curr)
  params.set("gtpay_hash", fields.hash)
  return params.toString()
}

beforeEach(() => {
  vi.mocked(isPaymentMethodEnabled).mockResolvedValue(true)
  vi.mocked(getGatewayConfig).mockResolvedValue({ hash_key: HASH_KEY })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getOrderByGatewayReference).mockResolvedValue(MOCK_ORDER as any)
  vi.mocked(confirmOrderPaid).mockResolvedValue({ outcome: "confirmed" })
})

afterEach(() => vi.clearAllMocks())

describe("gtpay webhook", () => {
  it("toggle disabled → 200 no-op, confirmOrderPaid never called", async () => {
    vi.mocked(isPaymentMethodEnabled).mockResolvedValue(false)

    const body = makeBody({ tranxId: "GTX1", amt: "10200000", statusCode: "00", curr: "NGN", hash: "irrelevant" })

    const { POST } = await import("@/app/api/webhooks/gtpay/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("not configured (hash_key resolves empty) → 400, confirmOrderPaid never called", async () => {
    vi.mocked(getGatewayConfig).mockResolvedValue({})

    const body = makeBody({ tranxId: "GTX1", amt: "10200000", statusCode: "00", curr: "NGN", hash: "any-hash" })

    const { POST } = await import("@/app/api/webhooks/gtpay/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("signature mismatch → 400, confirmOrderPaid never called", async () => {
    const body = makeBody({
      tranxId: "GTX1",
      amt: "10200000",
      statusCode: "00",
      curr: "NGN",
      hash: "deadbeef_not_a_valid_hash",
    })

    const { POST } = await import("@/app/api/webhooks/gtpay/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("confirmed → confirmOrderPaid called with shared eventId 'gtpay:GTX1'", async () => {
    const tranxId = "GTX1"
    const amt = "10200000"
    const statusCode = "00"
    const curr = "NGN"
    const hash = computeHash(tranxId, amt, statusCode, curr, HASH_KEY)
    const body = makeBody({ tranxId, amt, statusCode, curr, hash })

    const { POST } = await import("@/app/api/webhooks/gtpay/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(confirmOrderPaid).toHaveBeenCalledWith(MOCK_ORDER, { provider: "gtpay", eventId: "gtpay:" + tranxId })
  })
})
