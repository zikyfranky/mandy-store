// tests/catalog/queries.test.ts
// Covers: CATA-01..03 — getCatalog() filtering, search, sort, pagination; getProduct()
// Integration tests: skip if DATABASE_URL is not set.
// Real assertions are added in Plan 02-02 (getCatalog) and Plan 02-03 (getProduct).

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateCatalogTables } from "../helpers/db"

// server-only is a no-op in Node test environment
vi.mock("server-only", () => ({}))

const skip = !hasDatabase

describe("catalog queries (Wave 0 scaffold)", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateCatalogTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)("truncateCatalogTables runs cleanly before each test", async () => {
    // If we get here without throwing, truncation works correctly.
    // This is the FK-safe order guard: variantOptionValues → variants → ...
    expect(true).toBe(true)
  })

  // TODO(Plan 02): assert getCatalog filters/search/sort
  // These will be filled in once src/lib/catalog/queries.ts is created in Plan 02-02.
  // Example stubs to implement:
  //
  // it.skipIf(skip)("getCatalog returns products filtered by category slug", async () => {
  //   const { getCatalog } = await import("@/lib/catalog/queries")
  //   // ... seed fixture products, call getCatalog({ categorySlug: "phones" }), assert length
  // })
  //
  // it.skipIf(skip)("getCatalog search by name (ILIKE) returns matching products", async () => {
  //   // ... assert ilike('Galaxy') returns only Samsung products
  // })
  //
  // it.skipIf(skip)("getCatalog sort price_asc returns products ordered by min variant price", async () => {
  //   // ... assert ascending min priceKobo order
  // })
  //
  // it.skipIf(skip)("getCatalog brand filter returns only matching brand products", async () => {
  //   // ... assert eq(brandId) filter
  // })
})
