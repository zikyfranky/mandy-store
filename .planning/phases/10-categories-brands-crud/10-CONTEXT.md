# Phase 10: Categories & Brands CRUD - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning
**Source:** Direct steering (user: "keep it moving, delete should be soft") + codebase-grounded defaults in place of a full /gsd-discuss-phase pass.

<domain>
## Phase Boundary

The store owner can administer the two catalog taxonomy entities — **categories** and **brands** — from the admin panel (`/admin/*`), reusing the Phase 5 admin shell + `verifyAdminSession()` dual-auth and the Phase 5 product-CRUD conventions (Server Action shape, `ActionResult` DTOs, `uniqueSlug`, `updateTag`/`revalidatePath` cache invalidation).

Capabilities delivered:
- **Create** a category (name → auto slug) and a brand (name).
- **Read** — admin list pages for categories and brands, each showing name, slug (categories), product count, and active status.
- **Update** — rename a category/brand.
- **Soft-delete + restore** — deactivate/reactivate, never a hard row delete.

**In scope but easy to miss:** because category CRUD is pointless if the storefront can't see new categories, this phase must **decouple the storefront category taxonomy from its hardcoded slug lists** so that active categories are browsable and soft-deleted ones disappear (see D-03).

**Not in scope:** product↔category/brand reassignment tooling (admin already reassigns per-product in the existing product editor); merging entities; category hierarchy/nesting; brand logos/images; per-category images or descriptions.
</domain>

<decisions>
## Implementation Decisions

### Deletion semantics (LOCKED by user)
- **D-01 — Soft-delete both entities.** Add `isActive boolean NOT NULL DEFAULT true` to the `brand` and `category` tables. "Delete" = set `isActive=false`; a **reactivate** action restores it. Mirrors the Phase 5 `deactivateProduct`/`reactivateProduct` pattern. Rationale: `product.categoryId` and `product.brandId` are `.notNull().references()` hard FKs, so a hard delete of an in-use row is impossible anyway, and soft-delete preserves referential + historical integrity.
- **D-02 — No cascade to products.** Deactivating a category/brand does NOT deactivate its products (unlike product→variants). Products keep their FK. The admin list surfaces the **product count** per entity so the owner sees impact before deactivating. Reassigning those products is done per-product in the existing product editor (out of scope here).

### Storefront decoupling (REQUIRED for category CRUD to be meaningful)
- **D-03 — DB-drive the category taxonomy.** Replace the hardcoded `VALID_CATEGORY_SLUGS` / `CATEGORY_NAMES` in `src/app/[categorySlug]/page.tsx` (and `generateStaticParams`) with a DB lookup of **active** categories: an unknown/inactive slug → `notFound()`; a newly-created active category is browsable at `/<slug>`. Update the storefront category nav in `src/components/layout/SiteHeader.tsx` to list active categories from the DB. Home page (`src/app/page.tsx`) category sections should also render from active categories. Brand filters already come from the DB per category (`getBrandsForCategory`) — extend those queries to exclude inactive brands.

### Fields & identity
- **D-04 — Category slug is set at creation, immutable thereafter.** Generated from the name via `uniqueSlug`. Renaming updates `name` only (keeps existing URLs/bookmarks stable — same choice as products). Brands have no slug (unchanged).
- **D-05 — Uniqueness.** `name` is already `UNIQUE` on both tables; `category.slug` is `UNIQUE`. Actions must catch unique-violation and return a friendly `ActionResult` error ("A category with that name already exists"), not a 500.

### Reuse & consistency
- **D-06 — Server Actions mirror `admin-products.ts` exactly:** `"use server"` + `"server-only"`, `verifyAdminSession()` as the literal FIRST statement (D-02/T-05-08 security contract), Zod parse, `ActionResult<T>` return DTOs (never a raw Drizzle row), `crypto.randomUUID()` ids, try/catch → generic error message + `console.error`. New file: `src/lib/actions/admin-taxonomy.ts` (or `admin-categories.ts` + `admin-brands.ts` — planner's discretion).
- **D-07 — Admin read queries** live alongside `src/lib/catalog/admin-queries.ts` (e.g. `listCategoriesForAdmin`, `listBrandsForAdmin` with product-count aggregate — mirror `listProductsForAdmin`).
- **D-08 — Admin UI** mirrors the Phase 5 products list: two new routes `/admin/categories` and `/admin/brands` (list + inline create/rename/deactivate), added to `src/components/admin/AdminSidebar.tsx` nav. Client-island row actions mirror the existing products list / `CustomerRowActions` pattern.
- **D-09 — Cache invalidation.** Every taxonomy mutation invalidates the affected storefront surfaces (`revalidatePath('/')`, `revalidatePath('/<slug>')`, and any `use cache` tags the catalog relies on for category/brand listings). Follow the existing `updateTag`/`revalidatePath` convention — over-invalidating is harmless.

### Security
- **D-10 — Dual-auth throughout.** `/admin/*` is already proxy-protected; every new action re-verifies `verifyAdminSession()` first; every new admin page/query runs server-side; no taxonomy write is reachable without admin role. No PII involved.

### Schema push (BLOCKING)
- **D-11 — `isActive` columns require a schema push to BOTH databases** (dev `DATABASE_URL` + `TEST_DATABASE_URL`) before verification, per CLAUDE.md + the Phase 1/2/4 pattern. drizzle-kit push may need the direct-SQL `@neondatabase/serverless` fallback if a TTY prompt blocks it (see 03-01/04-01 SUMMARYs). This is a `[BLOCKING]` task.

### Claude's Discretion
- Exact file split (one `admin-taxonomy.ts` vs two files); whether create/rename happen inline in the list vs a modal; precise cache-tag names; test file organization. Planner + pattern-mapper decide, grounded in the Phase 5 analogs.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & data
- `src/lib/db/schema.ts` — `brand` (id/name/createdAt), `category` (id/name/slug/createdAt), `product` (notNull FKs to both), relations. Add `isActive` to brand + category here.
- `src/scripts/seed-catalog.ts` — how categories/brands are currently seeded (Electronics/Watches/Phones + brands).

### Server Action + query analogs (mirror these)
- `src/lib/actions/admin-products.ts` — the canonical action shape (verifyAdminSession-first, Zod, ActionResult, uniqueSlug, updateTag, deactivate/reactivate soft-delete).
- `src/lib/catalog/admin-queries.ts` — `listProductsForAdmin` (product-count/aggregate + admin read pattern).
- `src/lib/dal.ts` — `verifyAdminSession()`.
- `src/lib/utils/slug.ts` — `uniqueSlug`.

### Admin UI analogs
- `src/app/admin/layout.tsx`, `src/components/admin/AdminSidebar.tsx` — shell + nav.
- `src/app/admin/products/page.tsx` — admin list-page pattern.
- `src/app/admin/customers/page.tsx` + its `CustomerRowActions` island — row-action island pattern.

### Storefront coupling to decouple (D-03)
- `src/app/[categorySlug]/page.tsx` — hardcoded `VALID_CATEGORY_SLUGS`/`CATEGORY_NAMES` + `generateStaticParams`.
- `src/components/layout/SiteHeader.tsx`, `src/app/page.tsx`, `src/app/products/page.tsx`, `src/components/cart/CartEmptyState.tsx` — other hardcoded category references.
- `src/lib/catalog/queries.ts` — `getCatalog`, `getBrandsForCategory` (filter inactive brands/categories).

### Project rules
- `./CLAUDE.md` — Next.js 16 `proxy.ts`, re-verify auth in every action, dual-DB schema push, test isolation.
</canonical_refs>

<specifics>
## Specific Ideas

- Two admin list pages: `/admin/categories`, `/admin/brands`. Each row: name, slug (categories), product count, active badge, and actions (rename, deactivate/reactivate).
- New Server Actions (admin-gated): `createCategory`, `renameCategory`, `deactivateCategory`, `reactivateCategory`, and the brand equivalents.
- New admin read queries: `listCategoriesForAdmin`, `listBrandsForAdmin` (with `COUNT(product)` per entity).
- `[categorySlug]` route resolves the category name/validity from the DB (active only).
</specifics>

<deferred>
## Deferred Ideas

- Product↔category/brand bulk reassignment UI.
- Category hierarchy / nesting / sort order.
- Brand logos, category images/descriptions.
- Merging two categories/brands into one.
</deferred>

---

*Phase: 10-categories-brands-crud*
*Context gathered: 2026-07-12 via direct steering + codebase grounding (soft-delete locked by user)*
