# Phase 2: Product Catalog - Research

**Researched:** 2026-06-11
**Domain:** Next.js 16 App Router · Drizzle ORM + Neon Postgres · Tailwind v4 · SEO/structured data
**Confidence:** HIGH (core stack verified against official docs; caching APIs confirmed against Next.js 16.2.9 docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Flexible per-product options — named option types (Color, Storage, Strap…), variants are combinations each carrying their own SKU, price, stock. One model across all product types.
- **D-02:** Brand is its own table. Referenced by products.
- **D-03:** Categories are a seeded table — Electronics, Watches, Phones. Not a code enum.
- **D-04:** Prices stored as NGN integer minor units (kobo). Always read from DB, never trusted from client.
- **D-05:** Seed script populates a realistic catalog (multiple products, all 3 categories, brands, variants with price + stock, image URLs). Modeled on `src/scripts/seed.ts`.
- **D-06:** Dedicated category pages (`/electronics`, `/watches`, `/phones`) + all-products page.
- **D-07:** Home page (`/`) becomes the storefront landing (replaces Next.js scaffold default).
- **D-08:** Slug-based product URLs `/products/<slug>` — the canonical URL.
- **D-09:** Pagination via `?page=` query param — server-rendered.
- **D-10:** Global header search bar — `?q=` query param.
- **D-11:** Sidebar facets on desktop, collapsing drawer/sheet on mobile.
- **D-12:** Sort: Price ↑, Price ↓, Newest, Name A–Z.
- **D-13:** Friendly no-results state — "no products match" with "Clear filters / Browse all" CTA.
- **D-14:** All listing state (search, filter, sort, page) in URL query params — SSR-rendered.
- **D-15:** Option buttons/swatches for variant selection — live price + stock update.
- **D-16:** Out-of-stock combinations shown but disabled.
- **D-17:** Tiered stock indicator — "In stock" / "Only N left" (below threshold) / "Out of stock".
- **D-18:** Add-to-cart CTA rendered but action is a no-op stub (Phase 3 wires it).
- **D-19:** Product gallery with variant image swap.

### Claude's Discretion

- Exact slug-generation + collision strategy; price storage column type (NGN-minor-units intent locked, representation not).
- Low-stock threshold value for D-17; default sort order for D-12.
- Caching mechanism for content-vs-stock/price split — intent (fresh stock/price, cacheable content) is locked; Next.js mechanism is researcher/planner territory.
- Product structured-data (JSON-LD) and canonical `<link>` implementation — required by SC5, shape is planner/researcher territory.
- Grid layout specifics (columns, breakpoints), typography, loading skeletons.

### Deferred Ideas (OUT OF SCOPE)

- Add-to-cart behavior (CTA stub only, Phase 3)
- Admin product/variant CRUD + image uploads (Phase 5)
- Product reviews/ratings, wishlists, discount codes (v2)
- Brand landing pages (brand table supports it, not in this phase)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CATA-01 | User can browse products by category (Electronics, Watches, Phones) | Category table + dedicated routes + `[categorySlug]/page.tsx` using Server Components with async searchParams |
| CATA-02 | User can search products by name or description | `ilike()` operator in Drizzle for small catalog; `?q=` URL param; SSR-rendered results page |
| CATA-03 | User can sort by price and filter by brand/price range | Drizzle dynamic `and()/or()` WHERE + `orderBy(asc/desc)`; all state from URL searchParams |
| CATA-04 | User can select product variants with live price + stock update | Client component: all variant data passed as props; useState for selected options resolves to variant; no re-fetch needed |
</phase_requirements>

---

## Summary

Phase 2 builds the first publicly shippable piece of the Mandy Store. It requires three distinct work streams to converge: (1) extending the Drizzle schema with 7 new tables that implement a flexible variant model, (2) building SSR catalog pages with URL-driven filtering/search/pagination, and (3) creating an interactive product detail page where client-side state drives live variant selection.

The two technically riskiest areas are the **split caching model** (product content cached, stock/price always fresh) and the **flexible variant join table** (products → product_options → option_values, and variants → variant_option_values junction). Both are well-understood patterns with clear Drizzle/Next.js 16 implementations; research below provides concrete schemas and code patterns for both.

Next.js 16 introduces a new **Cache Components** model (`use cache` directive + `cacheLife`/`cacheTag` functions) that replaces the implicit per-fetch caching from Next.js 14/15. Enabling it requires a single `cacheComponents: true` flag in `next.config.ts`. The split caching pattern (cache product content, keep stock/price dynamic) is implemented by putting product description/metadata in a `'use cache'` component and wrapping the stock/price component in `<Suspense>` without caching.

**Primary recommendation:** Schema first (Wave 1: tables + drizzle-kit push + seed script), then listing pages (Wave 2: category/search/filter/sort), then PDP (Wave 3: variant selector + gallery), then SEO layer (JSON-LD + canonical, can fold into Wave 2 or 3).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Product/category/brand/variant schema | Database (Neon Postgres) | — | Drizzle schema lives in `src/lib/db/schema.ts`; push with drizzle-kit |
| Catalog listing pages (browse/search/filter) | Next.js Server Component | — | SSR from URL searchParams per D-14; no client state needed for listing data |
| Variant selection + live price/stock | Browser/Client Component | Next.js Server (initial data) | `useState` resolves variant from all-variants prop; no refetch (D-15 pattern) |
| Product image gallery | Browser/Client Component | — | Image swap on variant select requires client state |
| Add-to-cart CTA (stub) | Browser/Client Component | — | Button rendered client-side; action is a no-op this phase |
| SEO: canonical URL, JSON-LD | Next.js Server Component | — | `generateMetadata` + inline `<script>` tag in PDP Server Component |
| Caching: product content | Next.js Server Component (`use cache`) | — | Product description/name/category are stable; cache with `cacheLife('hours')` |
| Caching: stock/price data | Next.js Server Component (dynamic) | — | Fresh per request; do NOT use `use cache`; wrap in `<Suspense>` |
| Seed script | Node.js script (tsx) | — | Runs standalone via `npm run seed`; mirrors existing `seed.ts` pattern |
| Image optimization | Next.js (`next/image`) | — | `remotePatterns` in `next.config.ts` for seeded external URLs |
| URL-driven state (search/filter/sort/page) | Next.js Server Component | — | Read from async `searchParams`; matches Phase 1 verify-email page pattern |

---

## Standard Stack

### Core (already installed)

| Library | Installed Version | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `drizzle-orm` | 0.45.2 [VERIFIED: npm] | ORM + schema + query | Already in project; pg-core supports all needed column types |
| `drizzle-kit` | 0.31.10 [VERIFIED: npm] | Schema push/migration | Already used in Phase 1; `npm run db:push` established |
| `next` | 16.2.7 [VERIFIED: package.json] | App Router SSR + caching | Project constraint; `use cache` available via `cacheComponents: true` |
| `zod` | 4.4.3 [VERIFIED: package.json] | searchParams parsing/validation | Already used in auth actions; parse URL params before DB queries |
| `tailwindcss` | v4 [VERIFIED: package.json] | Styling | Project-wide convention; Tailwind v4 utility classes |

### Supporting (need install)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `slugify` | 1.6.9 [VERIFIED: npm registry] | Slug generation from product name | Seed script only; deterministic URL generation from titles |

> **Note:** `slug` (v11) is also available but `slugify` is lighter and sufficient for seed-time slug generation from English product names. [ASSUMED: slugify produces acceptable slugs for electronics/watch/phone names without special characters]

### No New Framework Dependencies

All catalog UI can be built with Tailwind v4 + React/Next.js primitives already installed. No component library (shadcn, radix, etc.) is required — swatches/pills are custom-styled buttons. The add-to-cart CTA is a stub button, so no cart state management library is needed this phase.

**Installation (seed script only):**
```bash
npm install slugify
```

---

## Architecture Patterns

### System Architecture Diagram

```
Browser Request: /electronics?brand=Samsung&minPrice=10000&sort=price_asc&page=2
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js proxy.ts (src/proxy.ts)                                 │
│  Catalog routes match no-auth pattern — passes through           │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Server Component: CategoryPage (src/app/[categorySlug]/page.tsx)│
│  1. await searchParams (async, Next.js 16 required)              │
│  2. Parse + validate with Zod (brand, minPrice, sort, page)      │
│  3. Build Drizzle query: ilike / eq / between / orderBy / limit  │
│  4. db.query.products.findMany({ with: { brand, variants... }})  │
└──────────────────────────────┬──────────────────────────────────┘
         │                     │
         ▼                     ▼
┌─────────────────┐  ┌────────────────────────────────────────────┐
│ 'use cache'      │  │ <Suspense> boundary (no cache)              │
│ ProductContent   │  │ StockPriceBlock                             │
│ - name, desc,   │  │ - reads stock + price_kobo from variants   │
│   images, brand │  │ - always fresh per request                  │
│ cacheLife('hours')│  │ - passes all variant data to client comp  │
└─────────────────┘  └────────────────────────────────────────────┘
                               │
                               ▼
         ┌────────────────────────────────────────────────────────┐
         │ Client Component: VariantSelector (src/components/...)  │
         │ Props: variants[] with priceKobo, stock, optionValues   │
         │ State: { [optionType]: selectedValue }                  │
         │ Derived: resolvedVariant = variants.find(match)        │
         │ Renders: swatches/pills, live price, stock indicator   │
         └─────────────────────────────┬──────────────────────────┘
                                       │
                               ┌───────▼──────────┐
                               │ Neon Postgres     │
                               │ (drizzle-orm/     │
                               │  neon-http)       │
                               └──────────────────┘
```

### Recommended Project Structure (Phase 2 additions)

```
src/
├── app/
│   ├── page.tsx                         # REPLACE: storefront landing (D-07)
│   ├── [categorySlug]/                  # CATA-01: /electronics /watches /phones
│   │   └── page.tsx                     # Category listing page (Server Component)
│   ├── products/
│   │   └── [slug]/
│   │       └── page.tsx                 # PDP (Server Component shell + Client variant)
│   ├── search/
│   │   └── page.tsx                     # Search results (D-10, CATA-02)
│   └── layout.tsx                       # UPDATE: add global header w/ search bar
├── components/
│   ├── catalog/
│   │   ├── ProductCard.tsx              # Product listing card (Server or shared)
│   │   ├── ProductGrid.tsx              # Grid layout wrapper
│   │   ├── ProductFilters.tsx           # Sidebar + mobile drawer (D-11)
│   │   ├── SortSelect.tsx               # Sort dropdown (D-12)
│   │   ├── Pagination.tsx               # ?page= pagination (D-09)
│   │   ├── SearchBar.tsx                # Header search bar (D-10, "use client")
│   │   └── EmptyState.tsx               # No-results state (D-13)
│   └── product/
│       ├── VariantSelector.tsx          # "use client" — swatches + live price (D-15–D-18)
│       ├── ProductGallery.tsx           # "use client" — image gallery + swap (D-19)
│       └── StockIndicator.tsx           # Tier display (D-17)
├── lib/
│   ├── db/
│   │   └── schema.ts                    # UPDATE: add catalog tables
│   ├── catalog/
│   │   ├── queries.ts                   # Drizzle query builders (getCatalog, getProduct)
│   │   └── format.ts                    # formatPrice (kobo → ₦12,500.00)
│   └── utils/
│       └── slug.ts                      # slugify wrapper + collision helper
└── scripts/
    └── seed-catalog.ts                  # NEW: catalog seed (modeled on seed.ts)
```

> Category pages use a dynamic segment `[categorySlug]` with `generateStaticParams` for `/electronics`, `/watches`, `/phones`. All other paths in that segment should return `notFound()`.

---

### Pattern 1: Drizzle Schema — Flexible Variant Model

**What:** 7 new tables extending the existing schema. The key insight is that a variant is a unique combination of option values, linked via a junction table.

**Relationship:** `products` → `product_options` (1:M) → `option_values` (1:M per option). `variants` FK to `products`. `variant_option_values` is the M:M junction between `variants` and `option_values`.

```typescript
// Source: Drizzle ORM schema docs + industry-standard ecommerce variant pattern
// [CITED: orm.drizzle.team/docs/sql-schema-declaration]

import {
  pgTable, text, integer, boolean, timestamp,
  primaryKey, unique, index
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

// ─── Brands ──────────────────────────────────────────────────────────────────
// D-02: brand as its own table
export const brands = pgTable("brand", {
  id:        text("id").primaryKey(),              // crypto.randomUUID()
  name:      text("name").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})

// ─── Categories ──────────────────────────────────────────────────────────────
// D-03: seeded table (Electronics, Watches, Phones) — NOT a pgEnum
export const categories = pgTable("category", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull().unique(),
  slug:      text("slug").notNull().unique(),       // "electronics", "watches", "phones"
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})

// ─── Products ────────────────────────────────────────────────────────────────
export const products = pgTable("product", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),     // D-08: canonical URL key
  description: text("description"),
  categoryId:  text("category_id").notNull().references(() => categories.id),
  brandId:     text("brand_id").notNull().references(() => brands.id),
  isActive:    boolean("is_active").default(true).notNull(),
  createdAt:   timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("product_category_idx").on(table.categoryId),
  index("product_brand_idx").on(table.brandId),
  index("product_slug_idx").on(table.slug),
])

// ─── Product Images ───────────────────────────────────────────────────────────
// Phase 5 will add Vercel Blob upload; now just URL strings
export const productImages = pgTable("product_image", {
  id:         text("id").primaryKey(),
  productId:  text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url:        text("url").notNull(),               // external URL for seed; Vercel Blob in Phase 5
  altText:    text("alt_text"),
  position:   integer("position").default(0).notNull(), // display order
  isPrimary:  boolean("is_primary").default(false).notNull(),
})

// ─── Product Options ─────────────────────────────────────────────────────────
// D-01: each product defines its own option types ("Color", "Storage", "Strap")
export const productOptions = pgTable("product_option", {
  id:        text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),               // e.g. "Color", "Storage"
  position:  integer("position").default(0).notNull(),
}, (table) => [
  unique("product_option_name_unique").on(table.productId, table.name),
])

// ─── Option Values ────────────────────────────────────────────────────────────
// e.g. option "Color" has values "Black", "Silver", "Gold"
export const optionValues = pgTable("option_value", {
  id:             text("id").primaryKey(),
  productOptionId: text("product_option_id").notNull().references(() => productOptions.id, { onDelete: "cascade" }),
  value:          text("value").notNull(),          // "Black", "256GB", "Small"
  position:       integer("position").default(0).notNull(),
}, (table) => [
  unique("option_value_unique").on(table.productOptionId, table.value),
])

// ─── Variants ────────────────────────────────────────────────────────────────
// D-01/D-04: each variant has its own SKU, price (kobo), stock
// The stock field here is what Phase 4 will atomically decrement
export const variants = pgTable("variant", {
  id:          text("id").primaryKey(),
  productId:   text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku:         text("sku").unique(),
  priceKobo:   integer("price_kobo").notNull(),     // D-04: NGN minor units
  stock:       integer("stock").default(0).notNull(), // Phase 4: UPDATE ... WHERE stock > 0 RETURNING
  imageUrl:    text("image_url"),                    // optional variant-specific image (D-19)
  isActive:    boolean("is_active").default(true).notNull(),
  createdAt:   timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("variant_product_idx").on(table.productId),
])

// ─── Variant Option Values (M:M junction) ────────────────────────────────────
// Links each variant to its option value for each option type
// A variant must have exactly one value per option of its product
export const variantOptionValues = pgTable(
  "variant_option_value",
  {
    variantId:     text("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
    optionValueId: text("option_value_id").notNull().references(() => optionValues.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.variantId, table.optionValueId] }),
  ]
)
```

**Drizzle relations (for `db.query.*` relational API):**

```typescript
// Source: [CITED: orm.drizzle.team/docs/relations]
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  brand:    one(brands,     { fields: [products.brandId],    references: [brands.id] }),
  options:  many(productOptions),
  variants: many(variants),
  images:   many(productImages),
}))

export const productOptionsRelations = relations(productOptions, ({ one, many }) => ({
  product: one(products, { fields: [productOptions.productId], references: [products.id] }),
  values:  many(optionValues),
}))

export const optionValuesRelations = relations(optionValues, ({ one, many }) => ({
  option:           one(productOptions, { fields: [optionValues.productOptionId], references: [productOptions.id] }),
  variantOptionValues: many(variantOptionValues),
}))

export const variantsRelations = relations(variants, ({ one, many }) => ({
  product:      one(products, { fields: [variants.productId], references: [products.id] }),
  optionValues: many(variantOptionValues),
}))

export const variantOptionValuesRelations = relations(variantOptionValues, ({ one }) => ({
  variant:     one(variants,     { fields: [variantOptionValues.variantId],     references: [variants.id] }),
  optionValue: one(optionValues, { fields: [variantOptionValues.optionValueId], references: [optionValues.id] }),
}))
```

---

### Pattern 2: Next.js 16 Split Caching (SC5)

**What:** Product content (name, description, images, brand) is cacheable. Stock and price change when inventory moves. Use `'use cache'` + `cacheLife('hours')` for content; stream stock/price fresh via `<Suspense>` without any cache.

**Critical:** Next.js 16 requires `cacheComponents: true` in `next.config.ts` to enable `use cache`. Without the flag, the directive is a no-op syntax error. [VERIFIED: nextjs.org/docs/app/api-reference/directives/use-cache]

**When to use:** Any page or function that reads from the DB but whose data does not change per-request (product name, description) should use `'use cache'`. Stock and price MUST NOT be cached.

```typescript
// next.config.ts — REQUIRED for use cache
// Source: [CITED: nextjs.org/blog/next-16]
const nextConfig: NextConfig = {
  cacheComponents: true,
  // ...existing config
}

// ─── PDP: split caching pattern ──────────────────────────────────────────────
// src/app/products/[slug]/page.tsx
import { Suspense } from "react"
import { cacheLife, cacheTag } from "next/cache"
import { db } from "@/lib/db/client"

// Cached: product content (name, description, images)
async function ProductContent({ slug }: { slug: string }) {
  "use cache"
  cacheLife("hours")              // revalidates in background every ~1h
  cacheTag(`product-${slug}`)     // Phase 5 admin can updateTag() on edit
  const product = await db.query.products.findFirst({
    where: (p, { eq }) => eq(p.slug, slug),
    with: { brand: true, images: true, options: { with: { values: true } } },
  })
  if (!product) notFound()
  return <ProductInfo product={product} />
}

// NOT cached: stock and price — always fresh
async function VariantStockPriceBlock({ slug }: { slug: string }) {
  // No 'use cache' — dynamic by default in Next.js 16 with cacheComponents: true
  const variants = await db.query.variants.findMany({
    where: (v, { eq }) => eq(v.productId, /* productId from slug lookup */ "..."),
    with: { optionValues: { with: { optionValue: true } } },
    columns: { id: true, priceKobo: true, stock: true, sku: true, imageUrl: true },
  })
  return <VariantSelector variants={variants} />   // Client Component
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params   // async params — Next.js 16 required
  return (
    <>
      <ProductContent slug={slug} />
      <Suspense fallback={<div>Loading availability...</div>}>
        <VariantStockPriceBlock slug={slug} />
      </Suspense>
    </>
  )
}
```

**Cache invalidation (Phase 5 hook, defined now):** When admin updates a product, call `updateTag(`product-${slug}`)` in the server action. This is the `updateTag` API (Server Actions only) from Next.js 16. [VERIFIED: nextjs.org/blog/next-16#improved-caching-apis]

---

### Pattern 3: Variant Selector (Client Component, prop-driven)

**What:** All variant data (all combinations, prices, stocks) is passed as props from the Server Component. The client resolves the selected variant via JavaScript set intersection — no server round-trips needed.

**Why prop-driven (not a fetch):** A typical product has < 50 variants (e.g., 3 colors × 4 storage = 12). Passing all variant data as props avoids a round-trip, keeps the component fast, and avoids stale data risk from a cached fetch.

```typescript
// src/components/product/VariantSelector.tsx
"use client"

type OptionValue = { id: string; value: string; optionValueId: string }
type VariantForSelector = {
  id: string
  priceKobo: number
  stock: number
  imageUrl: string | null
  sku: string | null
  // optionValues: joined shape from db.query with variantOptionValues
  optionValues: { optionValue: { id: string; value: string; productOption: { name: string } } }[]
}

type Props = {
  options: { id: string; name: string; values: { id: string; value: string }[] }[]
  variants: VariantForSelector[]
  lowStockThreshold?: number   // D-17: Claude's Discretion; recommended value: 5
}

export function VariantSelector({ options, variants, lowStockThreshold = 5 }: Props) {
  // selectedOptions: { [optionName]: optionValueId }
  const [selected, setSelected] = useState<Record<string, string>>(
    Object.fromEntries(options.map(o => [o.name, o.values[0]?.id ?? ""]))
  )

  // Resolve variant: find variant whose optionValues contain all selected values
  const resolvedVariant = variants.find(v =>
    Object.values(selected).every(valId =>
      v.optionValues.some(ov => ov.optionValue.id === valId)
    )
  )

  // D-17: tiered stock indicator
  const stockLabel = !resolvedVariant
    ? null
    : resolvedVariant.stock === 0
      ? "Out of stock"
      : resolvedVariant.stock <= lowStockThreshold
        ? `Only ${resolvedVariant.stock} left`
        : "In stock"

  // ... render swatches per option, price display, CTA stub
}
```

---

### Pattern 4: Listing Page — URL-driven SSR with Dynamic Drizzle Query

**What:** Category/search pages read all state from `await searchParams`. Build a Drizzle query with conditional `and()` clauses. All filtering/sorting/pagination happens server-side.

```typescript
// src/app/[categorySlug]/page.tsx (simplified)
// Source: [CITED: nextjs.org/docs/app/api-reference/file-conventions/page]

import { and, ilike, eq, gte, lte, asc, desc, inArray } from "drizzle-orm"
import { products, variants, brands, categories } from "@/lib/db/schema"
import { db } from "@/lib/db/client"

const PAGE_SIZE = 24

type SearchParams = Promise<{ q?: string; brand?: string; minPrice?: string; maxPrice?: string; sort?: string; page?: string }>

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categorySlug: string }>
  searchParams: SearchParams
}) {
  const { categorySlug } = await params
  const sp = await searchParams   // async searchParams — Next.js 16 required

  // Validate category (only 3 valid slugs)
  const category = await db.query.categories.findFirst({
    where: (c, { eq }) => eq(c.slug, categorySlug),
  })
  if (!category) notFound()

  // Build dynamic filters
  const page = Math.max(1, parseInt(sp.page ?? "1", 10))
  const filters = [eq(products.categoryId, category.id), eq(products.isActive, true)]
  if (sp.q)       filters.push(ilike(products.name, `%${sp.q}%`))
  if (sp.brand)   filters.push(eq(brands.name, sp.brand))

  // Sort
  const sortMap = {
    price_asc:  asc(/* min variant price — requires subquery or join */),
    price_desc: desc(/* min variant price */),
    newest:     desc(products.createdAt),
    name_asc:   asc(products.name),
  }
  const orderBy = sortMap[sp.sort as keyof typeof sortMap] ?? sortMap.newest

  const rows = await db
    .select()
    .from(products)
    .where(and(...filters))
    .orderBy(orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    // Note: price sort requires joining variants; use a subquery for min price

  // ...
}
```

> **Pitfall — price sort with variants:** Price sort on the listing page requires the minimum variant price per product. Use a Drizzle subquery or a separate `db.select()` to compute `MIN(price_kobo)` per product before sorting. Do not sort by a single variant's price. [ASSUMED]

---

### Pattern 5: SEO — Canonical URL + JSON-LD Product Structured Data (SC5)

**What:** `generateMetadata` sets `alternates.canonical`; a `<script>` tag in the Server Component body injects JSON-LD. The JSON-LD `<` → `<` replacement prevents XSS.

```typescript
// Source: [CITED: nextjs.org/docs/app/guides/json-ld]
// Source: [CITED: nextjs.org/docs/app/api-reference/functions/generate-metadata]

// In src/app/products/[slug]/page.tsx:

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)  // cached fn
  if (!product) return {}
  return {
    title: `${product.name} | Mandy Store`,
    description: product.description ?? undefined,
    alternates: {
      canonical: `https://mandy.store/products/${product.slug}`,  // D-08 canonical URL
    },
    openGraph: {
      title: product.name,
      images: product.images[0]?.url ? [{ url: product.images[0].url }] : [],
    },
  }
}

// In the page component body:
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: product.name,
  description: product.description ?? undefined,
  image: product.images.map(i => i.url),
  brand: { "@type": "Brand", name: product.brand.name },
  offers: variants.map(v => ({
    "@type": "Offer",
    priceCurrency: "NGN",
    price: (v.priceKobo / 100).toFixed(2),
    availability: v.stock > 0
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
  })),
}

return (
  <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
    {/* ... page content */}
  </>
)
```

> **metadataBase:** Set `metadataBase: new URL("https://mandy.store")` in the root layout metadata so relative canonical URLs work correctly. [ASSUMED: production domain is mandy.store — confirm with project owner or use placeholder]

---

### Pattern 6: Price Formatting (NGN / Kobo)

```typescript
// src/lib/catalog/format.ts
// D-04: prices stored as kobo (integer); displayed as ₦
export function formatNGN(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100)
  // e.g. 1500000 kobo → "₦15,000.00"
}
```

---

### Pattern 7: Slug Generation (Claude's Discretion — Seed Script)

```typescript
// src/lib/utils/slug.ts — for seed script use
import slugify from "slugify"

export function toSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, trim: true })
  // "Samsung Galaxy S25 Ultra" → "samsung-galaxy-s25-ultra"
}

// Collision handling in seed: if slug exists, append "-2", "-3", etc.
export async function uniqueSlug(name: string, exists: (s: string) => Promise<boolean>): Promise<string> {
  const base = toSlug(name)
  let slug = base
  let i = 2
  while (await exists(slug)) {
    slug = `${base}-${i++}`
  }
  return slug
}
```

---

### Pattern 8: Remote Image Patterns (next.config.ts)

Seeded products use external image URLs (e.g., Unsplash, or placeholder CDNs). `next/image` requires remote patterns to be whitelisted. [VERIFIED: nextjs.org/docs/messages/next-image-unconfigured-host]

```typescript
// next.config.ts update
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.unsplash.com" },
      // Add other seeded image hosts here
      // Phase 5: add Vercel Blob hostname when wired
    ],
  },
}
export default nextConfig
```

> **Note:** `images.domains` is deprecated in Next.js 16. Use `remotePatterns` only. [VERIFIED: nextjs.org/blog/next-16 deprecations table]

---

### Pattern 9: Seed Script (Catalog)

Model on `src/scripts/seed.ts`. Key conventions to preserve:

1. Import `@/scripts/load-env` first (populates `.env.local` for `DATABASE_URL`)
2. Idempotent — check existence before inserting (use `onConflictDoNothing()` or `findFirst` + skip)
3. Run via `npm run seed` or extend with a separate `npm run seed:catalog` script
4. Use `crypto.randomUUID()` for IDs (consistent with existing users table pattern)
5. Use `slugify` for product slugs; check collision in-loop

---

### Anti-Patterns to Avoid

- **Using `cacheComponents: true` without also enabling it in next.config.ts:** The `use cache` directive is silently ignored without the flag. [VERIFIED: official docs]
- **Caching stock/price with `use cache`:** Stock changes when orders are placed (Phase 4). Caching stock means customers see stale availability. Always fetch stock/price fresh — no `use cache` on the variants query.
- **Trusting client-submitted prices (CLAUDE.md constraint):** The PDP never accepts price from a form or query param. Price is always read from `variants.priceKobo` in the DB.
- **Synchronous params/searchParams access:** Next.js 16 enforces async params and searchParams. `const { slug } = params` will throw — must be `const { slug } = await params`. [VERIFIED: nextjs.org/blog/next-16 breaking changes]
- **Using `images.domains` in next.config.ts:** Deprecated in Next.js 16. Use `images.remotePatterns`. [VERIFIED: nextjs.org/blog/next-16 deprecations]
- **Sorting listings by a single variant price:** A product with multiple variants has a range of prices. Use `MIN(price_kobo)` via subquery for sorting, or display "From ₦X,XXX" on cards.
- **Using `<a>` for internal navigation:** Use `next/link` (`<Link>`) for all internal catalog links to preserve client-side navigation and prefetching.
- **EAV anti-pattern for options:** Do not store option types as rows in a generic `(entity_id, attribute_name, value)` table. The normalized `product_options → option_values` model is the correct approach for type safety and query performance.
- **Putting search/filter logic in a Client Component:** All listing queries run server-side from URL params. Client Components only handle UI interactions (filter drawer open/close, selecting a variant).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Price formatting (NGN/kobo → ₦) | Custom string concat | `Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" })` | Handles locale-specific grouping separators correctly |
| Slug generation | Manual `.replace()` chains | `slugify` (v1.6.9) | Handles accented chars, special symbols, edge cases |
| Search with tsvector/GIN | Full-text search setup | `ilike()` for catalog size | < 500 products; ILIKE is adequate; no indexing complexity needed |
| Variant resolution algorithm | Complex matching logic | Simple `Array.find()` with `every()` — documented in Pattern 3 | The set-intersection approach is O(variants × optionValues); entirely adequate |
| JSON-LD library | Schema helper classes | Inline object + `JSON.stringify().replace(/</g, "\\u003c")` | Official Next.js pattern; `schema-dts` optional for type-safety only |

**Key insight:** This phase is breadth-heavy (schema + listing + PDP + SEO) but none of the individual pieces are algorithmically complex. The risk is integration, not implementation — keeping the caching model consistent and not accidentally caching stock data.

---

## Common Pitfalls

### Pitfall 1: Forgetting `cacheComponents: true`

**What goes wrong:** `use cache` directives in components are silently ignored (or cause a build error in some configurations); product content is rendered dynamically on every request — no performance benefit.
**Why it happens:** `use cache` was experimental in Next.js 15 and requires an explicit opt-in flag in 16.
**How to avoid:** Add `cacheComponents: true` to `next.config.ts` as the very first task in Wave 1.
**Warning signs:** Build output shows all catalog pages as "dynamic"; no "prerendered" pages listed.

### Pitfall 2: Caching Variant Stock/Price

**What goes wrong:** Out-of-stock variants appear as "In stock" to customers; or a price change isn't reflected until cache expires.
**Why it happens:** Copying the `'use cache'` directive onto the variants data-fetch function.
**How to avoid:** The variant stock/price component must have NO `'use cache'` directive. It relies on Next.js 16's default behavior (all code is dynamic unless explicitly cached).
**Warning signs:** Stock shows as > 0 after placing an order (test after Phase 3/4 complete).

### Pitfall 3: Synchronous `params`/`searchParams` Access

**What goes wrong:** `TypeError: params.slug is not a string` or similar; page throws at runtime.
**Why it happens:** Next.js 16 breaking change — both `params` and `searchParams` are now Promises. Older tutorials show synchronous destructuring.
**How to avoid:** Always `await params` and `await searchParams` before using their values. Phase 1 already uses this pattern in the verify-email page.
**Warning signs:** TypeScript will flag `params.slug` as `Promise<string>`, not `string`.

### Pitfall 4: Price Sort Across Variants

**What goes wrong:** Products appear in wrong order by price because sort is applied to product table columns (which have no price), or to an arbitrary single variant's price.
**Why it happens:** Price is on the variant, not the product. A naive join picks a random variant's price.
**How to avoid:** Compute `MIN(price_kobo) AS min_price` per product using a Drizzle subquery or raw SQL expression, then sort by that. Display "From ₦X,XXX" on listing cards to communicate the range.
**Warning signs:** Sort order looks random after selecting "Price ↑".

### Pitfall 5: `next/image` Unconfigured Host Error

**What goes wrong:** Build or runtime error: "hostname X is not configured under images.remotePatterns".
**Why it happens:** `next/image` enforces an allowlist for remote images as a security measure.
**How to avoid:** Add all seeded image hostnames to `images.remotePatterns` in `next.config.ts` before starting the seed script.
**Warning signs:** 500 errors or broken images when a product page loads.

### Pitfall 6: Variant Data Shape Mismatch Between DB Query and Client Component

**What goes wrong:** `VariantSelector` crashes because `v.optionValues` is undefined or has unexpected nesting.
**Why it happens:** The Drizzle relational query shape for `variantOptionValues` (a junction table with `one` relations on both sides) has nested `.optionValue.productOption.name` access that must match the component's type expectations.
**How to avoid:** Define an explicit TypeScript type for the variant shape returned by the DB query (e.g., using `InferSelectModel` or explicit `type` from the query result). Pass typed data to `VariantSelector`.
**Warning signs:** TypeScript errors or runtime undefined-access errors in the variant selector.

---

## Code Examples

### Fetch Product with Full Relation Tree (for PDP)

```typescript
// Source: [CITED: orm.drizzle.team/docs/relations]
const product = await db.query.products.findFirst({
  where: (p, { eq }) => eq(p.slug, slug),
  with: {
    brand: true,
    category: true,
    images: { orderBy: (i, { asc }) => [asc(i.position)] },
    options: {
      orderBy: (o, { asc }) => [asc(o.position)],
      with: {
        values: { orderBy: (v, { asc }) => [asc(v.position)] },
      },
    },
    variants: {
      where: (v, { eq }) => eq(v.isActive, true),
      with: {
        optionValues: {
          with: { optionValue: true },
        },
      },
    },
  },
})
```

### Catalog Listing Query (with search + brand filter)

```typescript
// Source: [CITED: orm.drizzle.team/docs/operators]
import { and, ilike, eq, asc, desc } from "drizzle-orm"
import { products, categories, brands } from "@/lib/db/schema"

const filters: SQL[] = [
  eq(products.categoryId, category.id),
  eq(products.isActive, true),
]
if (q) filters.push(
  or(ilike(products.name, `%${q}%`), ilike(products.description, `%${q}%`))!
)
if (brandId) filters.push(eq(products.brandId, brandId))

const rows = await db
  .select({ /* select product columns + brand.name */ })
  .from(products)
  .leftJoin(brands, eq(products.brandId, brands.id))
  .where(and(...filters))
  .orderBy(desc(products.createdAt))  // default: newest
  .limit(24)
  .offset((page - 1) * 24)
```

### generateStaticParams for Category Routes

```typescript
// src/app/[categorySlug]/page.tsx
export async function generateStaticParams() {
  return [
    { categorySlug: "electronics" },
    { categorySlug: "watches" },
    { categorySlug: "phones" },
  ]
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| `middleware.ts` | `proxy.ts` | Next.js 16 | Project already uses `proxy.ts`; no action needed |
| Implicit per-fetch caching (Next.js 13/14) | Opt-in `use cache` directive (Next.js 16) | Next.js 16 stable | Must add `cacheComponents: true`; all data is dynamic by default |
| `experimental.dynamicIO` | `cacheComponents` config key | Next.js 16 | Flag renamed; experimental prefix removed |
| `experimental.ppr` | Removed (built into Cache Components model) | Next.js 16 | Do not reference `experimental.ppr` |
| `revalidateTag(tag)` single arg | `revalidateTag(tag, profile)` two args | Next.js 16 | Single-arg form deprecated; use `updateTag()` in Server Actions for read-your-writes |
| `images.domains` | `images.remotePatterns` | Next.js 14+ (deprecated in 16) | Use `remotePatterns` only |
| Sync `params`/`searchParams` | Async `params`/`searchParams` | Next.js 16 enforced | Must `await params`, `await searchParams` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Production domain is `mandy.store` (used in canonical URL and metadataBase) | Pattern 5 | Canonical URLs would reference wrong domain; replace placeholder before going live |
| A2 | `slugify` v1.6.9 produces acceptable slugs for English-language product names (phones, watches, electronics) | Pattern 7 | Unlikely to be wrong; slugify handles ASCII product names well |
| A3 | Low-stock threshold of 5 units is appropriate for D-17 tiered indicator | Pattern 3 | Business decision; easily changed via a single constant |
| A4 | A product has fewer than ~50 variants (e.g., 3 colors × 4 storage) making prop-driven variant resolution O(n) acceptable | Pattern 3 | If a product had 200+ variants, prop size would balloon; unlikely for phones/watches/electronics |
| A5 | Seeded image URLs will be from Unsplash or similar free CDNs (used in `remotePatterns` config) | Pattern 8 | If different CDN is used, must update `remotePatterns` before build succeeds |
| A6 | Price sort uses `MIN(price_kobo)` per product (subquery approach) | Pattern 4 | If only a single "default" variant price is needed, simpler join suffices; document the trade-off |
| A7 | `default sort order` for D-12 listings is "Newest" (most recent `createdAt` first) | Pattern 4 | User may prefer a different default; planner should confirm |

---

## Open Questions

1. **Production domain for canonical URLs / metadataBase**
   - What we know: The metadata API needs a `metadataBase` URL for canonical links to resolve correctly
   - What's unclear: The actual production domain (CLAUDE.md says Vercel deployment but no domain name given)
   - Recommendation: Use a placeholder `https://mandy-store.vercel.app` in seed/development; plan a task to set via `NEXT_PUBLIC_BASE_URL` env var at deploy time

2. **Seed image source**
   - What we know: Seed script must populate image URLs (Vercel Blob is Phase 5)
   - What's unclear: Which specific CDN or placeholder service to use for seeded images (Unsplash API requires attribution; `picsum.photos` is simpler for dev)
   - Recommendation: Use `https://picsum.photos` for seed images (no attribution required for development); plan a single `remotePatterns` entry

3. **All-products page URL**
   - What we know: D-06 requires an "all-products page" in addition to category pages
   - What's unclear: The URL — `/products`, `/shop`, or `/catalog`?
   - Recommendation: `/products` (consistent with the `/products/[slug]` PDP pattern); planner should decide and create the route

4. **Price sort implementation detail**
   - What we know: Sorting a product list by "Price ↑/↓" requires the minimum variant price per product
   - What's unclear: Whether to show only the min price on listing cards, or "From ₦X,XXX"
   - Recommendation: Show "From ₦X,XXX" (friendlier for products with variant price ranges); planner should document this in the task

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | drizzle-kit push, seed script, Next.js dev | ✓ | v22 (via .nvmrc) [ASSUMED: nvm use 20/22 as per CLAUDE.md] | — |
| Neon Postgres (DATABASE_URL) | drizzle-kit push, seed script, integration tests | ✓ | (Neon serverless) | — |
| npm | Package install | ✓ | 9.6.7 | — |
| `slugify` | Seed script | ✗ (not installed) | 1.6.9 available | — (must install) |
| Vercel Blob | Image uploads | ✗ | — | Use URL strings in seed; Vercel Blob is Phase 5 |
| External image CDN | Seeded product images | ✗ | — | Use `picsum.photos` URLs (free, no auth) |

**Missing dependencies with no fallback:** None that block execution.

**Missing dependencies with fallback:** `slugify` must be `npm install`-ed; `picsum.photos` URLs require a `remotePatterns` entry.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (already configured, `vitest.config.ts` in project root) |
| Config file | `vitest.config.ts` — loads `.env.local`, inlines next-auth, resolves `@/` alias |
| Quick run command | `npx vitest run tests/catalog/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CATA-01 | Products table seeds with Electronics/Watches/Phones categories | integration | `npx vitest run tests/catalog/schema.test.ts` | ❌ Wave 0 |
| CATA-01 | Category page returns products filtered by category slug | integration | `npx vitest run tests/catalog/queries.test.ts` | ❌ Wave 0 |
| CATA-02 | Search by name/description returns matching products (ILIKE) | integration | `npx vitest run tests/catalog/queries.test.ts` | ❌ Wave 0 |
| CATA-03 | Sort price_asc returns products in ascending price order | integration | `npx vitest run tests/catalog/queries.test.ts` | ❌ Wave 0 |
| CATA-03 | Brand filter returns only matching brand products | integration | `npx vitest run tests/catalog/queries.test.ts` | ❌ Wave 0 |
| CATA-04 | Variant resolution picks correct variant for selected options | unit | `npx vitest run tests/catalog/variant-resolver.test.ts` | ❌ Wave 0 |
| CATA-04 | Stock indicator shows "Only N left" below threshold | unit | `npx vitest run tests/catalog/variant-resolver.test.ts` | ❌ Wave 0 |
| SC5 | Schema exports: categories (3 rows), variants (stock field defined) | static/integration | `npx vitest run tests/catalog/schema.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/catalog/`
- **Per wave merge:** `npx vitest run` (all 48 existing + new catalog tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/catalog/schema.test.ts` — static schema checks (table exports, column presence) + integration (seed round-trip for categories, brands)
- [ ] `tests/catalog/queries.test.ts` — integration tests for `getCatalog()` and `getProduct()` query functions (search, filter, sort, pagination)
- [ ] `tests/catalog/variant-resolver.test.ts` — pure unit tests for variant resolution logic and stock indicator thresholds (no DB required)
- [ ] `tests/helpers/db.ts` — extend `truncateAuthTables` to also truncate catalog tables in FK-safe order

> **Truncation order (FK-safe):** `variant_option_values` → `variants` → `option_values` → `product_options` → `product_images` → `products` → `brands` → `categories` (before auth tables)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Catalog routes are public |
| V3 Session Management | No | No session for catalog browsing |
| V4 Access Control | No | No protected resources in catalog |
| V5 Input Validation | Yes | Parse searchParams with Zod before use in DB queries |
| V6 Cryptography | No | No cryptographic operations |
| V10 Malicious Code | Partial | JSON-LD XSS: `replace(/</g, "\\u003c")` prevents script injection via product names |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via searchParams | Tampering | Drizzle ORM parameterized queries (all Drizzle operators are parameterized) — never string-concat into SQL |
| XSS via product content in JSON-LD | Tampering | `JSON.stringify().replace(/</g, "\\u003c")` [VERIFIED: nextjs.org/docs/app/guides/json-ld] |
| Price tampering via URL/form | Tampering | Price is never read from URL or client input — always from `variants.priceKobo` in DB (CLAUDE.md constraint) |
| Enumeration of product slugs/IDs | Information Disclosure | No auth required for catalog (public); slugs are not sensitive; acceptable |
| Open redirect via `?q=` param | Tampering | Search param is only used as a DB filter string; never used in a redirect |

---

## Sources

### Primary (HIGH confidence)
- [nextjs.org/blog/next-16](https://nextjs.org/blog/next-16) — Next.js 16 release notes: cache model, `proxy.ts`, breaking changes, removed APIs
- [nextjs.org/docs/app/api-reference/directives/use-cache](https://nextjs.org/docs/app/api-reference/directives/use-cache) — `use cache` directive API: how to enable, cache keys, constraints
- [nextjs.org/docs/app/getting-started/caching](https://nextjs.org/docs/app/getting-started/caching) — Split caching with `<Suspense>` + PPR pattern
- [nextjs.org/docs/app/api-reference/functions/cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife) — Preset cache profiles (`hours`, `days`, `max`, etc.) with exact stale/revalidate/expire values
- [nextjs.org/docs/app/api-reference/functions/generate-metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) — `generateMetadata` + `alternates.canonical` + async params
- [nextjs.org/docs/app/guides/json-ld](https://nextjs.org/docs/app/guides/json-ld) — Official JSON-LD pattern: `<script dangerouslySetInnerHTML>` + XSS mitigation
- [orm.drizzle.team/docs/relations](https://orm.drizzle.team/docs/relations) — `relations()` helper, one-to-many, many-to-many junction table pattern
- [orm.drizzle.team/docs/sql-schema-declaration](https://orm.drizzle.team/docs/sql-schema-declaration) — `pgTable`, foreign keys, unique constraints, indexes
- [orm.drizzle.team/docs/operators](https://orm.drizzle.team/docs/operators) — `ilike`, `and`, `or`, `eq`, `gte`, `lte`, `between`, dynamic WHERE
- [orm.drizzle.team/docs/select](https://orm.drizzle.team/docs/select) — `orderBy(asc/desc)`, `limit/offset`, relational query `with:`
- [orm.drizzle.team/docs/guides/postgresql-full-text-search](https://orm.drizzle.team/docs/guides/postgresql-full-text-search) — ILIKE vs tsvector comparison

### Secondary (MEDIUM confidence)
- npm registry: `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `next@16.2.9`, `slugify@1.6.9` — verified current versions [VERIFIED: npm view]
- Next.js 16 `images.remotePatterns` deprecation of `images.domains` — confirmed in official Next.js 16 breaking changes

### Tertiary (LOW confidence)
- Industry-standard ecommerce `product_options → option_values → variant_option_values` join table schema pattern — cross-referenced from multiple sources but not a single authoritative spec [ASSUMED for specifics]
- `picsum.photos` as placeholder image CDN for seed data — suitable for development [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry; Next.js 16 docs confirmed at version 16.2.9
- Architecture (caching split): HIGH — verified against official Next.js 16 `use cache` + Caching docs (lastUpdated: 2026-05-13)
- Schema design (variant model): MEDIUM — normalized join-table pattern is industry standard; specific column naming is Claude's discretion
- Pitfalls: HIGH — Next.js 16 breaking changes (async params, cacheComponents flag) verified against official docs

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (Next.js 16 is stable; Drizzle 0.45.x is stable — 30 days)
