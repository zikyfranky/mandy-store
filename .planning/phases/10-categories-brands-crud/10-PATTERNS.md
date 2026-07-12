# Phase 10: Categories & Brands CRUD - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 11 (create/modify)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/lib/db/schema.ts` (add `isActive` to `brands`/`categories`) | model | CRUD | same file, `products.isActive` column (line 150) | exact |
| `src/lib/actions/admin-taxonomy.ts` (or `admin-categories.ts` + `admin-brands.ts`) | service (server action) | CRUD | `src/lib/actions/admin-products.ts` | exact |
| `src/lib/catalog/admin-queries.ts` (add `listCategoriesForAdmin`, `listBrandsForAdmin`) | service (query) | CRUD | same file, `listProductsForAdmin` (lines 80-155) | exact |
| `src/app/admin/categories/page.tsx` | route (admin list page) | request-response | `src/app/admin/products/page.tsx` | exact |
| `src/app/admin/brands/page.tsx` | route (admin list page) | request-response | `src/app/admin/customers/page.tsx` (single-table, no filter chips) | exact |
| `src/components/admin/CategoryRowActions.tsx` (or `TaxonomyRowActions.tsx`) | component (client island) | event-driven | `src/components/admin/ProductRowActions.tsx` | exact |
| `src/components/admin/BrandRowActions.tsx` | component (client island) | event-driven | `src/components/admin/CustomerRowActions.tsx` (inline-edit + confirm-dialog toggle) | role-match |
| `src/components/admin/TaxonomyActivePill.tsx` (or reuse `ProductActivePill`) | component | transform | `src/components/admin/OrderStatusBadge.tsx` → `ProductActivePill` (lines 145-157) | exact |
| `src/components/admin/AdminSidebar.tsx` (add nav items) | component (nav) | request-response | same file, `NAV_ITEMS` (lines 12-17) | exact |
| `src/app/[categorySlug]/page.tsx` | route (storefront) | CRUD (read) | same file — replace hardcoded `VALID_CATEGORY_SLUGS`/`CATEGORY_NAMES` with DB lookup | n/a (self-modify) |
| `src/components/layout/SiteHeader.tsx` | component (nav) | CRUD (read) | same file — replace hardcoded `NAV` with DB-driven active categories | n/a (self-modify) |
| `src/app/page.tsx` (`RAILS`) | route (storefront) | CRUD (read) | same file — replace hardcoded `RAILS` with DB-driven active categories | n/a (self-modify) |
| `src/lib/catalog/queries.ts` (`getBrandsForCategory`) | service (query) | CRUD | same file — add `eq(brands.isActive, true)` filter (lines 231-255) | n/a (self-modify) |

## Pattern Assignments

### `src/lib/db/schema.ts` (model, CRUD)

**Analog:** same file — `products.isActive` (line 150) and `variants.isActive` (line 198).

**IMPORTANT naming note:** CONTEXT.md refers to `brand`/`category` tables, but the actual exported Drizzle symbols are **plural**: `brands` and `categories` (table names `"brand"` / `"category"` are singular strings, but the JS/TS export identifiers used everywhere else in the codebase — `admin-products.ts`, `queries.ts` — are `brands`/`categories`). New code MUST import `brands`/`categories`, not `brand`/`category`.

**Pattern to copy** (lines 128-141, add `isActive` column):
```typescript
export const brands = pgTable("brand", {
  id:        text("id").primaryKey(),              // crypto.randomUUID()
  name:      text("name").notNull().unique(),
  isActive:  boolean("is_active").default(true).notNull(),   // NEW (D-01)
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})

export const categories = pgTable("category", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull().unique(),
  slug:      text("slug").notNull().unique(),       // "electronics", "watches", "phones"
  isActive:  boolean("is_active").default(true).notNull(),   // NEW (D-01)
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})
```
`boolean` is already imported at the top of the file (line 6) — no new import needed. No index needed (small lookup tables, no query filters on isActive at scale — matches `storeSettings`/`gatewayCredentials` style, not the indexed `products`/`variants`).

**Blocking follow-up (D-11):** after editing schema.ts, `drizzle-kit push` must run against BOTH `DATABASE_URL` and `TEST_DATABASE_URL` before verification (see CLAUDE.md + 03-01/04-01 SUMMARYs for the direct-SQL `@neondatabase/serverless` TTY-prompt fallback).

---

### `src/lib/actions/admin-taxonomy.ts` (service/server-action, CRUD)

**Analog:** `src/lib/actions/admin-products.ts` (whole file — createProduct/updateProduct/deactivateProduct/reactivateProduct are the direct templates for createCategory/renameCategory/deactivateCategory/reactivateCategory and the brand equivalents).

**File header + imports pattern** (lines 1-26):
```typescript
"use server"
import "server-only"
// src/lib/actions/admin-taxonomy.ts
// Admin category/brand Server Actions (Phase 10).
//
// Security contracts (mirrors admin-products.ts):
//   - verifyAdminSession() is the literal FIRST statement in every action.
//   - Every mutation invalidates the storefront (revalidatePath) — over-invalidating is
//     harmless (D-09).
//   - Soft-delete only: deactivate sets isActive=false; NO cascade to products (D-02).

import { z } from "zod"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { categories, brands } from "@/lib/db/schema"
import { uniqueSlug } from "@/lib/utils/slug"

type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }

function firstZodError(err: z.ZodError, fallback = "Invalid input"): string {
  return err.issues[0]?.message ?? fallback
}

const NameInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
})
```

**Core CRUD pattern — createCategory** (mirrors `createProduct`, lines 75-108, with a pre-check uniqueness read instead of a raw catch — see D-05 note below):
```typescript
export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  await verifyAdminSession() // D-10 — FIRST statement

  const parsed = NameInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) }
  }

  try {
    // D-05: friendly pre-check instead of catching a raw unique-violation — mirrors the
    // existing convention in src/lib/actions/auth.ts (existingByEmail/existingByUsername).
    const existing = await db.query.categories.findFirst({
      where: eq(categories.name, parsed.data.name),
      columns: { id: true },
    })
    if (existing) {
      return { success: false, error: "A category with that name already exists" }
    }

    const id = crypto.randomUUID()
    const slug = await uniqueSlug(parsed.data.name, async (s) => {
      const existingSlug = await db.query.categories.findFirst({
        where: eq(categories.slug, s),
        columns: { id: true },
      })
      return !!existingSlug
    })

    await db.insert(categories).values({ id, name: parsed.data.name, slug })

    revalidatePath("/") // D-09
    revalidatePath(`/${slug}`)
    return { success: true, id }
  } catch (err) {
    console.error("[admin-taxonomy] createCategory failed:", err)
    return { success: false, error: "Something went wrong creating the category." }
  }
}
```

**Deactivate/reactivate pattern** (mirrors `deactivateProduct`/`reactivateProduct`, lines 150-203 — **no variant-style cascade**, per D-02):
```typescript
export async function deactivateCategory(id: string): Promise<ActionResult> {
  await verifyAdminSession() // D-10 — FIRST statement
  try {
    const [updated] = await db
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, id))
      .returning({ slug: categories.slug })

    // D-02: NO cascade to products.isActive — products keep their FK, unlike deactivateProduct's
    // cascade to variants. This is the one deliberate divergence from the admin-products.ts analog.

    revalidatePath("/") // D-09
    if (updated?.slug) revalidatePath(`/${updated.slug}`)

    if (!updated) return { success: false, error: "Category not found" }
    return { success: true }
  } catch (err) {
    console.error("[admin-taxonomy] deactivateCategory failed:", err)
    return { success: false, error: "Something went wrong deactivating the category." }
  }
}
// reactivateCategory: identical shape with isActive: true (mirrors reactivateProduct, lines 183-203)
```

**Brand equivalents** (`createBrand`, `renameBrand`, `deactivateBrand`, `reactivateBrand`) are the same shape minus the slug logic (brands have no slug, per D-04) — mirror `createCategory` above with the slug block removed, and use `revalidatePath("/")` only (brands have no dedicated storefront route to invalidate, only category pages that surface brand filters).

**Cache invalidation note (D-09):** `admin-products.ts` uses `updateTag('product-<slug>')` because PDPs use `"use cache"` with product-scoped tags. Categories/brands feed the storefront via plain `getCatalog`/`getBrandsForCategory` reads (no `"use cache"` tags currently defined on those functions per the grep of `src/lib/catalog/queries.ts` — no `unstable_cache`/`"use cache"` directive found there), so `revalidatePath` is the correct/sufficient primitive here, not `updateTag`. If a later pass adds `"use cache"` to `getCatalog`, add matching tags then.

---

### `src/lib/catalog/admin-queries.ts` (service/query, CRUD — additive, do not touch existing exports)

**Analog:** same file, `listProductsForAdmin` (lines 60-155) — the aggregate-subquery + parallel count pattern.

**Core pattern — `listCategoriesForAdmin`** (mirrors lines 100-155, swap the variant aggregate for a product-count aggregate):
```typescript
export type AdminCategoryRow = {
  id: string
  name: string
  slug: string
  isActive: boolean
  productCount: number
}

export async function listCategoriesForAdmin(): Promise<AdminCategoryRow[]> {
  const productCountSq = db
    .select({
      categoryId: products.categoryId,
      productCount: sql<number>`COUNT(*)`.as("product_count"),
    })
    .from(products)
    .groupBy(products.categoryId)
    .as("category_product_count_sq")

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
    .orderBy(categories.name)

  return rows.map((r) => ({ ...r, productCount: Number(r.productCount ?? 0) }))
}
// listBrandsForAdmin: identical shape, joined on products.brandId instead of categoryId, no slug field.
```
Needs new imports at the top of `admin-queries.ts`: `categories`, `brands` from `@/lib/db/schema` (not currently imported there — only `products`, `variants`, `orders`, `orderStatusEnum`, `users` are, per lines 12-18).

No pagination needed here (unlike `listProductsForAdmin`/`listCustomersForAdmin`) — categories/brands are a small, bounded, unpaginated admin list (matches `listOrdersForAdmin`'s scale assumption, not the `ADMIN_PAGE_SIZE`-paginated pattern), per Claude's Discretion in D-CONTEXT and the "no category hierarchy/sort order" scope boundary.

---

### `src/app/admin/categories/page.tsx` / `src/app/admin/brands/page.tsx` (route, request-response)

**Analog:** `src/app/admin/customers/page.tsx` (whole file) — single-table list, no status filter chips (categories/brands don't need the `all/active/deactivated` URL-chip pattern from `admin/products/page.tsx` since D-08 discretion favors a simpler always-show-all list with an active/inactive pill per row, mirroring how customers shows role/verified pills without filter chips).

**Structure to copy** (mirrors lines 1-20, 38-53, 100-146 of `admin/customers/page.tsx`):
```typescript
import { Suspense } from "react"
import { listCategoriesForAdmin } from "@/lib/catalog/admin-queries"
import { TaxonomyActivePill } from "@/components/admin/TaxonomyActivePill"
import { CategoryRowActions } from "@/components/admin/CategoryRowActions"
// no searchParams Promise needed if unpaginated — otherwise mirror ProductsPageProps shape

async function CategoriesContent() {
  const rows = await listCategoriesForAdmin()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Categories</h1>
        {/* Inline "add category" form/row — Claude's Discretion (D-08): modal vs inline row */}
      </div>
      <div className="rounded-2xl bg-surface border border-border overflow-x-auto">
        <table className="w-full text-sm">
          {/* thead: Name | Slug | Products | Status | Actions — mirrors customers thead, lines 102-111 */}
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-semibold text-foreground">{c.name}</td>
                <td className="px-5 py-3 text-muted">{c.slug}</td>
                <td className="px-5 py-3 text-foreground">{c.productCount}</td>
                <td className="px-5 py-3"><TaxonomyActivePill isActive={c.isActive} /></td>
                <td className="px-5 py-3"><CategoryRowActions category={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AdminCategoriesPage() {
  return <Suspense fallback={/* mirrors CustomersSkeleton, lines 148-160 */}><CategoriesContent /></Suspense>
}
```
Row-level auth note (copy verbatim from `admin/products/page.tsx` lines 7-11): this page does NOT re-call `verifyAdminSession` itself — `admin/layout.tsx` already does (layer 2); every mutation the row-action islands invoke independently re-verifies as its own first statement.

---

### `src/components/admin/CategoryRowActions.tsx` / `BrandRowActions.tsx` (component, event-driven)

**Analog:** `src/components/admin/ProductRowActions.tsx` (whole file) for the deactivate/reactivate + confirm-dialog shape; `src/components/admin/CustomerRowActions.tsx` (lines 1-33, 62-87) for the inline-edit-then-confirm pattern if rename is modal-based.

**Core pattern to copy** (mirrors `ProductRowActions` lines 9-59 — `useTransition` + router.refresh()):
```typescript
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { renameCategory, deactivateCategory, reactivateCategory } from "@/lib/actions/admin-taxonomy"

export function CategoryRowActions({ category }: { category: { id: string; name: string; isActive: boolean } }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // ... rename: inline text input + save button, or a confirm-style modal (Claude's Discretion)
  // ... deactivate: confirm dialog (destructive per UI-SPEC "destructive actions always confirm")
  // ... reactivate: fires immediately (reversible), mirrors handleReactivate lines 35-46
  function handleDeactivateConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await deactivateCategory(category.id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }
  // full confirm-dialog JSX: copy ProductRowActions lines 115-156 verbatim, swap product→category copy
}
```

---

### `src/components/admin/TaxonomyActivePill.tsx` (component, transform)

**Analog:** `src/components/admin/OrderStatusBadge.tsx` → exported `ProductActivePill` (lines 145-157).

**Pattern to copy verbatim** (rename only):
```typescript
const BADGE_SHAPE =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold"

export function TaxonomyActivePill({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className={`${BADGE_SHAPE} bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30`}>
      Active
    </span>
  ) : (
    <span className={`${BADGE_SHAPE} bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700`}>
      Deactivated
    </span>
  )
}
```
Alternative: just import and reuse `ProductActivePill` directly from `@/components/admin/OrderStatusBadge` (same isActive→Active/Deactivated semantics) instead of duplicating — planner's discretion, but note the icon-having version there (`CheckCircleIcon`/`XCircleIcon`) may need those two icon helper functions copied too if icons are wanted.

---

### `src/components/admin/AdminSidebar.tsx` (nav, request-response)

**Analog:** same file, `NAV_ITEMS` (lines 12-17).

**Pattern to copy** (add two entries):
```typescript
const NAV_ITEMS = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },   // NEW
  { href: "/admin/brands", label: "Brands" },            // NEW
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
]
```
Active-route styling (`isActive = pathname === item.href || pathname.startsWith(item.href + "/")`, line 38) needs no change — it already generalizes to any new href.

---

### `src/app/[categorySlug]/page.tsx` (route, storefront decouple — D-03)

**Analog:** same file's own hardcoded block (lines 18-41) — replace with a DB lookup, closest live analog for "resolve slug → row, 404 if missing/inactive" is `getCatalog`'s category-resolution block in `src/lib/catalog/queries.ts` (lines 65-76).

**Current hardcoded pattern to remove** (lines 18-25, 39-41, 60-66):
```typescript
const VALID_CATEGORY_SLUGS = ["electronics", "watches", "phones"] as const
const CATEGORY_NAMES: Record<string, string> = { electronics: "Electronics", watches: "Watches", phones: "Phones" }
type CategorySlug = (typeof VALID_CATEGORY_SLUGS)[number]

export async function generateStaticParams() {
  return VALID_CATEGORY_SLUGS.map((categorySlug) => ({ categorySlug }))
}
// ...
if (!(VALID_CATEGORY_SLUGS as readonly string[]).includes(categorySlug)) {
  notFound()
}
const validSlug = categorySlug as CategorySlug
const categoryName = CATEGORY_NAMES[validSlug]
```

**Replacement pattern** (DB-driven, active-only — mirrors the `eq(categories.slug, s)` lookup already used in `getCatalog`, `src/lib/catalog/queries.ts` lines 68-70, plus the `eq(products.isActive, true)`-style active filter used throughout that same file):
```typescript
// generateStaticParams: query active categories instead of a static array
export async function generateStaticParams() {
  const rows = await db.query.categories.findMany({
    where: eq(categories.isActive, true),
    columns: { slug: true },
  })
  return rows.map((c) => ({ categorySlug: c.slug }))
}

// Inside CategoryContent — resolve + validate against the DB, active only:
const category = await db.query.categories.findFirst({
  where: and(eq(categories.slug, categorySlug), eq(categories.isActive, true)),
})
if (!category) notFound()
const categoryName = category.name
```
Since `getCatalog` (already imported in this file) does its own internal `categories.slug` lookup, the planner should decide whether to (a) add a preliminary "does this slug resolve to an active category" check here for the `notFound()`/metadata-name use case, or (b) extend `getCatalog` to return a `categoryFound: boolean`/`categoryName` field so there's a single DB round trip. Either is consistent with D-03; both need the same `eq(categories.isActive, true)` filter added to `getCatalog`'s existing category-resolution block (`src/lib/catalog/queries.ts` lines 68-70) — currently that block has NO active filter, so an inactive category's slug would currently still resolve there. **This is the one required non-additive edit to `getCatalog`.**

`generateMetadata` (lines 43-50) needs the same DB lookup swapped in place of `CATEGORY_NAMES[categorySlug]`.

---

### `src/components/layout/SiteHeader.tsx` (nav, storefront decouple — D-03)

**Analog:** same file's `NAV` constant (lines 10-15) — becomes a Server Component prop fed by a new query, since `SiteHeader` itself is already a plain Server Component (no `"use client"`, confirmed — only `SearchBar`/`CartIconButton` are client islands within it).

**Current hardcoded pattern:**
```typescript
const NAV = [
  { href: "/electronics", label: "Electronics" },
  { href: "/watches", label: "Watches" },
  { href: "/phones", label: "Phones" },
  { href: "/products", label: "All Products" },
]
```
**Replacement:** add a new `getActiveCategoriesForNav()` (or reuse a broadened `getBrandsForCategory`-style helper) in `src/lib/catalog/queries.ts` returning `{ slug, name }[]` filtered `eq(categories.isActive, true)`, ordered by name; call it from wherever `SiteHeader` is rendered (likely the root layout) and pass as a prop, OR call it directly inside `SiteHeader` since it's already a Server Component with no props-drilling constraint today (`initialCount` is its only current prop, line 17-20). "All Products" stays a static link (`/products`), not DB-driven.

---

### `src/app/page.tsx` (`RAILS`, storefront decouple — D-03)

**Analog:** same file's `RAILS` constant (lines 20-24), consumed at line 82 (`RAILS.map((rail) => getCatalog({ categorySlug: rail.slug, ...`).

**Replacement pattern:** fetch active categories first (same new query as SiteHeader), then map to rails, e.g.:
```typescript
const activeCategories = await getActiveCategoriesForNav() // NEW query, ordered/limited as desired
const rails = activeCategories.map((c) => ({ title: `New in ${c.name}`, slug: c.slug }))
const results = await Promise.all(rails.map((rail) => getCatalog({ categorySlug: rail.slug, sort: "newest", page: 1 })))
```
Note this changes rail *titles* from hand-tuned copy ("Latest Phones", "Top Watches") to a generic template — flag for planner/UAT: acceptable per D-03's "home page category sections should also render from active categories," but the bespoke copy is lost. Alternative: keep the 3 existing curated `RAILS` entries as a fallback/cap and only add NEW categories beyond those three generically — Claude's Discretion, not locked.

---

## Shared Patterns

### Dual-layer admin auth (D-10)
**Source:** `src/lib/dal.ts` lines 52-60 (`verifyAdminSession`), applied via `src/app/admin/layout.tsx` lines 13-16 (layer 1, page-level) + every Server Action's first statement (layer 2).
**Apply to:** `admin-taxonomy.ts` (every exported action), `admin/categories/page.tsx`, `admin/brands/page.tsx` (layout already covers these — no extra call needed in the page itself, matching `admin/products/page.tsx`'s comment at lines 7-11).
```typescript
export async function verifyAdminSession(): Promise<SessionUser> {
  const user = await verifySession()
  if (user.role !== "admin") redirect("/")
  return user
}
```

### ActionResult DTO + Zod-first validation
**Source:** `src/lib/actions/admin-products.ts` lines 28-36.
**Apply to:** every `admin-taxonomy.ts` export.
```typescript
type ActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string }
function firstZodError(err: z.ZodError, fallback = "Invalid input"): string {
  return err.issues[0]?.message ?? fallback
}
```

### Friendly-uniqueness pre-check (D-05)
**Source:** `src/lib/actions/auth.ts` lines 51-65 (`existingByEmail`/`existingByUsername` pre-check pattern) — NOT a DB-exception catch (no `23505`/`unique_violation` handling exists anywhere in the current action files, confirmed via grep of `src/lib/actions/*.ts`).
**Apply to:** `createCategory`, `renameCategory`, `createBrand`, `renameBrand` — pre-check `db.query.categories.findFirst({ where: eq(categories.name, name) })` (excluding self-id on rename) before insert/update; return `{ success: false, error: "A category with that name already exists" }` on hit. The generic `try/catch` block still wraps the whole action as a second line of defense against a race-condition duplicate insert (belt-and-suspenders — the catch's generic message is acceptable as a rare-race fallback, per D-06's "generic error message" contract).

### Cache invalidation (D-09)
**Source:** `src/lib/actions/admin-products.ts` (`updateTag`, lines 22, 102) — but for taxonomy, use `revalidatePath` since `getCatalog`/`getBrandsForCategory` have no `"use cache"` tags today (confirmed: no `unstable_cache`/`"use cache"` directive in `src/lib/catalog/queries.ts`).
**Apply to:** every taxonomy mutation — `revalidatePath("/")` + `revalidatePath("/<slug>")` for categories; `revalidatePath("/")` for brands (brand slugs don't exist as routes, but brand-name filters appear on every category page, so also consider `revalidatePath("/[categorySlug]", "page")` dynamic-segment invalidation if the planner wants full correctness across all category pages at once).

### Row-actions client island shape (event-driven)
**Source:** `src/components/admin/ProductRowActions.tsx` (whole file) + `src/components/admin/CustomerRowActions.tsx` (whole file).
**Apply to:** `CategoryRowActions.tsx`, `BrandRowActions.tsx`.
```typescript
"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
// destructive actions (deactivate) => confirm dialog (role="dialog", aria-modal, backdrop onClick to dismiss)
// reversible actions (reactivate, rename) => fire immediately via startTransition, then router.refresh()
// errors surface inline via role="alert" text-stock-out
```

### Admin list page shell (request-response)
**Source:** `src/app/admin/customers/page.tsx` (whole file, 169 lines) — Suspense-wrapped inner async component, skeleton fallback, no page-level `verifyAdminSession` call (layout already covers it).
**Apply to:** `admin/categories/page.tsx`, `admin/brands/page.tsx`.

## No Analog Found

None. All 11 new/modified files have a strong same-role, same-or-better-data-flow analog already in the codebase. The only genuinely novel piece is the **unpaginated, unfiltered admin list** shape (categories/brands have no `ADMIN_PAGE_SIZE`/status-chip precedent as clean as products/customers) — flagged inline above as Claude's Discretion, grounded in `listOrdersForAdmin`'s simpler unstatused shape as the nearest partial analog.

## Metadata

**Analog search scope:** `src/lib/actions/`, `src/lib/catalog/`, `src/lib/db/`, `src/app/admin/`, `src/components/admin/`, `src/app/[categorySlug]/`, `src/components/layout/`, `src/app/page.tsx`, `src/app/products/page.tsx`, `src/components/cart/CartEmptyState.tsx`, `tests/admin/`, `tests/actions/`.
**Files scanned:** 20 read in full/targeted excerpts (admin-products.ts, admin-queries.ts, schema.ts, AdminSidebar.tsx, admin/products/page.tsx, admin/customers/page.tsx, slug.ts, dal.ts, CustomerRowActions.tsx, ProductRowActions.tsx, RoleBadge.tsx, OrderStatusBadge.tsx (excerpt), admin/layout.tsx, [categorySlug]/page.tsx, SiteHeader.tsx, catalog/queries.ts, app/page.tsx (excerpt), auth.ts (excerpt), admin-customers.ts (grep), tests/admin/products.test.ts + tests/actions/admin-customers.test.ts (existence check for test-file-org convention)).
**Pattern extraction date:** 2026-07-12

---

*Phase: 10-categories-brands-crud*
*Pattern map generated from: 10-CONTEXT.md + live codebase read*
