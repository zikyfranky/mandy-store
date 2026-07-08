// WAVE 0 RED SCAFFOLD — expected to fail until Plan 05-03/05-04 implement the actions.
// tests/admin/orders.test.ts
// ADMN-03 (view orders, update fulfillment status), ORD-03 (status-change email),
// D-08/D-09 (single shared transition function, bank-transfer confirm reuses
// confirmOrderPaid verbatim). Imports @/lib/actions/admin-orders, which does not
// exist until Wave 2 — a missing-module import error is the CORRECT red signal.
//
// DB-gated tests run only with TEST_DATABASE_URL; pure unit / error-path tests always run.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { hasDatabase, truncateOrderTables, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks (must be at top-level, hoisted before imports) ──────────────

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock("@/lib/dal", () => ({
  verifyAdminSession: vi.fn(),
}))

// ORD-03: status-change email — Resend is mocked, not the real send path.
vi.mock("@/lib/email/send-order-status-change", () => ({
  sendOrderStatusChangeEmail: vi.fn().mockResolvedValue(undefined),
}))

// ─── Lazy imports after mocks ─────────────────────────────────────────────────

import { verifyAdminSession } from "@/lib/dal"
import { sendOrderStatusChangeEmail } from "@/lib/email/send-order-status-change"

// NOTE: this module does not exist until Wave 2 (Plan 05-04). The top-level import
// below is intentionally left unresolved — Vitest will fail to collect this file
// with a missing-module error, which IS the expected Wave 0 RED signal.
import { updateOrderStatus } from "@/lib/actions/admin-orders"

const ADMIN_USER = { id: "admin-1", role: "admin" as const, email: "admin@example.com" }

beforeEach(() => {
  vi.mocked(verifyAdminSession).mockResolvedValue(ADMIN_USER)
})

afterEach(async () => {
  if (hasDatabase) {
    await truncateOrderTables()
    await truncateCatalogTables()
  }
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

// ─── illegal transition ─────────────────────────────────────────────────────────

describe("updateOrderStatus — illegal transition", () => {
  it.skipIf(!hasDatabase)(
    "rejects pending_payment -> delivered as an illegal transition",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const orderId = crypto.randomUUID()
      await db.insert(schema.orders).values({
        id: orderId,
        reference: "MS-ILLEGAL1",
        guestToken: "a".repeat(64),
        status: "pending_payment",
        customerEmail: "illegal@example.com",
        subtotalKobo: 1_000_000,
        shippingKobo: 200_000,
        totalKobo: 1_200_000,
        shippingName: "Test",
        shippingPhone: "08000000000",
        shippingStreet: "1 Test St",
        shippingCity: "Lagos",
        shippingState: "Lagos",
      })

      await expect(updateOrderStatus(orderId, "delivered")).rejects.toThrow(/illegal transition/i)

      const order = await db.query.orders.findFirst({ where: (o, { eq }) => eq(o.id, orderId) })
      expect(order!.status).toBe("pending_payment")
    }
  )
})

// ─── bank transfer confirm (DB-gated) ────────────────────────────────────────────

describe("updateOrderStatus — bank transfer confirm", () => {
  it.skipIf(!hasDatabase)(
    "awaiting_bank_transfer -> payment_confirmed decrements stock atomically and is idempotent on double-call",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const variantId = crypto.randomUUID()
      const orderId = crypto.randomUUID()

      await db.insert(schema.categories).values({
        id: categoryId,
        name: "BT Cat",
        slug: "bt-cat-" + categoryId.slice(0, 8),
      })
      await db.insert(schema.brands).values({ id: brandId, name: "BT Brand " + brandId.slice(0, 8) })
      await db.insert(schema.products).values({
        id: productId,
        name: "BT Product",
        slug: "bt-product-" + productId.slice(0, 8),
        categoryId,
        brandId,
      })
      await db.insert(schema.variants).values({
        id: variantId,
        productId,
        priceKobo: 1_000_000,
        stock: 5,
      })
      await db.insert(schema.orders).values({
        id: orderId,
        reference: "MS-BTCONFIRM1",
        guestToken: "b".repeat(64),
        status: "awaiting_bank_transfer",
        customerEmail: "bt@example.com",
        subtotalKobo: 1_000_000,
        shippingKobo: 200_000,
        totalKobo: 1_200_000,
        shippingName: "Test",
        shippingPhone: "08000000000",
        shippingStreet: "1 Test St",
        shippingCity: "Lagos",
        shippingState: "Lagos",
      })
      await db.insert(schema.orderItems).values({
        id: crypto.randomUUID(),
        orderId,
        variantId,
        quantity: 1,
        priceKobo: 1_000_000,
        productName: "BT Product",
        variantLabel: "",
        lineTotalKobo: 1_000_000,
      })

      const first = await updateOrderStatus(orderId, "payment_confirmed")
      expect(first).toHaveProperty("success", true)

      const variantAfterFirst = await db.query.variants.findFirst({
        where: (v, { eq }) => eq(v.id, variantId),
      })
      expect(variantAfterFirst!.stock).toBe(4)

      // Idempotent double-call: stock must NOT decrement twice
      await updateOrderStatus(orderId, "payment_confirmed")
      const variantAfterSecond = await db.query.variants.findFirst({
        where: (v, { eq }) => eq(v.id, variantId),
      })
      expect(variantAfterSecond!.stock).toBe(4)
    }
  )
})

// ─── status email ────────────────────────────────────────────────────────────────

describe("updateOrderStatus — status email", () => {
  it.skipIf(!hasDatabase)(
    "fires the status-change email on shipped and delivered only, not on processing",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")

      const orderId = crypto.randomUUID()
      await db.insert(schema.orders).values({
        id: orderId,
        reference: "MS-STATUSEMAIL1",
        guestToken: "c".repeat(64),
        status: "payment_confirmed",
        customerEmail: "status-email@example.com",
        subtotalKobo: 1_000_000,
        shippingKobo: 200_000,
        totalKobo: 1_200_000,
        shippingName: "Test",
        shippingPhone: "08000000000",
        shippingStreet: "1 Test St",
        shippingCity: "Lagos",
        shippingState: "Lagos",
      })

      // payment_confirmed -> processing: no email
      await updateOrderStatus(orderId, "processing")
      expect(sendOrderStatusChangeEmail).not.toHaveBeenCalled()

      // processing -> shipped: email fires
      await updateOrderStatus(orderId, "shipped")
      expect(sendOrderStatusChangeEmail).toHaveBeenCalledTimes(1)

      // shipped -> delivered: email fires again
      await updateOrderStatus(orderId, "delivered")
      expect(sendOrderStatusChangeEmail).toHaveBeenCalledTimes(2)
    }
  )
})
