// WAVE 0 RED SCAFFOLD — admin-queries.test.ts stays RED until Plan 10-03 adds
// listCategoriesForAdmin / listBrandsForAdmin to @/lib/catalog/admin-queries.
// The unresolved named imports below are the CORRECT Wave 0 red signal.
// tests/catalog/admin-queries.test.ts
// ADMN-12/13 — admin taxonomy read queries with product-count aggregate (D-02: counts ALL
// referencing products regardless of product.isActive). DB-gated (TEST_DATABASE_URL).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { hasDatabase, getDb, truncateCatalogTables } from "../helpers/db"

vi.mock("server-only", () => ({}))

// Functions do NOT exist until Plan 10-03 — intentional unresolved import (Wave 0 RED).
import { listCategoriesForAdmin, listBrandsForAdmin } from "@/lib/catalog/admin-queries"

async function seed() {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")

  const catFull = crypto.randomUUID()
  const catEmpty = crypto.randomUUID()
  await db.insert(schema.categories).values([
    { id: catFull, name: "Laptops", slug: "laptops" },
    { id: catEmpty, name: "Cameras", slug: "cameras" },
  ])

  const brandFull = crypto.randomUUID()
  const brandEmpty = crypto.randomUUID()
  await db.insert(schema.brands).values([
    { id: brandFull, name: "Acme" },
    { id: brandEmpty, name: "Globex" },
  ])

  // 2 products under catFull / brandFull; 0 under the "empty" entities
  await db.insert(schema.products).values([
    { id: crypto.randomUUID(), name: "L1", slug: `l1-${crypto.randomUUID().slice(0, 8)}`, categoryId: catFull, brandId: brandFull },
    { id: crypto.randomUUID(), name: "L2", slug: `l2-${crypto.randomUUID().slice(0, 8)}`, categoryId: catFull, brandId: brandFull },
  ])

  return { catFull, catEmpty, brandFull, brandEmpty }
}

beforeEach(async () => {
  if (hasDatabase) await truncateCatalogTables()
})
afterEach(async () => {
  if (hasDatabase) await truncateCatalogTables()
})

describe.skipIf(!hasDatabase)("listCategoriesForAdmin", () => {
  it("returns a product-count aggregate incl. a zero-product category", async () => {
    const { catFull, catEmpty } = await seed()
    const rows = await listCategoriesForAdmin()
    const full = rows.find((r) => r.id === catFull)
    const empty = rows.find((r) => r.id === catEmpty)
    expect(full?.productCount).toBe(2)
    expect(empty?.productCount).toBe(0)
    expect(full?.slug).toBe("laptops")
    expect(full?.isActive).toBe(true)
  })
})

describe.skipIf(!hasDatabase)("listBrandsForAdmin", () => {
  it("returns a product-count aggregate incl. a zero-product brand", async () => {
    const { brandFull, brandEmpty } = await seed()
    const rows = await listBrandsForAdmin()
    expect(rows.find((r) => r.id === brandFull)?.productCount).toBe(2)
    expect(rows.find((r) => r.id === brandEmpty)?.productCount).toBe(0)
  })
})
