// tests/catalog/schema.test.ts
// Covers: CATA-01..04 foundation — table exports, column presence, seed round-trip
// Static tests: run without DATABASE_URL (no DB needed)
// Integration tests: skip if DATABASE_URL is not set

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  brands,
  categories,
  products,
  productImages,
  productOptions,
  optionValues,
  variants,
  variantOptionValues,
} from "@/lib/db/schema"
import { hasDatabase, truncateCatalogTables } from "../helpers/db"

// ─── Static schema tests (always run, no DB needed) ──────────────────────────

describe("catalog table exports", () => {
  it("exports brands table", () => {
    expect(brands).toBeDefined()
  })

  it("exports categories table", () => {
    expect(categories).toBeDefined()
  })

  it("exports products table", () => {
    expect(products).toBeDefined()
  })

  it("exports productImages table", () => {
    expect(productImages).toBeDefined()
  })

  it("exports productOptions table", () => {
    expect(productOptions).toBeDefined()
  })

  it("exports optionValues table", () => {
    expect(optionValues).toBeDefined()
  })

  it("exports variants table", () => {
    expect(variants).toBeDefined()
  })

  it("exports variantOptionValues table", () => {
    expect(variantOptionValues).toBeDefined()
  })
})

describe("variants table columns", () => {
  it("has priceKobo column (D-04 NGN integer minor units)", () => {
    // Drizzle stores column definitions on the table object
    const cols = variants as unknown as Record<string, { name?: string }>
    const colNames = Object.entries(cols)
      .filter(([, v]) => v && typeof v === "object" && "name" in v)
      .map(([, v]) => (v as { name: string }).name)
    expect(colNames).toContain("price_kobo")
  })

  it("has stock column (Phase 4 atomic decrement target)", () => {
    const cols = variants as unknown as Record<string, { name?: string }>
    const colNames = Object.entries(cols)
      .filter(([, v]) => v && typeof v === "object" && "name" in v)
      .map(([, v]) => (v as { name: string }).name)
    expect(colNames).toContain("stock")
  })
})

describe("products table columns", () => {
  it("has slug column (D-08 canonical URL key)", () => {
    const cols = products as unknown as Record<string, { name?: string }>
    const colNames = Object.entries(cols)
      .filter(([, v]) => v && typeof v === "object" && "name" in v)
      .map(([, v]) => (v as { name: string }).name)
    expect(colNames).toContain("slug")
  })
})

// ─── Integration tests (require DATABASE_URL — skipped without DB) ────────────

describe.skipIf(!hasDatabase)("catalog seed round-trip (integration)", () => {
  beforeEach(async () => {
    await truncateCatalogTables()
  })

  afterEach(async () => {
    await truncateCatalogTables()
  })

  it("can insert and read back a category", async () => {
    const { getDb } = await import("../helpers/db")
    const db = await getDb()

    const categoryId = crypto.randomUUID()
    await db.insert(categories).values({
      id: categoryId,
      name: "Test Category",
      slug: "test-category",
    })

    const found = await db.query.categories.findFirst({
      where: (t, { eq }) => eq(t.id, categoryId),
    })
    expect(found).toBeDefined()
    expect(found?.name).toBe("Test Category")
    expect(found?.slug).toBe("test-category")
  })

  it("can insert a brand, product, variant, and read back with relations", async () => {
    const { getDb } = await import("../helpers/db")
    const db = await getDb()

    const brandId = crypto.randomUUID()
    const categoryId = crypto.randomUUID()
    const productId = crypto.randomUUID()
    const optionId = crypto.randomUUID()
    const optionValueId = crypto.randomUUID()
    const variantId = crypto.randomUUID()

    await db.insert(brands).values({ id: brandId, name: "Test Brand" })
    await db.insert(categories).values({ id: categoryId, name: "Test Category", slug: "test-category" })
    await db.insert(products).values({
      id: productId, name: "Test Product", slug: "test-product",
      categoryId, brandId, isActive: true,
    })
    await db.insert(productOptions).values({ id: optionId, productId, name: "Color", position: 0 })
    await db.insert(optionValues).values({ id: optionValueId, productOptionId: optionId, value: "Black", position: 0 })
    await db.insert(variants).values({
      id: variantId, productId, sku: "TEST-SKU-001",
      priceKobo: 5000000, stock: 10, isActive: true,
    })
    await db.insert(variantOptionValues).values({ variantId, optionValueId })

    const found = await db.query.products.findFirst({
      where: (t, { eq }) => eq(t.id, productId),
      with: { brand: true, category: true, variants: true, options: { with: { values: true } } },
    })

    expect(found).toBeDefined()
    expect(found?.name).toBe("Test Product")
    expect(found?.brand?.name).toBe("Test Brand")
    expect(found?.category?.slug).toBe("test-category")
    expect(found?.variants).toHaveLength(1)
    expect(found?.variants[0]?.priceKobo).toBe(5000000)
    expect(found?.variants[0]?.stock).toBe(10)
    expect(found?.options).toHaveLength(1)
    expect(found?.options[0]?.values).toHaveLength(1)
  })

  it("enforces slug uniqueness — second insert with same slug throws", async () => {
    const { getDb } = await import("../helpers/db")
    const db = await getDb()

    const brandId = crypto.randomUUID()
    const categoryId = crypto.randomUUID()
    await db.insert(brands).values({ id: brandId, name: "Brand A" })
    await db.insert(categories).values({ id: categoryId, name: "Cat A", slug: "cat-a" })
    await db.insert(products).values({
      id: crypto.randomUUID(), name: "Product A", slug: "same-slug",
      categoryId, brandId, isActive: true,
    })

    await expect(
      db.insert(products).values({
        id: crypto.randomUUID(), name: "Product B", slug: "same-slug",
        categoryId, brandId, isActive: true,
      })
    ).rejects.toThrow()
  })
})
