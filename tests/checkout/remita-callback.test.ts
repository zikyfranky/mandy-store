// tests/checkout/remita-callback.test.ts
// Remita verify-on-return callback (PAY-11 / D-15). Confirmed + tampered-return cases.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/payments/config", () => ({ isPaymentMethodEnabled: vi.fn() }))
vi.mock("@/lib/orders/queries", () => ({ getOrderByGatewayReference: vi.fn() }))
vi.mock("@/lib/payments/shared/confirm-order-paid", () => ({ confirmOrderPaid: vi.fn() }))
vi.mock("@/lib/payments/gateways/remita", () => ({
  remitaAdapter: { provider: "remita", verifyTransaction: vi.fn(), refund: vi.fn() },
}))

import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { getOrderByGatewayReference } from "@/lib/orders/queries"
import { confirmOrderPaid } from "@/lib/payments/shared/confirm-order-paid"
import { remitaAdapter } from "@/lib/payments/gateways/remita"

const MOCK_ORDER = { id: "o1", guestToken: "gt-rem", totalKobo: 10_200_000 }
const RRR = "123456789012"

beforeEach(() => {
  vi.mocked(isPaymentMethodEnabled).mockResolvedValue(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getOrderByGatewayReference).mockResolvedValue(MOCK_ORDER as any)
  vi.mocked(confirmOrderPaid).mockResolvedValue({ outcome: "confirmed" })
  vi.mocked(remitaAdapter.verifyTransaction).mockResolvedValue({
    status: "confirmed", amountKobo: 10_200_000, currency: "NGN", reference: RRR,
  })
})

afterEach(() => vi.clearAllMocks())

const req = () => new NextRequest(`http://localhost:3000/api/payments/remita/callback?RRR=${RRR}`)

describe("remita callback", () => {
  it("confirmed → confirmOrderPaid with shared eventId 'remita:<rrr>'", async () => {
    const { GET } = await import("@/app/api/payments/remita/callback/route")
    const res = await GET(req())
    expect(confirmOrderPaid).toHaveBeenCalledWith(MOCK_ORDER, { provider: "remita", eventId: "remita:" + RRR })
    expect(res.headers.get("location")).toContain("/order/gt-rem")
  })

  it("tampered return (requery failed) → NOT confirmed", async () => {
    vi.mocked(remitaAdapter.verifyTransaction).mockResolvedValueOnce({
      status: "failed", amountKobo: 0, currency: "NGN", reference: RRR,
    })
    const { GET } = await import("@/app/api/payments/remita/callback/route")
    const res = await GET(req())
    expect(confirmOrderPaid).not.toHaveBeenCalled()
    expect(res.headers.get("location")).toContain("/order/gt-rem")
  })

  it("looks the order up by the RRR (gatewayReference = RRR, D-17)", async () => {
    const { GET } = await import("@/app/api/payments/remita/callback/route")
    await GET(req())
    expect(getOrderByGatewayReference).toHaveBeenCalledWith(RRR)
  })
})
