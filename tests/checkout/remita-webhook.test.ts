// tests/checkout/remita-webhook.test.ts
// Remita notification webhook handler tests (Phase 8 / 08-07 / ADMN-07).
//
// NEW test file — the GTPay/Remita webhook routes previously had ZERO dedicated coverage
// (only the verify-on-return CALLBACK route was tested, in remita-callback.test.ts). This
// file covers the webhook route's own toggle-first + resolver-backed fail-closed guard +
// plain SHA-512 notify-hash verify + confirm flow.
//
// All mocked (no DB) — getGatewayConfig mocked directly (08-06 caveat: mock the PUBLIC
// function, not getGatewayCredentialsMap).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import crypto from "crypto"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/payments/config", () => ({ isPaymentMethodEnabled: vi.fn() }))
vi.mock("@/lib/payments/gateway-credentials", () => ({ getGatewayConfig: vi.fn() }))
vi.mock("@/lib/orders/queries", () => ({ getOrderByGatewayReference: vi.fn() }))
vi.mock("@/lib/payments/shared/confirm-order-paid", () => ({ confirmOrderPaid: vi.fn() }))
vi.mock("@/lib/payments/gateways/remita", () => ({
  remitaAdapter: { provider: "remita", refund: vi.fn() },
}))

import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getGatewayConfig } from "@/lib/payments/gateway-credentials"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"

const MOCK_ORDER = { id: "o1", guestToken: "gt-xyz", totalKobo: 10_200_000 }
const API_KEY = "test-remita-api-key"
const MERCHANT_ID = "test-remita-merchant-id"

/** Compute the notify-hash exactly as the route does: rrr + apiKey + merchantId. */
function computeHash(rrr: string, apiKey: string, merchantId: string): string {
  return crypto.createHash("sha512").update(rrr + apiKey + merchantId).digest("hex")
}

/** Build a minimal NextRequest-like stub for POST with a JSON body. */
function makeRequest(body: string) {
  return {
    text: async () => body,
  } as unknown as import("next/server").NextRequest
}

function makeBody(fields: { rrr: string; hash: string }): string {
  return JSON.stringify({ rrr: fields.rrr, hash: fields.hash })
}

beforeEach(() => {
  vi.mocked(isPaymentMethodEnabled).mockResolvedValue(true)
  vi.mocked(getGatewayConfig).mockResolvedValue({ api_key: API_KEY, merchant_id: MERCHANT_ID })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getOrderByGatewayReference).mockResolvedValue(MOCK_ORDER as any)
  vi.mocked(confirmOrderPaid).mockResolvedValue({ outcome: "confirmed" })
})

afterEach(() => vi.clearAllMocks())

describe("remita webhook", () => {
  it("toggle disabled → 200 no-op, confirmOrderPaid never called", async () => {
    vi.mocked(isPaymentMethodEnabled).mockResolvedValue(false)

    const body = makeBody({ rrr: "RRR1", hash: "irrelevant" })

    const { POST } = await import("@/app/api/webhooks/remita/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("not configured (api_key/merchant_id resolve empty) → 400, confirmOrderPaid never called", async () => {
    vi.mocked(getGatewayConfig).mockResolvedValue({})

    const body = makeBody({ rrr: "RRR1", hash: "any-hash" })

    const { POST } = await import("@/app/api/webhooks/remita/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("signature mismatch → 400, confirmOrderPaid never called", async () => {
    const body = makeBody({ rrr: "RRR1", hash: "deadbeef_not_a_valid_hash" })

    const { POST } = await import("@/app/api/webhooks/remita/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty("error")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("confirmed → confirmOrderPaid called with shared eventId 'remita:RRR1'", async () => {
    const rrr = "RRR1"
    const hash = computeHash(rrr, API_KEY, MERCHANT_ID)
    const body = makeBody({ rrr, hash })

    const { POST } = await import("@/app/api/webhooks/remita/route")
    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(confirmOrderPaid).toHaveBeenCalledWith(MOCK_ORDER, { provider: "remita", eventId: "remita:" + rrr })
  })
})
