import "server-only"
// src/lib/catalog/queries.ts
// Catalog data access layer — server-only (never imported in client bundles).
// T-02-04: ALL filters use Drizzle parameterized operators — never string-concat into SQL.

import { db } from "@/lib/db/client"
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
import {
  and,
  or,
  ilike,
  eq,
  gte,
  lte,
  asc,
  desc,
  sql,
  count,
} from "drizzle-orm"
import type { SortKey } from "@/lib/validation/catalog-params"

export const PAGE_SIZE = 24

// ─── Types ────────────────────────────────────────────────────────────────────

export type CatalogCard = {
  id: string
  slug: string
  name: string
  brandName: string
  imageUrl: string | null
  imageAlt: string | null
  minPriceKobo: number
}

export type CatalogResult = {
  products: CatalogCard[]
  total: number
  page: number
  pageCount: number
}

// ─── getCatalog ───────────────────────────────────────────────────────────────

export async function getCatalog(opts: {
  categorySlug?: string
  q?: string
  brand?: string
  minPrice?: number
  maxPrice?: number
  sort: SortKey
  page: number
}): Promise<CatalogResult> {
  const { categorySlug, q, brand, minPrice, maxPrice, sort, page } = opts

  // Resolve category if a slug was provided
  let categoryId: string | undefined
  if (categorySlug) {
    const cat = await db.query.categories.findFirst({
      where: eq(categories.slug, categorySlug),
    })
    if (!cat) {
      // Category not found — return empty result (caller may call notFound())
      return { products: [], total: 0, page, pageCount: 0 }
    }
    categoryId = cat.id
  }

  // Build the min-price subquery: MIN(price_kobo) per product_id
  // This is used for both price-range filtering and price sorting (RESEARCH Pitfall 4)
  const minPriceSq = db
    .select({
      productId: variants.productId,
      minPrice: sql<number>`MIN(${variants.priceKobo})`.as("min_price"),
    })
    .from(variants)
    .where(eq(variants.isActive, true))
    .groupBy(variants.productId)
    .as("min_price_sq")

  // Build WHERE filters (all parameterized — T-02-04)
  const filters: ReturnType<typeof eq>[] = [eq(products.isActive, true)]

  if (categoryId) {
    filters.push(eq(products.categoryId, categoryId))
  }

  if (q) {
    // T-02-04: ilike is parameterized — the `%${q}%` interpolation goes into a bind parameter, NOT raw SQL
    filters.push(
      or(
        ilike(products.name, `%${q}%`),
        ilike(products.description, `%${q}%`)
      ) as ReturnType<typeof eq>
    )
  }

  if (brand) {
    // Join to brands table — parameterized eq
    filters.push(eq(brands.name, brand) as ReturnType<typeof eq>)
  }

  // Price filter: apply against min variant price (RESEARCH Pitfall 4)
  if (minPrice !== undefined) {
    filters.push(gte(minPriceSq.minPrice, minPrice) as ReturnType<typeof eq>)
  }
  if (maxPrice !== undefined) {
    filters.push(lte(minPriceSq.minPrice, maxPrice) as ReturnType<typeof eq>)
  }

  // Sort map: price sorts use min variant price subquery
  const sortExpr = {
    price_asc: asc(minPriceSq.minPrice),
    price_desc: desc(minPriceSq.minPrice),
    newest: desc(products.createdAt),
    name_asc: asc(products.name),
  }[sort]

  // Primary image subquery: first image by position (for the card)
  const primaryImageSq = db
    .select({
      productId: productImages.productId,
      url: productImages.url,
      altText: productImages.altText,
    })
    .from(productImages)
    .orderBy(asc(productImages.position))
    .as("primary_img_sq")

  // Base query joining products → brands → minPriceSq → primaryImageSq
  const baseQuery = db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      brandName: brands.name,
      imageUrl: primaryImageSq.url,
      imageAlt: primaryImageSq.altText,
      minPriceKobo: minPriceSq.minPrice,
    })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(minPriceSq, eq(products.id, minPriceSq.productId))
    .leftJoin(primaryImageSq, eq(products.id, primaryImageSq.productId))
    .where(and(...filters))

  // Count for pagination
  const countQuery = db
    .select({ total: count() })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(minPriceSq, eq(products.id, minPriceSq.productId))
    .where(and(...filters))

  const [rows, countResult] = await Promise.all([
    baseQuery
      .orderBy(sortExpr)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    countQuery,
  ])

  const total = countResult[0]?.total ?? 0
  const pageCount = Math.ceil(total / PAGE_SIZE)

  return {
    products: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      brandName: r.brandName,
      imageUrl: r.imageUrl ?? null,
      imageAlt: r.imageAlt ?? null,
      minPriceKobo: r.minPriceKobo,
    })),
    total,
    page,
    pageCount,
  }
}

// ─── getProduct ───────────────────────────────────────────────────────────────
// Full relation tree for the PDP (Plan 03). Returns null if not found.

export async function getProduct(slug: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.slug, slug),
    with: {
      brand: true,
      category: true,
      images: { orderBy: (i, { asc: a }) => [a(i.position)] },
      options: {
        orderBy: (o, { asc: a }) => [a(o.position)],
        with: {
          values: { orderBy: (v, { asc: a }) => [a(v.position)] },
        },
      },
      variants: {
        where: (v, { eq: e }) => e(v.isActive, true),
        with: {
          optionValues: {
            with: {
              optionValue: {
                with: { option: true },
              },
            },
          },
        },
      },
    },
  })

  return product ?? null
}

// ─── getBrandsForCategory ─────────────────────────────────────────────────────
// Distinct brand names available for the sidebar facet list.
// If categorySlug is provided, restrict to brands present in that category.

export async function getBrandsForCategory(
  categorySlug?: string
): Promise<string[]> {
  let categoryId: string | undefined
  if (categorySlug) {
    const cat = await db.query.categories.findFirst({
      where: eq(categories.slug, categorySlug),
    })
    categoryId = cat?.id
  }

  const filters = [eq(products.isActive, true)]
  if (categoryId) {
    filters.push(eq(products.categoryId, categoryId))
  }

  const rows = await db
    .selectDistinct({ brandName: brands.name })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .where(and(...filters))
    .orderBy(asc(brands.name))

  return rows.map((r) => r.brandName)
}

// ─── Re-export types for Plan 03 convenience ──────────────────────────────────

export type GetProductResult = Awaited<ReturnType<typeof getProduct>>
export type { SortKey }

// Re-export unused imports to satisfy TS (used as type references only)
void productOptions
void optionValues
void variantOptionValues
