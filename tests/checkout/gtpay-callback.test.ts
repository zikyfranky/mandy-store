// tests/checkout/gtpay-callback.test.ts
// GTPay verify-on-return callback (PAY-10 / D-15). Confirmed + tampered-return cases.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/payments/config", () => ({ isPaymentMethodEnabled: vi.fn() }))
vi.mock("@/lib/orders/queries", () => ({ getOrderByGatewayReference: vi.fn() }))
vi.mock("@/lib/payments/shared/confirm-order-paid", () => ({ confirmOrderPaid: vi.fn() }))
vi.mock("@/lib/payments/gateways/gtpay", () => ({
  gtpayAdapter: { provider: "gtpay", verifyTransaction: vi.fn(), refund: vi.fn() },
}))

import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { gtpayAdapter } from "@/lib/payments/gateways/gtpay"

const MOCK_ORDER = { id: "o1", guestToken: "gt-xyz", totalKobo: 10_200_000 }

beforeEach(() => {
  vi.mocked(isPaymentMethodEnabled).mockResolvedValue(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getOrderByGatewayReference).mockResolvedValue(MOCK_ORDER as any)
  vi.mocked(confirmOrderPaid).mockResolvedValue({ outcome: "confirmed" })
  vi.mocked(gtpayAdapter.verifyTransaction).mockResolvedValue({
    status: "confirmed", amountKobo: 10_200_000, currency: "NGN", reference: "GTX1",
  })
})

afterEach(() => vi.clearAllMocks())

const req = () => new NextRequest("http://localhost:3000/api/payments/gtpay/callback?gtpay_tranx_id=GTX1")

describe("gtpay callback", () => {
  it("confirmed → confirmOrderPaid with shared eventId 'gtpay:GTX1'", async () => {
    const { GET } = await import("@/app/api/payments/gtpay/callback/route")
    const res = await GET(req())
    expect(confirmOrderPaid).toHaveBeenCalledWith(MOCK_ORDER, { provider: "gtpay", eventId: "gtpay:GTX1" })
    expect(res.headers.get("location")).toContain("/order/gt-xyz")
  })

  it("tampered return (requery failed) → NOT confirmed", async () => {
    vi.mocked(gtpayAdapter.verifyTransaction).mockResolvedValueOnce({
      status: "failed", amountKobo: 0, currency: "NGN", reference: "GTX1",
    })
    const { GET } = await import("@/app/api/payments/gtpay/callback/route")
    const res = await GET(req())
    expect(confirmOrderPaid).not.toHaveBeenCalled()
    expect(res.headers.get("location")).toContain("/order/gt-xyz")
  })

  it("toggle OFF → /checkout?error=disabled", async () => {
    vi.mocked(isPaymentMethodEnabled).mockResolvedValue(false)
    const { GET } = await import("@/app/api/payments/gtpay/callback/route")
    const res = await GET(req())
    expect(res.headers.get("location")).toContain("/checkout?error=disabled")
  })
})
