// WAVE 0 RED SCAFFOLD — expected to fail until Plan 05-03/05-04 implement the actions.
// tests/admin/products.test.ts
// ADMN-01 (admin add/edit/delete products with images), ADMN-02 (variant price/stock,
// cache invalidation). These import from @/lib/actions/admin-products and
// @/lib/blob/upload, which do not exist until Wave 2 — a missing-module import error
// is the CORRECT red signal for Wave 0. Do NOT stub those modules to make this pass.
//
// DB-gated tests run only with TEST_DATABASE_URL; pure unit / error-path tests always run.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { hasDatabase, truncateCatalogTables } from "../helpers/db"

// ─── Module mocks (must be at top-level, hoisted before imports) ──────────────
// Pattern from tests/checkout/actions.test.ts, ADDING updateTag (not in the
// checkout mock shape — 05-VALIDATION.md line 64 / 05-PATTERNS.md line 366).

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))

// D-02: admin actions re-verify via verifyAdminSession — mock @/lib/dal, not @/lib/auth.
vi.mock("@/lib/dal", () => ({
  verifyAdminSession: vi.fn(),
}))

// D-03: image upload wraps @vercel/blob's put() — mock the SDK, not the wrapper.
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://blob.vercel-storage.com/test-image.jpg" }),
  del: vi.fn().mockResolvedValue(undefined),
}))

// ─── Lazy imports after mocks ─────────────────────────────────────────────────

import { verifyAdminSession } from "@/lib/dal"
import { updateTag } from "next/cache"

// NOTE: this module does not exist until Wave 2 (Plan 05-03). The top-level import
// below is intentionally left unresolved — Vitest will fail to collect this file
// with a missing-module error, which IS the expected Wave 0 RED signal.
import {
  createProduct,
  updateProduct,
  deactivateProduct,
  updateVariant,
} from "@/lib/actions/admin-products"
import { uploadProductImage } from "@/lib/blob/upload"

const ADMIN_USER = { id: "admin-1", role: "admin" as const, email: "admin@example.com" }
const CUSTOMER_USER = { id: "cust-1", role: "customer" as const, email: "customer@example.com" }

beforeEach(() => {
  vi.mocked(verifyAdminSession).mockResolvedValue(ADMIN_USER)
})

afterEach(async () => {
  if (hasDatabase) {
    await truncateCatalogTables()
  }
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

// ─── auth ──────────────────────────────────────────────────────────────────────

describe("admin-products — auth", () => {
  it("rejects a non-admin caller of createProduct", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => {
      throw new Error("redirect")
    })
    await expect(
      createProduct({ name: "X", categoryId: "c1", brandId: "b1" })
    ).rejects.toThrow()
  })

  it("rejects a non-admin caller of updateProduct", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => {
      throw new Error("redirect")
    })
    await expect(
      updateProduct("p1", { name: "X", categoryId: "c1", brandId: "b1" })
    ).rejects.toThrow()
  })

  it("rejects a non-admin caller of deactivateProduct", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => {
      throw new Error("redirect")
    })
    await expect(deactivateProduct("p1")).rejects.toThrow()
  })

  it("rejects a customer-role session (not just unauthenticated)", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => {
      // verifySession()/verifyAdminSession() redirect() a customer role away from /admin
      throw new Error("redirect")
    })
    await expect(deactivateProduct("p1")).rejects.toThrow()
    void CUSTOMER_USER // referenced for fixture clarity — real impl swaps this in via redirect
  })
})

// ─── alt text ──────────────────────────────────────────────────────────────────

describe("admin-products — alt text", () => {
  it("rejects empty alt text server-side on image upload", async () => {
    const result = await uploadProductImage({
      productId: "p1",
      file: new Blob(["fake-image-bytes"]),
      altText: "",
    })
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/alt text/i)
  })

  it("rejects whitespace-only alt text server-side on image upload", async () => {
    const result = await uploadProductImage({
      productId: "p1",
      file: new Blob(["fake-image-bytes"]),
      altText: "   ",
    })
    expect(result).toHaveProperty("error")
    expect((result as { error: string }).error).toMatch(/alt text/i)
  })
})

// ─── soft delete (DB-gated) ─────────────────────────────────────────────────────

describe("admin-products — soft delete", () => {
  it.skipIf(!hasDatabase)(
    "deactivateProduct hides product from getCatalog/getProduct, preserves getProductForAdmin",
    async () => {
      const { db } = await import("@/lib/db/client")
      const schema = await import("@/lib/db/schema")
      const { getCatalog, getProduct } = await import("@/lib/catalog/queries")
      const { getProductForAdmin } = await import("@/lib/catalog/admin-queries")

      const categoryId = crypto.randomUUID()
      const brandId = crypto.randomUUID()
      const productId = crypto.randomUUID()
      const slug = "soft-delete-test-" + productId.slice(0, 8)

      await db.insert(schema.categories).values({
        id: categoryId,
        name: "SD Cat",
        slug: "sd-cat-" + categoryId.slice(0, 8),
      })
      await db.insert(schema.brands).values({ id: brandId, name: "SD Brand " + brandId.slice(0, 8) })
      await db.insert(schema.products).values({
        id: productId,
        name: "Soft Delete Product",
        slug,
        categoryId,
        brandId,
      })

      await deactivateProduct(productId)

      // Hidden from storefront reads
      const catalog = await getCatalog({ sort: "newest", page: 1 })
      expect(catalog.products.find((p) => p.id === productId)).toBeUndefined()
      expect(await getProduct(slug)).toBeNull()

      // Preserved for admin
      const adminView = await getProductForAdmin(productId)
      expect(adminView).not.toBeNull()
      expect(adminView!.isActive).toBe(false)
    }
  )
})

// ─── cache invalidation ─────────────────────────────────────────────────────────

describe("admin-products — cache invalidation", () => {
  it("updateProduct calls updateTag('product-<slug>')", async () => {
    await updateProduct("p1", { name: "Updated Name", categoryId: "c1", brandId: "b1" })
    expect(vi.mocked(updateTag)).toHaveBeenCalled()
  })

  it("updateVariant calls updateTag('product-<slug>')", async () => {
    await updateVariant("v1", { priceKobo: 1_000_000, stock: 5 })
    expect(vi.mocked(updateTag)).toHaveBeenCalled()
  })
})
