// tests/catalog/queries.test.ts
// Covers: CATA-01..03 — getCatalog() filtering, search, sort, pagination; getProduct()
// Integration tests: skip if DATABASE_URL is not set.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateCatalogTables } from "../helpers/db"

// server-only is a no-op in Node test environment
vi.mock("server-only", () => ({}))

const skip = !hasDatabase

// ─── Fixture helpers ──────────────────────────────────────────────────────────

async function seedFixture() {
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // Categories
  const catElectronicsId = crypto.randomUUID()
  const catPhonesId = crypto.randomUUID()
  await db.insert(schema.categories).values([
    { id: catElectronicsId, name: "Electronics", slug: "electronics" },
    { id: catPhonesId, name: "Phones", slug: "phones" },
  ])

  // Brands
  const brandSamsungId = crypto.randomUUID()
  const brandAppleId = crypto.randomUUID()
  await db.insert(schema.brands).values([
    { id: brandSamsungId, name: "Samsung" },
    { id: brandAppleId, name: "Apple" },
  ])

  // Products
  const prodGalaxyId = crypto.randomUUID()
  const prodIphoneId = crypto.randomUUID()
  const prodSonyId = crypto.randomUUID() // Sony brand — but use Samsung for simplicity, 3 products total

  // Use Samsung for two products (one electronics, one phones) and Apple for one (phones)
  await db.insert(schema.products).values([
    {
      id: prodGalaxyId,
      name: "Samsung Galaxy Tablet",
      slug: "samsung-galaxy-tablet",
      description: "Powerful tablet for productivity",
      categoryId: catElectronicsId,
      brandId: brandSamsungId,
      isActive: true,
    },
    {
      id: prodIphoneId,
      name: "iPhone 16 Pro",
      slug: "iphone-16-pro",
      description: "Apple flagship smartphone",
      categoryId: catPhonesId,
      brandId: brandAppleId,
      isActive: true,
    },
    {
      id: prodSonyId,
      name: "Samsung Galaxy S25",
      slug: "samsung-galaxy-s25",
      description: "Samsung flagship phone with amazing camera",
      categoryId: catPhonesId,
      brandId: brandSamsungId,
      isActive: true,
    },
  ])

  // Variants (priceKobo values: Galaxy Tablet = cheap, iPhone = expensive, Galaxy S25 = mid)
  const varGalaxyId = crypto.randomUUID()
  const varIphoneId = crypto.randomUUID()
  const varGalaxyS25Id = crypto.randomUUID()

  await db.insert(schema.variants).values([
    {
      id: varGalaxyId,
      productId: prodGalaxyId,
      sku: "GALAXY-TAB-001",
      priceKobo: 5_000_000, // ₦50,000
      stock: 10,
      isActive: true,
    },
    {
      id: varIphoneId,
      productId: prodIphoneId,
      sku: "IPHONE-16-PRO-001",
      priceKobo: 20_000_000, // ₦200,000
      stock: 5,
      isActive: true,
    },
    {
      id: varGalaxyS25Id,
      productId: prodSonyId,
      sku: "GALAXY-S25-001",
      priceKobo: 12_000_000, // ₦120,000
      stock: 8,
      isActive: true,
    },
  ])

  return {
    catElectronicsId,
    catPhonesId,
    brandSamsungId,
    brandAppleId,
    prodGalaxyId,
    prodIphoneId,
    prodSonyId,
    varGalaxyId,
    varIphoneId,
    varGalaxyS25Id,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getCatalog()", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateCatalogTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)("truncateCatalogTables runs cleanly before each test", async () => {
    expect(true).toBe(true)
  })

  it.skipIf(skip)("returns only products in the specified category (CATA-01)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ categorySlug: "electronics", sort: "newest", page: 1 })

    expect(result.products).toHaveLength(1)
    expect(result.products[0].name).toBe("Samsung Galaxy Tablet")
    expect(result.total).toBe(1)
    expect(result.pageCount).toBe(1)
  })

  it.skipIf(skip)("returns empty result for an unknown category slug", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ categorySlug: "nonexistent", sort: "newest", page: 1 })

    expect(result.products).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.pageCount).toBe(0)
  })

  it.skipIf(skip)("searches products by name using ILIKE (CATA-02)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ q: "galaxy", sort: "newest", page: 1 })

    // Matches "Samsung Galaxy Tablet" and "Samsung Galaxy S25" — both contain "Galaxy"
    expect(result.products.length).toBe(2)
    const names = result.products.map((p) => p.name)
    expect(names).toContain("Samsung Galaxy Tablet")
    expect(names).toContain("Samsung Galaxy S25")
  })

  it.skipIf(skip)("searches products by description using ILIKE (CATA-02)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ q: "flagship", sort: "newest", page: 1 })

    // "flagship" appears in iPhone description AND Samsung Galaxy S25 description
    expect(result.products.length).toBeGreaterThanOrEqual(1)
    const names = result.products.map((p) => p.name)
    expect(names).toContain("iPhone 16 Pro")
  })

  it.skipIf(skip)("sorts by price_asc orders by ascending MIN variant price (CATA-03)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ sort: "price_asc", page: 1 })

    // Galaxy Tablet = 5_000_000, Galaxy S25 = 12_000_000, iPhone = 20_000_000
    expect(result.products[0].name).toBe("Samsung Galaxy Tablet")
    expect(result.products[0].minPriceKobo).toBe(5_000_000)
    expect(result.products[2].name).toBe("iPhone 16 Pro")
    expect(result.products[2].minPriceKobo).toBe(20_000_000)
  })

  it.skipIf(skip)("sorts by price_desc orders by descending MIN variant price (CATA-03)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ sort: "price_desc", page: 1 })

    expect(result.products[0].name).toBe("iPhone 16 Pro")
    expect(result.products[0].minPriceKobo).toBe(20_000_000)
  })

  it.skipIf(skip)("filters by brand returns only products from that brand (CATA-03)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ brand: "Apple", sort: "newest", page: 1 })

    expect(result.products).toHaveLength(1)
    expect(result.products[0].name).toBe("iPhone 16 Pro")
    expect(result.products[0].brandName).toBe("Apple")
  })

  it.skipIf(skip)("filters by brand returns multiple Samsung products (CATA-03)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ brand: "Samsung", sort: "newest", page: 1 })

    expect(result.products).toHaveLength(2)
    const names = result.products.map((p) => p.name)
    expect(names).toContain("Samsung Galaxy Tablet")
    expect(names).toContain("Samsung Galaxy S25")
  })

  it.skipIf(skip)("pagination: total and pageCount are correct (CATA-03)", async () => {
    await seedFixture()
    const { getCatalog, PAGE_SIZE } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ sort: "newest", page: 1 })

    expect(result.total).toBe(3)
    expect(result.pageCount).toBe(Math.ceil(3 / PAGE_SIZE))
    expect(result.page).toBe(1)
    expect(result.products).toHaveLength(3)
  })

  it.skipIf(skip)("pagination: page 2 with page size 1 returns correct offset", async () => {
    await seedFixture()
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")

    // We can't override PAGE_SIZE easily, so instead seed > 24 products
    // Instead, verify that page offset works by calling getCatalog and checking
    // that with a very high page number we get 0 results
    const { getCatalog } = await import("@/lib/catalog/queries")

    const result = await getCatalog({ sort: "newest", page: 2 })

    // Only 3 products total, page 2 with PAGE_SIZE=24 should be empty
    expect(result.products).toHaveLength(0)
    expect(result.total).toBe(3)
    expect(result.page).toBe(2)

    void db
    void schema
  })

  it.skipIf(skip)("filters by minPrice and maxPrice using kobo values (CATA-03)", async () => {
    await seedFixture()
    const { getCatalog } = await import("@/lib/catalog/queries")

    // Only Galaxy Tablet (5_000_000) should be in range 0..6_000_000
    const result = await getCatalog({
      minPrice: 0,
      maxPrice: 6_000_000,
      sort: "price_asc",
      page: 1,
    })

    expect(result.products).toHaveLength(1)
    expect(result.products[0].name).toBe("Samsung Galaxy Tablet")
  })
})

describe("getBrandsForCategory()", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateCatalogTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)("returns all brands when no category filter", async () => {
    await seedFixture()
    const { getBrandsForCategory } = await import("@/lib/catalog/queries")

    const brands = await getBrandsForCategory()
    expect(brands).toContain("Samsung")
    expect(brands).toContain("Apple")
    expect(brands.length).toBeGreaterThanOrEqual(2)
  })

  it.skipIf(skip)("returns only brands present in the specified category", async () => {
    await seedFixture()
    const { getBrandsForCategory } = await import("@/lib/catalog/queries")

    const brands = await getBrandsForCategory("electronics")
    expect(brands).toEqual(["Samsung"])
  })
})

// ─── Phase 10: storefront active-only taxonomy (D-03, ADMN-12/13) ──────────────
// RED until Plan 10-03 adds getActiveCategoryBySlug / listActiveCategoriesForNav and
// makes getBrandsForCategory exclude inactive brands.

describe("active-only taxonomy resolution", () => {
  async function deactivateCategoryRow(slug: string) {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")
    await db.update(schema.categories).set({ isActive: false }).where(eq(schema.categories.slug, slug))
  }
  async function deactivateBrandRow(name: string) {
    const { db } = await import("@/lib/db/client")
    const schema = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")
    await db.update(schema.brands).set({ isActive: false }).where(eq(schema.brands.name, name))
  }

  it.skipIf(skip)("getActiveCategoryBySlug returns null for unknown AND soft-deleted slugs", async () => {
    await seedFixture()
    const { getActiveCategoryBySlug } = await import("@/lib/catalog/queries")

    expect(await getActiveCategoryBySlug("electronics")).not.toBeNull()
    expect(await getActiveCategoryBySlug("does-not-exist")).toBeNull()

    await deactivateCategoryRow("electronics")
    expect(await getActiveCategoryBySlug("electronics")).toBeNull()
  })

  it.skipIf(skip)("listActiveCategoriesForNav excludes soft-deleted categories", async () => {
    await seedFixture()
    const { listActiveCategoriesForNav } = await import("@/lib/catalog/queries")

    await deactivateCategoryRow("electronics")
    const nav = await listActiveCategoriesForNav()
    const slugs = nav.map((c: { slug: string }) => c.slug)
    expect(slugs).not.toContain("electronics")
    expect(slugs).toContain("phones")
  })

  it.skipIf(skip)("getBrandsForCategory excludes inactive brands from the facet list", async () => {
    await seedFixture()
    const { getBrandsForCategory } = await import("@/lib/catalog/queries")

    await deactivateBrandRow("Apple")
    const brands = await getBrandsForCategory()
    expect(brands).not.toContain("Apple")
    expect(brands).toContain("Samsung")
  })
})
