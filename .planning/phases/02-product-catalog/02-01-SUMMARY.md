---
phase: 02-product-catalog
plan: "01"
subsystem: catalog-schema
tags: [schema, drizzle, neon, seed, testing, catalog]
dependency_graph:
  requires: [phase-01-foundation]
  provides: [catalog-tables, catalog-seed, wave0-tests]
  affects: [phase-02-plans-02-03-04, phase-03-cart, phase-04-checkout]
tech_stack:
  added: [slugify@1.6.9]
  patterns: [drizzle-relational-api, flexible-variant-model, fk-safe-truncation, onConflictDoNothing-idempotency]
key_files:
  created:
    - src/lib/utils/slug.ts
    - src/scripts/seed-catalog.ts
    - tests/catalog/schema.test.ts
    - tests/catalog/queries.test.ts
    - tests/catalog/variant-resolver.test.ts
  modified:
    - src/lib/db/schema.ts
    - tests/helpers/db.ts
    - package.json
decisions:
  - "Array-return extra-config style (table) => [...] used for Phase 2 tables; existing tables keep object-return style (both valid in drizzle-orm 0.45.2)"
  - "db:push error on processed_webhook_events_id_unique is benign — constraint already existed from Phase 1; all 8 catalog tables were created successfully"
  - "Seed produces 29 variants across 6 products: includes OOS (stock=0) and low-stock (stock<=5) variants per D-05 spec"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-11T18:30:00Z"
  tasks_completed: 3
  files_created: 5
  files_modified: 3
---

# Phase 02 Plan 01: Catalog Schema + Seed Summary

## One-liner

8-table flexible variant catalog schema (brands/categories/products/productImages/productOptions/optionValues/variants/variantOptionValues) pushed to Neon with relations, realistic 6-product seed across 3 categories (29 variants, NGN kobo pricing), and Wave 0 test scaffold.

## What Was Built

### Task 1: Catalog tables + relations added to Drizzle schema (commit 5c09c97)

Extended `src/lib/db/schema.ts` with 8 new `pgTable` exports and their `relations()` for the db.query relational API:

- `brands` (D-02): id, name (unique), createdAt
- `categories` (D-03): id, name (unique), slug (unique), createdAt
- `products` (D-08): id, name, slug (unique — canonical URL key), description, categoryId FK, brandId FK, isActive, createdAt, updatedAt; with 3 indexes (category, brand, slug)
- `productImages`: id, productId FK (cascade), url, altText, position, isPrimary
- `productOptions` (D-01): id, productId FK (cascade), name, position; unique(productId, name)
- `optionValues` (D-01): id, productOptionId FK (cascade), value, position; unique(productOptionId, value)
- `variants` (D-01/D-04): id, productId FK (cascade), sku (unique nullable), priceKobo (integer NGN minor units), stock (integer — Phase 4 atomic decrement target), imageUrl (D-19), isActive, createdAt; with index on productId
- `variantOptionValues`: variantId FK (cascade), optionValueId FK (cascade); compound PK

Relations registered: brandsRelations, categoriesRelations, productsRelations, productImagesRelations, productOptionsRelations, optionValuesRelations, variantsRelations, variantOptionValuesRelations — all traversable via db.query.*

### Task 2: Slug util, seed script, test scaffold (commit 73eddb6)

- `src/lib/utils/slug.ts`: `toSlug()` (slugify wrapper) + `uniqueSlug()` (collision-increment async helper)
- `src/scripts/seed-catalog.ts`: Idempotent `onConflictDoNothing()` seed; 6 products across Electronics/Watches/Phones, 4 brands (Samsung/Apple/Sony/Casio), 29 variants with realistic NGN kobo prices, OOS (stock=0) and low-stock (stock≤5) variants, picsum.photos image URLs
- `package.json`: added `seed:catalog` script + slugify dependency
- `tests/helpers/db.ts`: added `truncateCatalogTables()` in FK-safe order
- `tests/catalog/schema.test.ts`: static column checks + integration round-trip tests
- `tests/catalog/queries.test.ts`: Wave 0 scaffold with TODO(Plan 02) comments for getCatalog assertions
- `tests/catalog/variant-resolver.test.ts`: Wave 0 sanity test + TODO(Plan 03) stubs for resolveVariant/stockTier

### Task 3: [BLOCKING] Schema push to Neon + seed (no new commits — external operations)

- `npm run db:push`: All 8 catalog tables created in Neon (brand, category, product, product_image, product_option, option_value, variant, variant_option_value). Minor error on existing `processed_webhook_events_id_unique` constraint — benign, all catalog tables created successfully.
- `npm run seed:catalog`: 3 categories, 4 brands, 6 products, 11 images, 29 variants seeded.
- Full test suite: 64/64 tests pass.

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| tests/catalog/schema.test.ts | 14 | PASS |
| tests/catalog/queries.test.ts | 1 | PASS |
| tests/catalog/variant-resolver.test.ts | 1 | PASS |
| Full suite (all tests) | 64 | PASS |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. One noteworthy observation:

**[Observation] db:push error on processed_webhook_events_id_unique**
- **Found during:** Task 3 (db:push)
- **Issue:** drizzle-kit push exited non-zero with "relation 'processed_webhook_events_id_unique' already exists" — this index already existed from Phase 1's push. The error occurred AFTER all 8 catalog tables were already created.
- **Resolution:** Confirmed all 8 catalog tables exist in Neon via direct DB query. Not a failure — catalog schema push succeeded. The constraint collision is a Drizzle drizzle-kit edge case with pre-existing named unique constraints on `CREATE INDEX CONCURRENTLY`. No data loss, no missing tables.
- **Impact:** None. All tests pass against live DB.

## Known Stubs

- `tests/catalog/queries.test.ts`: Contains TODO(Plan 02) comments for getCatalog filter/search/sort assertions. These are clearly marked as deferred to Plan 02-02, not missing functionality — this is the intentional Wave 0 scaffold.
- `tests/catalog/variant-resolver.test.ts`: Contains TODO(Plan 03) comments for resolveVariant/stockTier. Intentionally deferred to Plan 02-03.

These are intentional scaffolds, not stubs blocking the plan's goal. The plan's objective (catalog schema + seed + test infrastructure) is fully achieved.

## Threat Flags

No new threat surface introduced beyond what the plan's threat model documents. All three T-02-0x threats were addressed:

- T-02-01 (price tampering): priceKobo is integer, server-side only, never client-writable (established at data layer)
- T-02-02 (slug collision): `slugify(strict:true)` + `uniqueSlug()` collision increment + DB unique constraint
- T-02-03 (combinatorial seed): Developer-controlled bounded seed; no user input surface

## Self-Check: PASSED

Files created/exist:
- src/lib/db/schema.ts: FOUND
- src/lib/utils/slug.ts: FOUND
- src/scripts/seed-catalog.ts: FOUND
- tests/helpers/db.ts: FOUND (extended)
- tests/catalog/schema.test.ts: FOUND
- tests/catalog/queries.test.ts: FOUND
- tests/catalog/variant-resolver.test.ts: FOUND

Commits exist:
- 5c09c97: feat(02-01): add 8 catalog tables + relations to Drizzle schema — FOUND
- 73eddb6: feat(02-01): slug util, catalog seed, truncation helper, Wave 0 test scaffold — FOUND

DB verification:
- 8 catalog tables in Neon: CONFIRMED
- 64/64 tests passing: CONFIRMED
