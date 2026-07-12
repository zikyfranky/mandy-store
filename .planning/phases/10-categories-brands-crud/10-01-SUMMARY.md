# Plan 10-01 Summary — Schema isActive + dual-DB push + Wave 0 scaffolds

**Status:** COMPLETE
**Requirements:** ADMN-12, ADMN-13 (foundation)
**Completed:** 2026-07-12

## What was built

1. **Schema (D-01):** Added `isActive: boolean("is_active").default(true).notNull()` to the `brands` and `categories` Drizzle tables in `src/lib/db/schema.ts` (immediately before `createdAt`, mirroring `products.isActive`). No index (small lookup tables). `tsc --noEmit` clean.
2. **[BLOCKING] dual-DB migration (D-11):** Created `src/scripts/apply-taxonomy-isactive-schema.mjs` (dev) and `...-to-test-db.mjs` (test), mirroring the Phase 9 `apply-users-createdat-schema` scripts (direct-SQL `@neondatabase/serverless`, idempotent `ADD COLUMN IF NOT EXISTS`). Ran both — **`is_active` now physically present on `brand` + `category` in BOTH `DATABASE_URL` and `TEST_DATABASE_URL`** (verified via `information_schema`; both printed `SUCCESS`).
3. **Wave 0 RED scaffolds (Task 3):**
   - NEW `tests/actions/admin-taxonomy.test.ts` — admin-gate + category/brand CRUD (D-04 slug-immutable, D-05 friendly uniqueness, D-02 no-cascade, D-09 cache invalidation). RED: `@/lib/actions/admin-taxonomy` does not exist yet (suite fails to load).
   - NEW `tests/catalog/admin-queries.test.ts` — `listCategoriesForAdmin`/`listBrandsForAdmin` product-count aggregate incl. zero-product entity. RED: named exports undefined.
   - EXTENDED `tests/catalog/schema.test.ts` — static `isActive` column assertions (GREEN now) + DB round-trip default-true (DB-gated).
   - EXTENDED `tests/catalog/queries.test.ts` — `getActiveCategoryBySlug` / `listActiveCategoriesForNav` / inactive-brand exclusion. RED until Plan 10-03.

## Key files
- Created: `src/scripts/apply-taxonomy-isactive-schema.mjs`, `src/scripts/apply-taxonomy-isactive-schema-to-test-db.mjs`, `tests/actions/admin-taxonomy.test.ts`, `tests/catalog/admin-queries.test.ts`
- Modified: `src/lib/db/schema.ts`, `tests/catalog/schema.test.ts`, `tests/catalog/queries.test.ts`

## Deviations
- Task 1 acceptance criterion expected `grep` count 3 for the `is_active` column shape; actual is **4** because `variants` already carries the same column (planner counted only `products`). Invariant satisfied: both `brands` and `categories` now have it; tsc clean.

## Self-Check: PASSED
- is_active live in both DBs (SUCCESS on both scripts); scaffolds RED-by-design; schema static assertions green; each task committed atomically.

## Enables
Wave 2 (10-02 actions, 10-03 queries) can now turn the scaffolds green against a live column.
