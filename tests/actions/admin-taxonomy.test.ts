// WAVE 0 RED SCAFFOLD — admin-taxonomy.test.ts stays RED until Plan 10-02 creates
// @/lib/actions/admin-taxonomy. The unresolved top-level import below is the CORRECT
// Wave 0 red signal (mirror tests/actions/admin-customers.test.ts). Do NOT stub the module.
// tests/actions/admin-taxonomy.test.ts
// ADMN-12 (category CRUD) + ADMN-13 (brand CRUD). Encodes the 10-VALIDATION.md map:
// admin-gate, D-05 friendly uniqueness, D-04 immutable slug, D-02 no-cascade, D-09 cache invalidation.
// DB-gated tests run only with TEST_DATABASE_URL.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { hasDatabase, getDb, truncateCatalogTables } from "../helpers/db"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
// D-06 pattern: admin actions re-verify via verifyAdminSession — mock @/lib/dal.
vi.mock("@/lib/dal", () => ({ verifyAdminSession: vi.fn() }))

import { verifyAdminSession } from "@/lib/dal"
import { revalidatePath, updateTag } from "next/cache"

// Module does NOT exist until Plan 10-02 — intentional unresolved import (Wave 0 RED).
import {
  createCategory,
  renameCategory,
  deactivateCategory,
  reactivateCategory,
  createBrand,
  renameBrand,
  deactivateBrand,
  reactivateBrand,
} from "@/lib/actions/admin-taxonomy"

const ADMIN_USER = { id: "admin-1", role: "admin" as const, email: "admin@example.com" }

async function getCategory(id: string) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")
  const [c] = await db.select().from(schema.categories).where(eq(schema.categories.id, id))
  return c
}

async function getBrand(id: string) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")
  const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, id))
  return b
}

async function insertProduct(categoryId: string, brandId: string) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const id = crypto.randomUUID()
  await db.insert(schema.products).values({
    id,
    name: `P-${id.slice(0, 8)}`,
    slug: `p-${id.slice(0, 8)}`,
    categoryId,
    brandId,
  })
  return id
}

async function getProduct(id: string) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id))
  return p
}

beforeEach(async () => {
  if (hasDatabase) await truncateCatalogTables()
  vi.clearAllMocks()
  vi.mocked(verifyAdminSession).mockResolvedValue(ADMIN_USER)
})

afterEach(async () => {
  if (hasDatabase) await truncateCatalogTables()
})

// ─── Admin-gate (D-06 / D-10, runs without DB) ─────────────────────────────────

describe("admin-taxonomy admin gate", () => {
  it("rejects createCategory when verifyAdminSession throws (non-admin)", async () => {
    vi.mocked(verifyAdminSession).mockRejectedValueOnce(new Error("Not authorized"))
    await expect(createCategory({ name: "Laptops" })).rejects.toThrow()
  })

  it("rejects createBrand when verifyAdminSession throws (non-admin)", async () => {
    vi.mocked(verifyAdminSession).mockRejectedValueOnce(new Error("Not authorized"))
    await expect(createBrand({ name: "Acme" })).rejects.toThrow()
  })
})

// ─── Category CRUD (DB-gated) ─────────────────────────────────────────────────

describe.skipIf(!hasDatabase)("category CRUD", () => {
  it("createCategory generates a slug and fires cache invalidation (D-04/D-09)", async () => {
    const res = await createCategory({ name: "Laptops" })
    expect(res.success).toBe(true)
    if (!res.success) return
    const c = await getCategory(res.id)
    expect(c.slug).toBe("laptops")
    expect(c.isActive).toBe(true)
    expect(vi.mocked(revalidatePath)).toHaveBeenCalled()
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith("categories-nav")
  })

  it("createCategory rejects a duplicate name with a friendly error (D-05)", async () => {
    await createCategory({ name: "Laptops" })
    const res = await createCategory({ name: "Laptops" })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.error.toLowerCase()).toContain("already exists")
  })

  it("renameCategory changes name only, slug unchanged (D-04)", async () => {
    const created = await createCategory({ name: "Laptops" })
    if (!created.success) throw new Error("setup failed")
    const before = await getCategory(created.id)
    const res = await renameCategory(created.id, { name: "Notebooks" })
    expect(res.success).toBe(true)
    const after = await getCategory(created.id)
    expect(after.name).toBe("Notebooks")
    expect(after.slug).toBe(before.slug) // slug immutable
  })

  it("deactivate/reactivateCategory toggle isActive and do NOT cascade to products (D-02)", async () => {
    const created = await createCategory({ name: "Laptops" })
    if (!created.success) throw new Error("setup failed")
    const brand = await createBrand({ name: "Acme" })
    if (!brand.success) throw new Error("setup failed")
    const productId = await insertProduct(created.id, brand.id)

    const de = await deactivateCategory(created.id)
    expect(de.success).toBe(true)
    expect((await getCategory(created.id)).isActive).toBe(false)
    // No-cascade: the product still references this category and is untouched
    const prod = await getProduct(productId)
    expect(prod.categoryId).toBe(created.id)

    const re = await reactivateCategory(created.id)
    expect(re.success).toBe(true)
    expect((await getCategory(created.id)).isActive).toBe(true)
  })
})

// ─── Brand CRUD (DB-gated) ────────────────────────────────────────────────────

describe.skipIf(!hasDatabase)("brand CRUD", () => {
  it("createBrand persists an active brand (no slug) and rejects duplicates (D-05)", async () => {
    const res = await createBrand({ name: "Acme" })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect((await getBrand(res.id)).isActive).toBe(true)
    const dup = await createBrand({ name: "Acme" })
    expect(dup.success).toBe(false)
  })

  it("renameBrand updates name; deactivate/reactivate toggle isActive with no product cascade (D-02)", async () => {
    const cat = await createCategory({ name: "Laptops" })
    const brand = await createBrand({ name: "Acme" })
    if (!cat.success || !brand.success) throw new Error("setup failed")
    const productId = await insertProduct(cat.id, brand.id)

    expect((await renameBrand(brand.id, { name: "AcmeCorp" })).success).toBe(true)
    expect((await getBrand(brand.id)).name).toBe("AcmeCorp")

    expect((await deactivateBrand(brand.id)).success).toBe(true)
    expect((await getBrand(brand.id)).isActive).toBe(false)
    expect((await getProduct(productId)).brandId).toBe(brand.id) // no-cascade

    expect((await reactivateBrand(brand.id)).success).toBe(true)
    expect((await getBrand(brand.id)).isActive).toBe(true)
  })
})
