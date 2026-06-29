// tests/checkout/totals.test.ts
// Pure unit tests for computeOrderTotal — no DB, always run.

import { describe, it, expect } from "vitest"

// Note: shipping.ts has `import "server-only"` — mock it at the module level
import { vi } from "vitest"
vi.mock("server-only", () => ({}))

describe("computeOrderTotal", () => {
  it("returns correct totals with default FLAT_SHIPPING_KOBO (200000)", async () => {
    const { computeOrderTotal } = await import("@/lib/orders/shipping")
    const result = computeOrderTotal({ subtotalKobo: 50000 })
    expect(result.subtotalKobo).toBe(50000)
    expect(result.shippingKobo).toBe(200000)
    expect(result.totalKobo).toBe(250000)
  })

  it("totalKobo equals subtotalKobo + shippingKobo", async () => {
    const { computeOrderTotal } = await import("@/lib/orders/shipping")
    const result = computeOrderTotal({ subtotalKobo: 150000 })
    expect(result.totalKobo).toBe(result.subtotalKobo + result.shippingKobo)
  })

  it("line-item math: sum of lineTotalKobo + FLAT_SHIPPING_KOBO equals totalKobo", async () => {
    const { computeOrderTotal, FLAT_SHIPPING_KOBO } = await import("@/lib/orders/shipping")
    // Simulate two line items: 2x 30000 + 1x 50000 = 110000
    const lineItems = [
      { lineTotalKobo: 60000 },  // 2 * 30000
      { lineTotalKobo: 50000 },  // 1 * 50000
    ]
    const subtotalKobo = lineItems.reduce((sum, item) => sum + item.lineTotalKobo, 0)
    const result = computeOrderTotal({ subtotalKobo })
    expect(result.totalKobo).toBe(subtotalKobo + FLAT_SHIPPING_KOBO)
  })

  it("handles zero subtotal (empty cart would be rejected upstream, but math should work)", async () => {
    const { computeOrderTotal } = await import("@/lib/orders/shipping")
    const result = computeOrderTotal({ subtotalKobo: 0 })
    expect(result.subtotalKobo).toBe(0)
    expect(result.shippingKobo).toBe(200000)
    expect(result.totalKobo).toBe(200000)
  })
})
