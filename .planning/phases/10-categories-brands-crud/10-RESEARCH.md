# Phase 10: Categories & Brands CRUD - Research

**Researched:** 2026-07-12
**Domain:** Admin CRUD over taxonomy entities (Drizzle/Postgres schema migration + Next.js 16 Server Actions + storefront decoupling) — this is a codebase-grounded phase, not a new-technology phase.
**Confidence:** HIGH (every claim below is either [VERIFIED] by direct file/type-declaration inspection in this repo, or [CITED] from an installed package's `.d.ts`; nothing in this phase requires new external research — it is a close structural mirror of Phase 5 and Phase 9, both already shipped and tested in this codebase)

## Summary

Phase 10 adds two new taxonomy-CRUD surfaces (`/admin/categories`, `/admin/brands`) that are almost mechanically derivable from two already-shipped analogs: `src/lib/actions/admin-products.ts` (Server Action shape: `verifyAdminSession()` first, Zod parse, `ActionResult` DTO, soft-delete via `isActive`) and `src/app/admin/customers/page.tsx` + `CustomerRowActions.tsx` (admin list page + client-island row actions + count aggregate). The only genuinely new engineering work is: (1) a schema migration adding `isActive boolean NOT NULL DEFAULT true` to `brand` and `category` — which is column-add-to-existing-table, structurally identical to the already-executed Phase 9 `users.createdAt` migration — and (2) decoupling `src/app/[categorySlug]/page.tsx` (plus `SiteHeader.tsx` and `src/app/page.tsx`) from the hardcoded `VALID_CATEGORY_SLUGS`/`CATEGORY_NAMES`/`RAILS` arrays so the storefront taxonomy becomes DB-driven and soft-delete-aware.

**Primary recommendation:** Mirror `admin-products.ts` + `admin-customers`/`CustomerRowActions` verbatim for the action/query/UI layers; migrate the schema exactly like `apply-users-createdat-schema(-to-test-db).mjs` (ALTER TABLE ADD COLUMN IF NOT EXISTS, applied to both `DATABASE_URL` and `TEST_DATABASE_URL`); resolve category-name/brand-name uniqueness via a check-then-insert pattern backed by the DB's existing UNIQUE constraint as a fail-safe (the constraint violation is catchable — `NeonDbError.code === "23505"` is a real, typed property on the installed driver, see Pitfall 5); decouple the storefront by adding two new server-only catalog queries (`getActiveCategoryBySlug`, `listActiveCategoriesForNav`) that replace every hardcoded array.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Soft-delete both entities.** Add `isActive boolean NOT NULL DEFAULT true` to the `brand` and `category` tables. "Delete" = set `isActive=false`; a **reactivate** action restores it. Mirrors the Phase 5 `deactivateProduct`/`reactivateProduct` pattern. Rationale: `product.categoryId` and `product.brandId` are `.notNull().references()` hard FKs, so a hard delete of an in-use row is impossible anyway, and soft-delete preserves referential + historical integrity.
- **D-02 — No cascade to products.** Deactivating a category/brand does NOT deactivate its products (unlike product→variants). Products keep their FK. The admin list surfaces the **product count** per entity so the owner sees impact before deactivating. Reassigning those products is done per-product in the existing product editor (out of scope here).
- **D-03 — DB-drive the category taxonomy.** Replace the hardcoded `VALID_CATEGORY_SLUGS` / `CATEGORY_NAMES` in `src/app/[categorySlug]/page.tsx` (and `generateStaticParams`) with a DB lookup of **active** categories: an unknown/inactive slug → `notFound()`; a newly-created active category is browsable at `/<slug>`. Update the storefront category nav in `src/components/layout/SiteHeader.tsx` to list active categories from the DB. Home page (`src/app/page.tsx`) category sections should also render from active categories. Brand filters already come from the DB per category (`getBrandsForCategory`) — extend those queries to exclude inactive brands.
- **D-04 — Category slug is set at creation, immutable thereafter.** Generated from the name via `uniqueSlug`. Renaming updates `name` only (keeps existing URLs/bookmarks stable — same choice as products). Brands have no slug (unchanged).
- **D-05 — Uniqueness.** `name` is already `UNIQUE` on both tables; `category.slug` is `UNIQUE`. Actions must catch unique-violation and return a friendly `ActionResult` error ("A category with that name already exists"), not a 500.
- **D-06 — Server Actions mirror `admin-products.ts` exactly:** `"use server"` + `"server-only"`, `verifyAdminSession()` as the literal FIRST statement (D-02/T-05-08 security contract), Zod parse, `ActionResult<T>` return DTOs (never a raw Drizzle row), `crypto.randomUUID()` ids, try/catch → generic error message + `console.error`. New file: `src/lib/actions/admin-taxonomy.ts` (or `admin-categories.ts` + `admin-brands.ts` — planner's discretion).
- **D-07 — Admin read queries** live alongside `src/lib/catalog/admin-queries.ts` (e.g. `listCategoriesForAdmin`, `listBrandsForAdmin` with product-count aggregate — mirror `listProductsForAdmin`).
- **D-08 — Admin UI** mirrors the Phase 5 products list: two new routes `/admin/categories` and `/admin/brands` (list + inline create/rename/deactivate), added to `src/components/admin/AdminSidebar.tsx` nav. Client-island row actions mirror the existing products list / `CustomerRowActions` pattern.
- **D-09 — Cache invalidation.** Every taxonomy mutation invalidates the affected storefront surfaces (`revalidatePath('/')`, `revalidatePath('/<slug>')`, and any `use cache` tags the catalog relies on for category/brand listings). Follow the existing `updateTag`/`revalidatePath` convention — over-invalidating is harmless.
- **D-10 — Dual-auth throughout.** `/admin/*` is already proxy-protected; every new action re-verifies `verifyAdminSession()` first; every new admin page/query runs server-side; no taxonomy write is reachable without admin role. No PII involved.
- **D-11 — `isActive` columns require a schema push to BOTH databases** (dev `DATABASE_URL` + `TEST_DATABASE_URL`) before verification, per CLAUDE.md + the Phase 1/2/4 pattern. drizzle-kit push may need the direct-SQL `@neondatabase/serverless` fallback if a TTY prompt blocks it (see 03-01/04-01 SUMMARYs). This is a `[BLOCKING]` task.

### Claude's Discretion

- Exact file split (one `admin-taxonomy.ts` vs two files); whether create/rename happen inline in the list vs a modal; precise cache-tag names; test file organization. Planner + pattern-mapper decide, grounded in the Phase 5 analogs.

### Deferred Ideas (OUT OF SCOPE)

- Product↔category/brand bulk reassignment UI.
- Category hierarchy / nesting / sort order.
- Brand logos, category images/descriptions.
- Merging two categories/brands into one.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMN-12 | Admin can create, rename, and soft-delete/restore product categories (name + immutable slug) with a per-category product count shown; storefront DB-driven (active browsable, soft-deleted 404 + vanish from nav/filters), replacing `VALID_CATEGORY_SLUGS`. | Schema migration pattern (§Architecture Patterns, Pattern 1); `admin-products.ts`-mirrored actions (Pattern 2); `listCategoriesForAdmin` aggregate query (Pattern 3); storefront decoupling of `[categorySlug]/page.tsx`, `SiteHeader.tsx`, `page.tsx` (Pattern 4); cache invalidation (Pattern 5). |
| ADMN-13 | Admin can create, rename, and soft-delete/restore brands with a per-brand product count shown; only active brands appear in storefront brand filters; no cascade to products. | Same action/query mirror as categories, minus slug (brands have no slug per D-04); `getBrandsForCategory` extension to filter `brands.isActive` (Pattern 4); D-02 no-cascade confirmed by schema FK inspection (`product.brandId` is `.notNull().references()`, no `onDelete` cascade defined for isActive changes — see Don't Hand-Roll). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Category/brand schema (`isActive` column) | Database / Storage | — | Structural change to Postgres tables; owned entirely by the schema layer (`src/lib/db/schema.ts`) and migration scripts. |
| Create/rename/deactivate/reactivate mutations | API / Backend (Server Actions) | — | Next.js Server Actions run server-side only; `"use server"` + `"server-only"` guard, admin-gated. Never exposed to the client bundle. |
| Admin read queries (list + product-count aggregate) | API / Backend | Database / Storage | Query composition (Drizzle) lives in `src/lib/catalog/admin-queries.ts` (backend), executing against Postgres (storage tier does the actual aggregation via SQL `COUNT`/`GROUP BY`). |
| Admin list/row-action UI (`/admin/categories`, `/admin/brands`) | Frontend Server (SSR) | Browser / Client | Server Components do the data fetch + initial render (SSR); the row-action island (`"use client"`) handles interactive create/rename/deactivate forms and re-renders via `router.refresh()`. |
| Storefront category resolution (`[categorySlug]` route) | Frontend Server (SSR) | CDN / Static (`generateStaticParams`) | Category validity + active-only 404 logic is a server-side DB lookup at request time; `generateStaticParams` additionally seeds the static param set at build time for the CDN/edge cache layer. |
| Storefront nav + home rails (active categories) | Frontend Server (SSR) | CDN / Static (`use cache`) | Both are Server Components; recommended to wrap the categories-list fetch in `'use cache'` + `cacheTag` so the nav/rails stay part of the prerenderable static shell (mirrors Phase 2 `ProductContent` pattern) rather than becoming fully dynamic. |
| Brand facet filtering (active-only) | API / Backend | — | `getBrandsForCategory` (backend query) filters `brands.isActive` before returning to the SSR page — no client-tier involvement. |

## Standard Stack

### Core

No new packages are required for this phase — everything needed is already installed and pinned in `package.json` [VERIFIED: package.json + `npx drizzle-kit --version` output in this environment].

| Library | Installed Version | Purpose | Why Standard (here) |
|---------|---------|---------|--------------|
| `drizzle-orm` | 0.45.2 [VERIFIED: `npx drizzle-kit --version` reports `drizzle-orm: v0.45.2`; matches `package.json` `^0.45.2`] | Schema + query builder | Already the project's sole ORM; all Phase 2/5/9 patterns build on it. |
| `drizzle-kit` | 0.31.10 [VERIFIED: same command] | `db:push`/`db:generate` CLI | Already the project's migration tool; known TTY limitation documented below (Pitfall 1). |
| `@neondatabase/serverless` | installed (used by `src/lib/db/client.ts` via `drizzle-orm/neon-http`) [VERIFIED: `src/lib/db/client.ts` imports `neon` from it; `node_modules/@neondatabase/serverless/index.d.ts` inspected directly] | Direct-SQL fallback driver when `drizzle-kit push` needs a TTY | Documented, already-used fallback (03-01/04-01/09 SUMMARYs) — see Pattern 1. |
| `zod` | ^4.4.3 [VERIFIED: package.json] | Server Action input validation | Every existing admin action (`admin-products.ts`, `admin-customers.ts`) uses `z.object(...).safeParse` — same convention applies here. |
| `slugify` (via `src/lib/utils/slug.ts`) | installed, wrapped by `toSlug`/`uniqueSlug` | Category slug generation (D-04) | Already the project's only slugging utility; used identically for product slugs. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/cache` (`updateTag`, `revalidatePath`) | bundled with Next.js 16.2.7 [VERIFIED: package.json] | Cache invalidation on every taxonomy mutation (D-09) | Same convention as `admin-products.ts`'s `updateTag('product-<slug>')` — call unconditionally, even on not-found ids (over-invalidating is harmless, established convention). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Check-then-insert for name uniqueness (D-05) | Catch `NeonDbError.code === "23505"` only, no pre-check | Pre-check gives a friendlier error message before hitting the DB and matches the existing `uniqueSlug`-predicate style already in the codebase (no prior art for catching driver error codes here); catching the code is still worth doing as a defense-in-depth backstop against a race between two concurrent admin tabs (see Pitfall 5). Do both. |
| One `admin-taxonomy.ts` action file | Two files `admin-categories.ts` + `admin-brands.ts` | Explicitly left to planner's discretion (D-06) — either mirrors `admin-products.ts`'s single-file convention; splitting only matters if the file gets long. No functional difference. |

**Installation:** None required — no new packages.

**Version verification:** All versions above were confirmed against files already present in this environment (`package.json`, `npx drizzle-kit --version`, and direct inspection of `node_modules/@neondatabase/serverless/index.d.ts`) rather than the npm registry, since no new package is being added for this phase.

## Architecture Patterns

### System Architecture Diagram

```
Admin browser
   │
   │ 1. GET /admin/categories  (or /admin/brands)
   ▼
AdminLayout (verifyAdminSession — dual-auth layer 2)
   │
   ▼
/admin/categories/page.tsx  (Server Component, Suspense-wrapped)
   │  await listCategoriesForAdmin()  ──────────────┐
   ▼                                                 │
CategoryRowActions (client island)                   │
   │  onClick → createCategory/renameCategory/       │
   │            deactivateCategory/reactivateCategory│
   ▼                                                 │
Server Action (src/lib/actions/admin-taxonomy.ts)     │
   │  1. verifyAdminSession()  [FIRST statement]      │
   │  2. Zod parse                                    │
   │  3. uniqueSlug() / uniqueness pre-check           │
   │  4. db.insert/update(categories|brands)  ◄───────┘ (shared Postgres tables)
   │  5. updateTag(...) + revalidatePath('/', '/<slug>')
   ▼
Postgres (Neon) — category / brand tables (+ isActive column)
   │
   │ (product.categoryId / product.brandId FK — read-only from this phase's POV)
   ▼
Storefront (separate request, separate render tree)
   │
   ▼
[categorySlug]/page.tsx → getActiveCategoryBySlug(slug)
   │  found + isActive=true → getCatalog() + getBrandsForCategory() (active brands only)
   │  not found / isActive=false → notFound() (404)
   ▼
SiteHeader / page.tsx (home rails) → listActiveCategoriesForNav()  ['use cache' + cacheTag]
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── db/schema.ts                 # add isActive to brands + categories tables
│   ├── actions/
│   │   └── admin-taxonomy.ts        # NEW — createCategory/renameCategory/(de)activateCategory + brand equivalents
│   └── catalog/
│       ├── admin-queries.ts         # add listCategoriesForAdmin / listBrandsForAdmin
│       └── queries.ts               # add getActiveCategoryBySlug / listActiveCategoriesForNav; extend getBrandsForCategory
├── scripts/
│   ├── apply-taxonomy-isactive-schema.mjs           # NEW — ALTER TABLE ADD COLUMN, DATABASE_URL
│   └── apply-taxonomy-isactive-schema-to-test-db.mjs # NEW — same, TEST_DATABASE_URL
├── components/
│   ├── admin/
│   │   ├── AdminSidebar.tsx         # add Categories + Brands nav items
│   │   ├── CategoryRowActions.tsx   # NEW — client island, mirrors CustomerRowActions/ProductRowActions
│   │   └── BrandRowActions.tsx      # NEW — same, no slug field
│   └── layout/
│       └── SiteHeader.tsx           # DB-driven nav instead of hardcoded NAV array
├── app/
│   ├── admin/
│   │   ├── categories/page.tsx      # NEW — list + inline create/rename
│   │   └── brands/page.tsx          # NEW — list + inline create/rename
│   ├── [categorySlug]/page.tsx      # DB-driven active-category lookup replaces VALID_CATEGORY_SLUGS
│   └── page.tsx                     # home rails sourced from listActiveCategoriesForNav()
```

### Pattern 1: Schema migration — add a nullable-with-default column to an existing table

**What:** `isActive boolean NOT NULL DEFAULT true` added to `brands` and `categories`. This is structurally identical to the Phase 9 migration that added `users.createdAt` — a single `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` per table, applied to **both** `DATABASE_URL` and `TEST_DATABASE_URL` via two small scripts using `@neondatabase/serverless` directly (bypassing `drizzle-kit push`'s TTY prompt).

**When to use:** Any time `drizzle-kit push` would need to prompt for a data-loss/rename confirmation in a non-interactive shell (documented recurring issue: 03-01, 04-01, and Phase 9 SUMMARYs all hit this and used the identical fallback).

**Example (verified working script from Phase 9, `src/scripts/apply-users-createdat-schema.mjs`, adapted):**
```js
// Source: src/scripts/apply-users-createdat-schema.mjs (this repo, Plan 09 — already executed & verified)
import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) { console.error("DATABASE_URL not set"); process.exit(1) }

const sql = neon(databaseUrl)

async function applyTaxonomyIsActive() {
  await sql`ALTER TABLE "brand" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL`
  await sql`ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL`

  const result = await sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_name IN ('brand', 'category') AND column_name = 'is_active'
  `
  if (result.length === 2) {
    console.log("SUCCESS: is_active present on brand + category")
  } else {
    console.error("ERROR: is_active missing on one or both tables:", result)
    process.exit(1)
  }
}

applyTaxonomyIsActive()
```
A second script, identical except reading `process.env.TEST_DATABASE_URL` (mirroring `apply-users-createdat-schema-to-test-db.mjs`), must be run against the test branch before any DB-gated integration test can assert on `isActive` filtering. **Both scripts are required — this is the `[BLOCKING]` D-11 task and must complete before Wave-0 DB tests can pass.**

**Attempt `npm run db:push` first** (it may succeed non-interactively this time — the TTY block is a known but not universal failure in this environment); fall back to the script above only if it hangs/prompts, exactly as documented in the three prior SUMMARYs.

### Pattern 2: Server Action shape (mirror `admin-products.ts` exactly)

**What:** Every mutation is a `"use server"` + `"server-only"` function that calls `verifyAdminSession()` as its literal first statement, Zod-parses input, performs the DB write, unconditionally fires cache invalidation, and returns a minimal `ActionResult<T>` DTO — never a raw Drizzle row.

**Example (adapted from `src/lib/actions/admin-products.ts`, lines 1-108 of this repo):**
```typescript
// Source: src/lib/actions/admin-products.ts (this repo) — pattern to mirror exactly
"use server"
import "server-only"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { categories } from "@/lib/db/schema"
import { uniqueSlug } from "@/lib/utils/slug"

type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

const CategoryInputSchema = z.object({ name: z.string().min(1, "Name is required") })

export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // FIRST statement — D-10

  const parsed = CategoryInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  // D-05: check-before-insert to give a friendly error before the DB-level UNIQUE fires
  const existing = await db.query.categories.findFirst({ where: eq(categories.name, parsed.data.name) })
  if (existing) return { success: false, error: "A category with that name already exists" }

  try {
    const id = crypto.randomUUID()
    const slug = await uniqueSlug(parsed.data.name, async (s) => {
      const row = await db.query.categories.findFirst({ where: eq(categories.slug, s), columns: { id: true } })
      return !!row
    })
    await db.insert(categories).values({ id, name: parsed.data.name, slug, isActive: true })

    revalidatePath("/") // D-09
    revalidatePath(`/${slug}`)
    return { success: true, id }
  } catch (err) {
    console.error("[admin-taxonomy] createCategory failed:", err)
    return { success: false, error: "Something went wrong creating the category." }
  }
}
```
Deactivate/reactivate follow `deactivateProduct`/`reactivateProduct` verbatim (single `.update().set({ isActive: false | true })`, `revalidatePath` fired unconditionally even on a stale id — over-invalidating is the established, intentional convention, see `admin-products.ts` line 136-138 comment).

### Pattern 3: Admin list query with product-count aggregate

**What:** A `LEFT JOIN` to a `GROUP BY productId/categoryId` (or `brandId`) subquery, exactly like `listProductsForAdmin`'s variant-aggregate subquery and `listCustomersForAdmin`'s order-count subquery.

**Example (mirrors `src/lib/catalog/admin-queries.ts` `listCustomersForAdmin`, this repo):**
```typescript
// Source: src/lib/catalog/admin-queries.ts pattern (listCustomersForAdmin order-count subquery), adapted
import { products, categories } from "@/lib/db/schema"
import { and, desc, eq, count, sql } from "drizzle-orm"

const productCountSq = db
  .select({
    categoryId: products.categoryId,
    productCount: sql<number>`COUNT(*)`.as("product_count"),
  })
  .from(products)
  .groupBy(products.categoryId)
  .as("product_count_sq")

const rows = await db
  .select({
    id: categories.id,
    name: categories.name,
    slug: categories.slug,
    isActive: categories.isActive,
    productCount: productCountSq.productCount,
  })
  .from(categories)
  .leftJoin(productCountSq, eq(categories.id, productCountSq.categoryId))
  .orderBy(desc(categories.createdAt))
```
Note: use `products.categoryId`/`products.brandId` for the count regardless of `products.isActive` (D-02 — the count should reflect true reference count, not just active products, so the owner sees the FULL impact before deactivating; this matches the spirit of `getProductForAdmin`'s comment that admin reads intentionally ignore `isActive` filters that the storefront applies). Brands follow the identical shape grouped on `products.brandId`.

### Pattern 4: Storefront decoupling — DB-driven category resolution

**What:** Replace `VALID_CATEGORY_SLUGS`/`CATEGORY_NAMES` in `src/app/[categorySlug]/page.tsx` with two new server-only queries added to `src/lib/catalog/queries.ts`:

```typescript
// getActiveCategoryBySlug — the single source of truth for "does this slug 404?"
export async function getActiveCategoryBySlug(slug: string) {
  const cat = await db.query.categories.findFirst({
    where: and(eq(categories.slug, slug), eq(categories.isActive, true)),
  })
  return cat ?? null
}

// listActiveCategoriesForNav — for SiteHeader nav + home page rails + generateStaticParams
export async function listActiveCategoriesForNav() {
  return db.query.categories.findMany({
    where: eq(categories.isActive, true),
    orderBy: (c, { asc }) => [asc(c.name)],
  })
}
```

In `CategoryContent`, replace the `VALID_CATEGORY_SLUGS.includes(categorySlug)` check with:
```typescript
const category = await getActiveCategoryBySlug(categorySlug)
if (!category) notFound()
```
`generateStaticParams` becomes `const cats = await listActiveCategoriesForNav(); return cats.map((c) => ({ categorySlug: c.slug }))`.

`getCatalog` itself already resolves `categorySlug` → `categoryId` independently (line 66-76 of `src/lib/catalog/queries.ts`) but does **not** currently filter on `categories.isActive` — a soft-deleted category's slug would still return products via `getCatalog` if called directly. Since `CategoryContent` now gates on `getActiveCategoryBySlug` first and calls `notFound()` before ever calling `getCatalog`, this is safe **for the `[categorySlug]` route**. However, `getBrandsForCategory` and `getCatalog`'s category-slug resolution should still be independently hardened (add `eq(categories.isActive, true)` to their own category lookups) so no other future caller can leak a deactivated category's products by slug (defense in depth — flagged as Pitfall 4 below).

`getBrandsForCategory` must add `eq(brands.isActive, true)` to its filter list (currently only filters `products.isActive`) — this is the concrete implementation of D-03's "extend those queries to exclude inactive brands."

**SiteHeader.tsx and `src/app/page.tsx`:** both currently contain hardcoded arrays (`NAV`, `RAILS`) with copy (`"Latest Phones"`, `"Top Watches"`, etc.) that doesn't exist in the DB (only `category.name` does — e.g. "Phones", not "Latest Phones"). The planner must decide the UI-SPEC wording (e.g., render `category.name` directly, or a template like `` `New in ${category.name}` ``) — this is a genuine open UI question, not a research gap (see Open Questions).

### Pattern 5: Cache invalidation surfaces

**What:** every taxonomy mutation must invalidate:
1. `revalidatePath('/')` — home page rails read active categories.
2. `revalidatePath('/<categorySlug>')` — the category's own listing page (categories only; brands have no dedicated route).
3. Any `'use cache'`-tagged nav/rail data, if the planner adopts the recommended `'use cache' + cacheTag('categories-nav')` optimization for `SiteHeader`/home-page rails (see Pitfall 3) — then `updateTag('categories-nav')` must also fire.

This mirrors D-09 exactly and the existing `updateTag('product-<slug>')` convention in `admin-products.ts` — "over-invalidating is harmless" is the established project philosophy; err on the side of firing more tags/paths, not fewer.

### Anti-Patterns to Avoid

- **Cascading `isActive=false` to products on category/brand deactivate:** explicitly forbidden by D-02. Only `deactivateProduct` cascades to variants (a different, intentional Phase 5 decision) — do not copy that cascade behavior here.
- **Returning raw Drizzle rows from Server Actions:** every existing admin action returns a minimal `{success, id}` / `{success, error}` DTO. Do not `return updated` (the full row) — this is an established security/hygiene contract (T-05-11 in `admin-products.ts`'s own header comment), even though categories/brands have no PII.
- **Trusting `getCatalog`'s existing category-slug resolution as the 404 gate:** it silently returns an empty product list for an unknown slug (by design, for callers that want a "0 results" page, not a 404) — it must NOT be the sole authority for whether `/<slug>` 404s. Use the new `getActiveCategoryBySlug` explicitly in `CategoryContent` before calling `getCatalog`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting a duplicate category/brand name | A custom SQL error-message parser | `db.query.categories.findFirst({ where: eq(categories.name, ...) })` pre-check (mirrors `uniqueSlug`'s existing predicate style), backed by the DB's own `UNIQUE` constraint as a race-condition backstop caught via `NeonDbError.code === "23505"` | The driver's error type (`NeonDbError`, `node_modules/@neondatabase/serverless/index.d.ts` line 795) already exposes a typed `.code`/`.constraint`/`.detail` — no need to string-match a generic "Failed query" message. |
| Slug generation/collision handling | A new slugging function | `toSlug`/`uniqueSlug` from `src/lib/utils/slug.ts` | Already handles collision-suffixing (`-2`, `-3`, ...) and is used identically for products; category slugs need the exact same behavior (D-04). |
| Schema migration tooling | Hand-written raw `ALTER TABLE` migration files tracked outside Drizzle | The already-established `apply-*-schema(-to-test-db).mjs` script pattern using `@neondatabase/serverless` directly | This is not a new pattern to invent — it is the third time this exact class of migration (add column, `drizzle-kit push` TTY-blocked) has occurred in this codebase (03-01, 04-01, Phase 9); reuse the script shape verbatim. |
| Admin list pagination/aggregate-count query shape | A new query-building abstraction | The `leftJoin` + `groupBy` subquery pattern already used identically 3 times (`listProductsForAdmin` variant aggregate, `listCustomersForAdmin` order aggregate) | Proven pattern; deviating risks subtly different `COALESCE`/`NULL`-handling bugs the existing pattern already accounts for (e.g. `stockTotal: sql<number>\`COALESCE(SUM(...), 0)\`` handles the zero-variants case). |

**Key insight:** This entire phase is bounded by prior art already in the repository. The highest-risk work is NOT "how do I build category CRUD" (answered 3x already) but "how do I safely decouple the storefront's only 3 hardcoded category slugs without breaking the home page / nav / static params" — that is genuinely new surface area and deserves the most planning attention (see Pitfalls 2-4, Open Questions).

## Common Pitfalls

### Pitfall 1: `drizzle-kit push` TTY prompt blocking the `isActive` migration
**What goes wrong:** `npm run db:push` hangs waiting for a constraint-conflict confirmation that can't be answered in a non-interactive/CI shell.
**Why it happens:** `drizzle-kit` checks `process.stdin.isTTY`; documented in all three prior schema-change SUMMARYs (03-01, 04-01, Phase 9 `users.createdAt`) in this exact repo.
**How to avoid:** Attempt `npm run db:push` first (short timeout); if it hangs or prompts, fall back immediately to the `apply-taxonomy-isactive-schema(.mjs / -to-test-db.mjs)` direct-SQL scripts (Pattern 1). Budget for this fallback in the plan — it is the norm, not the exception, in this environment.
**Warning signs:** the push command produces no output for >10-15s, or prints something like "Is `option_value_unique` unique?".

### Pitfall 2: Forgetting to run the migration against `TEST_DATABASE_URL` too
**What goes wrong:** DB-gated integration tests that assert on `isActive` filtering (soft-delete, storefront exclusion) silently fail with "column is_active does not exist" or (worse) `it.skipIf(!hasDatabase)` quietly skips them if `TEST_DATABASE_URL` happens to be unset, masking the gap entirely.
**Why it happens:** the dev DB and the test-branch DB are two separate Neon databases (CLAUDE.md, `vitest.config.ts`); a migration applied to one does not touch the other.
**How to avoid:** Run BOTH scripts (`DATABASE_URL` and `TEST_DATABASE_URL` variants) before writing/running any DB-gated test in this phase — this is the literal D-11 `[BLOCKING]` task. `TEST_DATABASE_URL` is confirmed present in this environment's `.env.local` [VERIFIED: `grep -c TEST_DATABASE_URL .env.local` → 1], so integration tests for this phase should NOT skip — a skip here is a signal something is misconfigured, not the expected default.
**Warning signs:** `npm test` shows the new taxonomy DB tests as skipped when you expected them to run.

### Pitfall 3: Making `SiteHeader`/home-page rails fully dynamic breaks the existing PPR shell
**What goes wrong:** `SiteHeader` is currently a synchronous, non-async Server Component rendered twice in `src/app/layout.tsx` — once in a static Suspense fallback, once inside the dynamic `CartShell` — as part of the established `cacheComponents: true` PPR setup (STATE.md: "getCartCount() isolated in async CartShell... required for cacheComponents:true PPR compatibility"). If `SiteHeader` is naively converted to an `async` component that does a live, uncached DB read for nav categories, it forces the header itself to become dynamic, which can regress the PPR-static shell that Phase 2/3 deliberately engineered (STATE.md Plan 2/3 notes).
**Why it happens:** cacheComponents (PPR) treats any uncached `await` inside a Server Component as a reason to bail that subtree to dynamic rendering, unless it's wrapped in `'use cache'` or its own `<Suspense>`.
**How to avoid:** Wrap the categories-nav data fetch itself in a `'use cache'` function with `cacheLife('hours')` (or similar) + `cacheTag('categories-nav')` — mirroring the exact Phase 2 `ProductContent` pattern (STATE.md Plan 02-04: `'use cache' + cacheLife('hours') + cacheTag('product-<slug>')`). Then every taxonomy mutation calls `updateTag('categories-nav')` alongside `revalidatePath`. This keeps `SiteHeader`/home rails part of the prerenderable static shell instead of introducing a new per-request DB round-trip on every page load.
**Warning signs:** `next build --webpack` output showing new routes/pages losing their `◐` (Partial Prerender) status and becoming fully `ƒ` (dynamic) after this change — verify with a build before/after.

### Pitfall 4: `getCatalog`/`getBrandsForCategory` resolving a *deactivated* category by slug independently of the `[categorySlug]` page's 404 gate
**What goes wrong:** `getCatalog({categorySlug})` and `getBrandsForCategory(categorySlug)` each independently do their own `db.query.categories.findFirst({ where: eq(categories.slug, categorySlug) })` lookup with NO `isActive` filter (confirmed by direct inspection of `src/lib/catalog/queries.ts` lines 66-76 and 234-239). If any *other* caller (a future search page, an API route, a sitemap generator) calls these functions directly without first checking `getActiveCategoryBySlug`, a soft-deleted category's products/brands would still be servable.
**Why it happens:** these two functions were written in Phase 2, before soft-delete on categories existed; they were correct then.
**How to avoid:** Add `eq(categories.isActive, true)` to the category-resolution `where` clause inside BOTH `getCatalog` and `getBrandsForCategory` (not just relying on the new `getActiveCategoryBySlug` gate in the page component) — defense in depth, and cheap (one more `and(...)` clause each).
**Warning signs:** a soft-deleted category's `/<slug>` page 404s correctly (via the new gate) but `/products?category=<name>`-style facet filters or a future sitemap still reference it.

### Pitfall 5: Assuming Drizzle surfaces a clean, catchable Postgres error code for the unique-violation (D-05)
**What goes wrong:** A generic community report (not this repo) claims Drizzle can throw an opaque "Failed query" error without a clean error code on some drivers/configs — teams sometimes over-correct by string-matching the error message, which is brittle across Postgres locales/versions.
**Why it happens:** error-shape behavior varies by driver; this project specifically uses `drizzle-orm/neon-http` (`src/lib/db/client.ts`), backed by `@neondatabase/serverless`.
**How to avoid:** This repo's installed driver type declarations (`node_modules/@neondatabase/serverless/index.d.ts`, line 795) show `NeonDbError` has typed `code: string | undefined` and `constraint: string | undefined` fields — Postgres unique-violation is SQLSTATE `23505`, and the constraint name would be `brand_name_unique`/`category_name_unique`/`category_slug_unique` (per the existing `unique()` schema builder naming convention, e.g. `product_option_name_unique` elsewhere in `schema.ts`). [VERIFIED: type declaration file inspected directly in this environment] Given this, catching `err instanceof Error && (err as { code?: string }).code === "23505"` is a reliable belt to pair with the check-before-insert (belt-and-suspenders); do not skip the check-before-insert though, since it gives the friendlier UX (D-05's requirement is about the message quality, not just avoiding a 500).
**Warning signs:** a rename to an already-taken name returns a raw 500/unhandled-promise-rejection instead of the friendly `ActionResult` error.

### Pitfall 6: Stale marketing copy after decoupling (low severity, non-blocking)
**What goes wrong:** `src/app/products/page.tsx`'s metadata description ("Browse all electronics, watches, and phones...") and `src/components/cart/CartEmptyState.tsx`'s copy ("Browse our electronics, watches and phones...") are plain marketing text, not functional slug references — they will NOT break when the taxonomy becomes DB-driven, but they will silently go stale the moment the owner adds/removes/renames a category (e.g. adds "Laptops").
**Why it happens:** these two files matched the same `electronics|watches|phones` grep as the functionally-hardcoded files, but on inspection are copy-only.
**How to avoid:** Not a blocker for ADMN-12/13, but worth a one-line planner note: either generalize the copy ("Browse our full range of products") or explicitly descope updating it. Do not spend a task rewriting these two files' copy unless the planner decides it's in scope — flag it, don't silently fix it, since CONTEXT.md's "Deferred Ideas" doesn't mention marketing copy at all (ambiguous, lean toward leaving as-is + noting in the plan).
**Warning signs:** none functional — this is purely a copy-freshness concern.

## Code Examples

### Uniqueness check + Postgres error-code backstop (D-05)
```typescript
// Source: this repo's NeonDbError type (node_modules/@neondatabase/serverless/index.d.ts:795)
//         combined with the existing uniqueSlug predicate style (src/lib/utils/slug.ts)
try {
  await db.insert(brands).values({ id, name, isActive: true })
} catch (err) {
  const code = (err as { code?: string })?.code
  if (code === "23505") {
    return { success: false, error: "A brand with that name already exists" }
  }
  console.error("[admin-taxonomy] createBrand failed:", err)
  return { success: false, error: "Something went wrong creating the brand." }
}
```

### Active-only category/brand read filter (extending `getBrandsForCategory`)
```typescript
// Source: src/lib/catalog/queries.ts getBrandsForCategory (this repo), extended per D-03
export async function getBrandsForCategory(categorySlug?: string): Promise<string[]> {
  let categoryId: string | undefined
  if (categorySlug) {
    const cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, categorySlug), eq(categories.isActive, true)), // ADDED
    })
    categoryId = cat?.id
  }
  const filters = [eq(products.isActive, true)]
  if (categoryId) filters.push(eq(products.categoryId, categoryId))

  const rows = await db
    .selectDistinct({ brandName: brands.name })
    .from(products)
    .innerJoin(brands, and(eq(products.brandId, brands.id), eq(brands.isActive, true))) // ADDED filter
    .where(and(...filters))
    .orderBy(asc(brands.name))

  return rows.map((r) => r.brandName)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `VALID_CATEGORY_SLUGS` / `CATEGORY_NAMES` hardcoded arrays in `[categorySlug]/page.tsx` | DB-driven `getActiveCategoryBySlug` / `listActiveCategoriesForNav` | This phase (Phase 10) | Owner can add/rename/retire categories without a code deploy; `generateStaticParams` becomes DB-sourced (still static-generation-compatible — the query just runs at build time instead of returning a literal array). |
| No `isActive` column on `brand`/`category` | `isActive boolean NOT NULL DEFAULT true` on both | This phase (Phase 10) | Enables soft-delete without touching the hard FK constraints on `product.categoryId`/`brandId` (which remain `.notNull()` — never made nullable, never cascaded). |

**Deprecated/outdated:** none — this is additive; no existing Phase 2/5 code path is removed, only the three hardcoded arrays (`VALID_CATEGORY_SLUGS`, `CATEGORY_NAMES` in `[categorySlug]/page.tsx`; `NAV` in `SiteHeader.tsx`; `RAILS` in `page.tsx`) are replaced with DB reads.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `npm run db:push` will hit the same non-interactive TTY block seen in 3 prior migrations, rather than succeeding cleanly this time. | Pattern 1 / Pitfall 1 | Low risk — the plan should attempt `db:push` first regardless per the recommendation; if it succeeds, the fallback scripts are simply unneeded (no harm either way). |
| A2 | The planner/UI-SPEC step will need to decide exact home-page rail copy (e.g., "Latest {category.name}" vs raw category name) since the DB only stores `category.name`, not marketing titles. | Pattern 4 | Low risk — cosmetic; flagged explicitly as an Open Question below so it isn't silently decided by whoever implements it first. |
| A3 | Stale marketing copy in `products/page.tsx` metadata and `CartEmptyState.tsx` is out of scope and should only be flagged, not fixed, in this phase. | Pitfall 6 | Low risk — if the owner actually wants this copy generalized, it's a 2-line follow-up; not fixing it does not block ADMN-12/13. |

## Open Questions (RESOLVED)

1. **Exact home-page rail / nav copy once categories are DB-driven**
   - **RESOLVED (Plan 10-04):** render a generic `New in ${category.name}` template over the DB-driven active-category list (no validity dependency on any hardcoded copy map); exact rail copy flagged for the Plan 06 browser UAT. Low risk.
   - What we know: `src/app/page.tsx`'s `RAILS` array currently pairs each category slug with custom marketing copy ("Latest Phones", "Top Watches", "New in Electronics") that does not exist as a DB field — only `category.name` ("Phones", "Watches", "Electronics") does.
   - What's unclear: whether the planner/UI-SPEC step should (a) render `category.name` directly as the rail title, (b) apply a generic template like `` `New arrivals: ${category.name}` ``, or (c) keep a small hardcoded copy-lookup map keyed by slug as a *display-only* enhancement layered on top of the DB-driven category list (falling back to `category.name` for any category without a custom title — e.g. a brand-new "Laptops" category the owner adds later).
   - Recommendation: option (c) is the most UX-polished middle ground and doesn't reintroduce a *validity* dependency (unknown/new categories still work, just with a plainer title) — but this is a UI/copy decision for the planner's UI-SPEC step, not a technical research gap.

2. **Whether the admin `/admin/categories` and `/admin/brands` list pages need search/pagination like `/admin/products` and `/admin/customers`**
   - **RESOLVED (10-PATTERNS.md + Plan 10-05):** no search/pagination — a single unpaginated table for the low expected row count. Low risk.
   - What we know: CONTEXT.md's "Specific Ideas" section describes a simple list (name, slug, product count, active badge, actions) with no mention of search or pagination; the number of categories/brands is expected to be small (currently 3 categories, 4 brands).
   - What's unclear: whether `ADMIN_PAGE_SIZE` pagination (used by every other admin list) is worth applying here given the low expected row count, or whether a single unpaginated table is acceptable.
   - Recommendation: skip pagination for these two lists (a plain unpaginated table matches the "simple list" framing in CONTEXT.md's Specific Ideas and avoids over-engineering for ~single-digit-to-low-double-digit row counts) — but flag this explicitly to the planner as a discretionary call, since D-08 says "planner + pattern-mapper decide."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 (via nvm) | vitest, any test tooling for this phase | ✓ [VERIFIED: `nvm use 22 && node --version` → v22.22.2 in this environment] | v22.22.2 | Shell defaults to Node 18 — always `nvm use 22` before running tests (per project MEMORY note). |
| `DATABASE_URL` (dev Neon) | Schema migration + seed | ✓ [VERIFIED: `.env.local` contains `DATABASE_URL`] | — | — |
| `TEST_DATABASE_URL` (separate Neon test branch) | DB-gated integration tests for this phase | ✓ [VERIFIED: `.env.local` contains `TEST_DATABASE_URL`, distinct from `DATABASE_URL` per `vitest.config.ts`'s own hard-fail check] | — | If ever unset, DB-gated tests for `isActive` filtering will skip — treat any skip here as a red flag, not the expected default (Pitfall 2). |
| `drizzle-kit` | Schema push attempt | ✓ [VERIFIED: `npx drizzle-kit --version` → v0.31.10] | 0.31.10 | Direct-SQL `@neondatabase/serverless` scripts (Pattern 1) if `db:push` TTY-blocks. |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none currently missing — `drizzle-kit push` itself is the one operation with a known, well-documented fallback (not a missing dependency, a behavioral limitation of the tool in this environment).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (repo root) — repoints `db` client at `TEST_DATABASE_URL` when set; `fileParallelism: false`; `testTimeout`/`hookTimeout` 30000ms for Neon cold-start latency |
| Quick run command | `nvm use 22 && npx vitest run tests/actions/admin-taxonomy.test.ts tests/catalog/admin-queries.test.ts` (once created) |
| Full suite command | `nvm use 22 && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMN-12 | `brand`/`category`.`isActive` column exists with correct default | integration (schema) | `npx vitest run tests/catalog/schema.test.ts` (extend existing, or new `tests/catalog/taxonomy-schema.test.ts`) | ❌ Wave 0 |
| ADMN-12 | `createCategory` admin-gates (rejects non-admin) | unit (mocked `verifyAdminSession`) | `npx vitest run tests/actions/admin-taxonomy.test.ts` | ❌ Wave 0 |
| ADMN-12 | `createCategory` generates immutable slug via `uniqueSlug`, rejects duplicate name with friendly error (D-05) | integration (DB-gated) | `npx vitest run tests/actions/admin-taxonomy.test.ts` | ❌ Wave 0 |
| ADMN-12 | `renameCategory` updates `name` only, slug unchanged (D-04) | integration (DB-gated) | same file | ❌ Wave 0 |
| ADMN-12 | `deactivateCategory`/`reactivateCategory` toggle `isActive`, do NOT touch `product.categoryId` (D-02 no-cascade) | integration (DB-gated) | same file | ❌ Wave 0 |
| ADMN-12 | `listCategoriesForAdmin` returns correct product-count aggregate (incl. zero-product category) | integration (DB-gated) | `npx vitest run tests/catalog/admin-queries.test.ts` (extend existing file) | ✅ file exists (extend) |
| ADMN-12 | `getActiveCategoryBySlug` returns `null` for unknown AND for soft-deleted slug; `[categorySlug]` route 404s on both | integration (DB-gated) + component/route test | `npx vitest run tests/catalog/queries.test.ts` (extend) | ✅ file exists (extend) |
| ADMN-12 | `listActiveCategoriesForNav` excludes soft-deleted categories (nav/home rails/`generateStaticParams`) | integration (DB-gated) | `npx vitest run tests/catalog/queries.test.ts` | ✅ file exists (extend) |
| ADMN-13 | `createBrand`/`renameBrand`/`(de)activateBrand` — same admin-gate + uniqueness + no-cascade behaviors as categories, minus slug | unit + integration (DB-gated) | `npx vitest run tests/actions/admin-taxonomy.test.ts` | ❌ Wave 0 |
| ADMN-13 | `listBrandsForAdmin` product-count aggregate | integration (DB-gated) | `npx vitest run tests/catalog/admin-queries.test.ts` | ✅ file exists (extend) |
| ADMN-13 | `getBrandsForCategory` excludes inactive brands from the facet list | integration (DB-gated) | `npx vitest run tests/catalog/queries.test.ts` | ✅ file exists (extend) |
| ADMN-12/13 | Every new action re-verifies `verifyAdminSession()` as first statement (D-10, security contract) | unit (mocked, assert throw/redirect on non-admin) | `npx vitest run tests/actions/admin-taxonomy.test.ts` | ❌ Wave 0 |
| ADMN-12/13 | Cache invalidation fires on every mutation (`revalidatePath`/`updateTag` called, mocked `next/cache`) | unit (mocked) | `npx vitest run tests/actions/admin-taxonomy.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `nvm use 22 && npx vitest run tests/actions/admin-taxonomy.test.ts` (or the specific file just touched)
- **Per wave merge:** `nvm use 22 && npm test` (full suite — 415+ tests as of Phase 9 completion)
- **Phase gate:** Full suite green before `/gsd-verify-work`, PLUS confirm `TEST_DATABASE_URL` migration (D-11) has been applied before any DB-gated test run (a skip is a red flag here per Pitfall 2, not the expected default).

### Wave 0 Gaps
- [ ] `tests/actions/admin-taxonomy.test.ts` — new file, covers ADMN-12/13 action-level behavior (admin-gate, Zod validation, uniqueness, no-cascade, cache invalidation). Follow the RED-scaffold convention seen in `tests/actions/admin-customers.test.ts` (mock `server-only`, `next/cache`, `@/lib/dal`; unresolved import against the not-yet-created action module is the correct Wave 0 red signal).
- [ ] Extend `tests/catalog/admin-queries.test.ts` — add `listCategoriesForAdmin`/`listBrandsForAdmin` cases.
- [ ] Extend `tests/catalog/queries.test.ts` — add `getActiveCategoryBySlug`/`listActiveCategoriesForNav` + extended `getBrandsForCategory` cases.
- [ ] Extend (or add) a schema test asserting `brand.is_active`/`category.is_active` exist with `DEFAULT true NOT NULL` — mirror the existing `tests/catalog/schema.test.ts` / `tests/checkout/schema.test.ts` convention.
- [ ] **Schema migration must run against BOTH `DATABASE_URL` and `TEST_DATABASE_URL` before any of the above DB-gated tests can pass** — this is not a test-file gap, it's an infrastructure precondition (D-11 `[BLOCKING]`).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | Existing `verifyAdminSession()` — no new auth surface introduced by this phase, but every new action/route must call it. |
| V3 Session Management | no | Not touched by this phase (no new session logic). |
| V4 Access Control | yes | `verifyAdminSession()` as the literal first statement in every new Server Action (D-10); dual-auth: `/admin/*` proxy redirect (UI layer) + in-action re-verification (the only layer that actually protects Server Actions, per CLAUDE.md: "The proxy cannot protect Server Actions; re-verify auth inside every admin/mutation action"). |
| V5 Input Validation | yes | Zod (`z.object(...).safeParse`) for all category/brand name inputs, mirroring `ProductInputSchema` in `admin-products.ts`. |
| V6 Cryptography | no | Not applicable — no secrets, tokens, or hashing involved in taxonomy CRUD. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Direct Server Action invocation bypassing the `/admin/*` proxy (Server Actions are POST endpoints reachable independent of page routing) | Elevation of Privilege | `verifyAdminSession()` as literal first statement in every new action — already the established, repo-wide contract (T-05-08/T-05-19 in prior phases); no new mitigation to invent, just apply consistently. |
| Race-condition duplicate name insert (two admin tabs submitting the same new category name simultaneously) | Tampering (data integrity) | DB-level `UNIQUE` constraint on `brand.name`/`category.name`/`category.slug` is the actual backstop (already exists in schema, predates this phase); the check-before-insert only improves UX, the constraint is what prevents the actual duplicate row (Pitfall 5). |
| SQL injection via category/brand name search or filter params | Tampering | All existing catalog/admin queries use Drizzle's parameterized `eq`/`ilike`/`and` operators exclusively (T-02-04 convention, verified throughout `queries.ts`/`admin-queries.ts`) — no raw string concatenation into SQL anywhere in this codebase; new queries must follow the same convention. |
| Information disclosure via raw Drizzle row returned from a Server Action | Information Disclosure | Return `ActionResult<T>` minimal DTOs only (`{success, id}` / `{success, error}`), never the full row — established convention, no PII risk here specifically (categories/brands have no sensitive fields) but consistency matters for code review / plan-checker expectations. |

## Sources

### Primary (HIGH confidence — direct inspection of this repository/environment)
- `.planning/phases/10-categories-brands-crud/10-CONTEXT.md` — locked decisions D-01..D-11
- `.planning/REQUIREMENTS.md` — ADMN-12/13 exact wording
- `.planning/STATE.md` — cross-phase decisions, PPR/cacheComponents history, prior migration deviations
- `src/lib/db/schema.ts` — exact current `brands`/`categories`/`products` table shapes and FK constraints
- `src/lib/actions/admin-products.ts` — canonical Server Action shape to mirror
- `src/lib/catalog/admin-queries.ts` — `listProductsForAdmin`/`listCustomersForAdmin` aggregate-query pattern
- `src/lib/catalog/queries.ts` — `getCatalog`/`getBrandsForCategory`/`getProduct` current implementation (including the currently-missing `isActive` filters this phase must add)
- `src/lib/dal.ts` — `verifyAdminSession()` contract
- `src/lib/utils/slug.ts` — `toSlug`/`uniqueSlug`
- `src/app/[categorySlug]/page.tsx`, `src/components/layout/SiteHeader.tsx`, `src/app/page.tsx`, `src/app/products/page.tsx`, `src/components/cart/CartEmptyState.tsx` — every hardcoded-category reference site, confirmed functional vs. cosmetic
- `src/app/admin/products/page.tsx`, `src/app/admin/customers/page.tsx`, `src/components/admin/CustomerRowActions.tsx`, `src/components/admin/ProductRowActions.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/app/admin/layout.tsx` — admin UI patterns to mirror
- `src/components/admin/OrderStatusBadge.tsx` (`ProductActivePill`) — reusable active/deactivated badge, directly reusable for categories/brands
- `src/scripts/apply-users-createdat-schema.mjs` + `-to-test-db.mjs`, `src/scripts/apply-order-schema.mjs` — exact, already-executed migration-script pattern to replicate
- `.planning/phases/03-cart/03-01-SUMMARY.md`, `.planning/phases/04-checkout-payments/04-01-SUMMARY.md` — documented `drizzle-kit push` TTY-blocking precedent and fallback
- `tests/helpers/db.ts`, `tests/actions/admin-customers.test.ts` — test isolation (`hasDatabase`/`assertTestDatabase`) and RED-scaffold conventions
- `node_modules/@neondatabase/serverless/index.d.ts` (line 795, `NeonDbError` class) — [VERIFIED] typed `.code`/`.constraint` fields on the actual installed driver
- `package.json`, `next.config.ts`, `vitest.config.ts` — installed versions, `cacheComponents: true`, test-isolation config

### Secondary (MEDIUM confidence)
- None required for this phase — no external/unverified claims were needed beyond what direct repo inspection could confirm.

### Tertiary (LOW confidence)
- General community reports about Drizzle sometimes surfacing an opaque "Failed query" error without a clean code (via WebSearch) — superseded by direct inspection of this repo's actual installed driver type declarations, which DO expose `.code`/`.constraint` (see Pitfall 5). Kept in the Pitfall as context for why the check-before-insert approach is recommended as the primary UX path regardless.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every version confirmed against files/commands already present in this environment.
- Architecture: HIGH — every pattern is a direct mirror of already-shipped, already-tested code in this same repository (Phase 5, Phase 9).
- Pitfalls: HIGH — all 6 pitfalls are grounded in either direct code inspection (Pitfalls 2-6) or 3x-repeated documented precedent in this repo's own SUMMARY files (Pitfall 1).

**Research date:** 2026-07-12
**Valid until:** 30 days (stable, no external API surface — the only expiry risk is if `drizzle-kit`/`drizzle-orm` are upgraded before this phase executes, in which case re-verify the TTY-push behavior)

## RESEARCH COMPLETE
