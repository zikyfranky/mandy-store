// tests/checkout/interswitch-callback.test.ts
// Interswitch verify-on-return callback (PAY-09 / D-14 / D-15 / Pitfall 3 / Pitfall 4).
// ALWAYS-RUNS: toggle-off, unknown-ref, tampered-return (requery authority), idempotency key.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/payments/config", () => ({ isPaymentMethodEnabled: vi.fn() }))
vi.mock("@/lib/orders/queries", () => ({ getOrderByGatewayReference: vi.fn() }))
vi.mock("@/lib/payments/shared/confirm-order-paid", () => ({ confirmOrderPaid: vi.fn() }))
vi.mock("@/lib/payments/gateways/interswitch", () => ({
  interswitchAdapter: { provider: "interswitch", verifyTransaction: vi.fn(), refund: vi.fn() },
}))

import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { interswitchAdapter } from "@/lib/payments/gateways/interswitch"

const MOCK_ORDER = { id: "o1", guestToken: "gt-abc", totalKobo: 10_200_000 }

beforeEach(() => {
  vi.mocked(isPaymentMethodEnabled).mockReturnValue(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getOrderByGatewayReference).mockResolvedValue(MOCK_ORDER as any)
  vi.mocked(confirmOrderPaid).mockResolvedValue({ outcome: "confirmed" })
  vi.mocked(interswitchAdapter.verifyTransaction).mockResolvedValue({
    status: "confirmed", amountKobo: 10_200_000, currency: "NGN", reference: "ORD123",
  })
  vi.mocked(interswitchAdapter.refund).mockResolvedValue(undefined)
})

afterEach(() => vi.clearAllMocks())

const req = () => new NextRequest("http://localhost:3000/api/payments/interswitch/callback?txnref=ORD123")

describe("interswitch callback — toggle + lookup guards", () => {
  it("toggle OFF → redirects to /checkout?error=disabled (toggle FIRST)", async () => {
    vi.mocked(isPaymentMethodEnabled).mockReturnValue(false)
    const { GET } = await import("@/app/api/payments/interswitch/callback/route")
    const res = await GET(req())
    expect(res.headers.get("location")).toContain("/checkout?error=disabled")
    expect(getOrderByGatewayReference).not.toHaveBeenCalled()
  })

  it("unknown reference → redirects to /checkout?error=notfound", async () => {
    vi.mocked(getOrderByGatewayReference).mockResolvedValueOnce(undefined)
    const { GET } = await import("@/app/api/payments/interswitch/callback/route")
    const res = await GET(req())
    expect(res.headers.get("location")).toContain("/checkout?error=notfound")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })
})

describe("interswitch callback — requery is authority (D-15, Pitfall 3)", () => {
  it("tampered return (requery says failed) → NOT confirmed, lands on /order/[token]", async () => {
    vi.mocked(interswitchAdapter.verifyTransaction).mockResolvedValueOnce({
      status: "failed", amountKobo: 0, currency: "NGN", reference: "ORD123",
    })
    const { GET } = await import("@/app/api/payments/interswitch/callback/route")
    const res = await GET(req())
    expect(res.headers.get("location")).toContain("/order/gt-abc")
    expect(confirmOrderPaid).not.toHaveBeenCalled()
  })

  it("amount underpayment (requery amount < total) → NOT confirmed", async () => {
    vi.mocked(interswitchAdapter.verifyTransaction).mockResolvedValueOnce({
      status: "confirmed", amountKobo: 1_000, currency: "NGN", reference: "ORD123",
    })
    const { GET } = await import("@/app/api/payments/interswitch/callback/route")
    const res = await GET(req())
    expect(confirmOrderPaid).not.toHaveBeenCalled()
    expect(res.headers.get("location")).toContain("/order/gt-abc")
  })

  it("confirmed + full amount → confirmOrderPaid with shared eventId 'interswitch:ORD123', lands on /order/[token]", async () => {
    const { GET } = await import("@/app/api/payments/interswitch/callback/route")
    const res = await GET(req())
    expect(confirmOrderPaid).toHaveBeenCalledWith(MOCK_ORDER, {
      provider: "interswitch", eventId: "interswitch:ORD123",
    })
    expect(res.headers.get("location")).toContain("/order/gt-abc")
  })

  it("oversold outcome → refund issued, still lands on /order/[token]", async () => {
    vi.mocked(confirmOrderPaid).mockResolvedValueOnce({ outcome: "oversold", refundNeeded: true })
    const { GET } = await import("@/app/api/payments/interswitch/callback/route")
    const res = await GET(req())
    expect(interswitchAdapter.refund).toHaveBeenCalledWith("ORD123")
    expect(res.headers.get("location")).toContain("/order/gt-abc")
  })
})
