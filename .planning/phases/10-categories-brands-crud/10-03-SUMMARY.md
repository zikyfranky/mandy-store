# Plan 10-03 Summary — Admin + storefront read queries

**Status:** COMPLETE
**Requirements:** ADMN-12, ADMN-13
**Completed:** 2026-07-12

## What was built
**`src/lib/catalog/admin-queries.ts`** (additive):
- `listCategoriesForAdmin(): AdminCategoryRow[]` `{id,name,slug,isActive,productCount}` — leftJoin to a `GROUP BY products.categoryId` COUNT subquery, ordered by name.
- `listBrandsForAdmin(): AdminBrandRow[]` `{id,name,isActive,productCount}` — same on `products.brandId`.
- Both count ALL referencing products (ignore `products.isActive`) so the owner sees full deactivation impact (D-02/T-05-06). No pagination.

**`src/lib/catalog/queries.ts`**:
- NEW `getActiveCategoryBySlug(slug)` — active-only resolution; null for unknown OR soft-deleted (the 404 gate for `[categorySlug]`). Not cached (must reflect soft-delete immediately).
- NEW `listActiveCategoriesForNav(): NavCategory[]` — `"use cache"` + `cacheLife("hours")` + `cacheTag("categories-nav")`, so the DB-driven nav doesn't regress the PPR static shell (Pitfall 3).
- HARDENED `getCatalog` category resolution + `getBrandsForCategory` (category lookup + brands innerJoin) with `eq(categories.isActive, true)` / `eq(brands.isActive, true)` — Pitfall 4 defense-in-depth.

## Verification
- `tests/catalog/admin-queries.test.ts` + `tests/catalog/queries.test.ts`: **19/19 passed**.
- `tsc --noEmit` clean (project-wide, including all prior scaffolds now resolved).

## Deviations / fixes during execution
- The new `queries.test.ts` describe block needed its own `beforeEach(truncateCatalogTables)` (data leaked from prior blocks → duplicate-insert failures).
- `queries.test.ts` needed `vi.mock("next/cache", { cacheLife, cacheTag })` — under vitest, `"use cache"` is uncompiled so the real `cacheLife()` throws "only available with cacheComponents". Mocked to no-ops (mirrors `admin-taxonomy.test.ts`).

## Self-Check: PASSED

## Enables
Plan 10-04 (storefront decouple — consumes getActiveCategoryBySlug + listActiveCategoriesForNav) and Plan 10-05 (admin UI — consumes list queries).
