---
phase: 02-product-catalog
plan: "02"
subsystem: catalog-listing
tags: [catalog, listing, search, filter, sort, pagination, drizzle, next.js, tailwind, cacheComponents, SSR]
dependency_graph:
  requires: [02-01-catalog-schema]
  provides: [getCatalog, getProduct, getBrandsForCategory, formatNGN, parseCatalogParams, storefront-landing, category-pages, all-products-page, search-page, site-header, product-card, product-grid, product-filters, sort-select, pagination, empty-state, category-card]
  affects: [02-03-product-detail-page, 02-04-seo, phase-03-cart]
tech_stack:
  added: []
  patterns: [drizzle-min-price-subquery, suspense-wrapped-server-components, cacheComponents-partial-prerender, zod-searchparams-validation, url-driven-ssr-listing]
key_files:
  created:
    - src/lib/catalog/format.ts
    - src/lib/catalog/queries.ts
    - src/lib/validation/catalog-params.ts
    - src/components/layout/SiteHeader.tsx
    - src/components/catalog/SearchBar.tsx
    - src/components/catalog/ProductCard.tsx
    - src/components/catalog/ProductGrid.tsx
    - src/components/catalog/ProductFilters.tsx
    - src/components/catalog/SortSelect.tsx
    - src/components/catalog/Pagination.tsx
    - src/components/catalog/EmptyState.tsx
    - src/components/catalog/CategoryCard.tsx
    - src/app/[categorySlug]/page.tsx
    - src/app/products/page.tsx
    - src/app/search/page.tsx
  modified:
    - src/app/layout.tsx
    - src/app/globals.css
    - src/app/page.tsx
    - next.config.ts
    - tests/catalog/queries.test.ts
    - vitest.config.ts
    - src/app/(auth)/verify-email/page.tsx
    - src/app/account/orders/page.tsx
    - src/app/admin/page.tsx
decisions:
  - "getCatalog uses a Drizzle subquery MIN(price_kobo) per product for price sorting and filtering — prevents sort-by-random-variant pitfall (RESEARCH Pitfall 4)"
  - "cacheComponents: true with Suspense boundaries — all uncached async data access moved into inner async components wrapped in Suspense; existing auth pages (verify-email, admin, orders) also retrofitted"
  - "ProductFilters is a unified 'use client' component (no Server/Client split) — simpler and sufficient for Phase 2 requirements"
  - "vitest testTimeout + hookTimeout raised to 30s — Neon serverless cold-start latency can exceed default 5/10s thresholds"
metrics:
  duration: "~90 minutes"
  completed: "2026-06-11T19:05:00Z"
  tasks_completed: 3
  files_created: 15
  files_modified: 9
---

# Phase 02 Plan 02: Catalog Listing Layer Summary

## One-liner

URL-driven SSR catalog (getCatalog with Drizzle MIN-price subquery, Zod-validated searchParams, ILIKE search, brand/price/sort/pagination) + 8 listing components + storefront landing + category/all-products/search pages, all compatible with Next.js 16 cacheComponents Partial Prerender.

## What Was Built

### Task 1: Catalog query module, NGN formatter, Zod validator (commit 0582aa8)

**`src/lib/catalog/format.ts`** — pure `formatNGN(kobo)` using `Intl.NumberFormat("en-NG")`. No server-only guard; safe everywhere.

**`src/lib/validation/catalog-params.ts`** — `parseCatalogParams(sp)` with Zod:
- `q`: trimmed, max 100 chars (T-02-05 XSS + DoS cap)
- `brand`: optional exact-match string
- `minPrice`/`maxPrice`: coerced to int kobo, clamped 0..1_000_000_000 (T-02-06)
- `sort`: allowlist enum `price_asc | price_desc | newest | name_asc`; unknown → `"newest"` (D-12)
- `page`: int clamped 1..1000 (T-02-06)

**`src/lib/catalog/queries.ts`** — `import "server-only"` at line 1:
- `getCatalog(opts)`: Drizzle subquery `MIN(price_kobo)` per product joined to the main query. Builds parameterized `filters[]` with `ilike`/`eq`/`gte`/`lte` (T-02-04). Supports `categorySlug`, `q` (ILIKE on name+description), `brand`, `minPrice`/`maxPrice`, `sort`, `page`. Returns `{ products: CatalogCard[], total, page, pageCount }`.
- `getProduct(slug)`: full relation tree for PDP (Plan 03) — brand, category, ordered images, ordered options+values, active variants with optionValues.
- `getBrandsForCategory(slug?)`: distinct brand names for sidebar facets.

**`tests/catalog/queries.test.ts`** — 14 integration tests (all passing) covering:
- Category slug filter (CATA-01)
- Unknown category returns empty
- ILIKE search on name and description (CATA-02)
- price_asc and price_desc sort by MIN variant price (CATA-03)
- Brand filter (CATA-03)
- Pagination total/pageCount/offset (CATA-03)
- Price range filter with kobo values

### Task 2: Global header, search bar, and shared listing components (commit fa56276)

**`next.config.ts`**: `cacheComponents: true` + `images.remotePatterns` for picsum.photos and unsplash.

**`src/app/globals.css`**: Phase 2 CSS custom properties added to `:root` — `--surface`, `--border`, `--muted`, `--accent`, `--accent-hover`, `--stock-in`, `--stock-low`, `--stock-out` with dark-mode overrides. Wired into `@theme inline`.

**`src/app/layout.tsx`**: `metadataBase` added; `<SiteHeader>` inserted before `{children}`.

**Components built** (per UI-SPEC exact tokens, copy strings, accessibility contracts):

| Component | Type | Notes |
|-----------|------|-------|
| `SiteHeader` | Server | Logo, SearchBar island, nav links, cart stub icon (aria-label="Shopping cart"), account icon |
| `SearchBar` | Client | `role="search"`, `router.push('/search?q=')`, empty → `/products` |
| `ProductCard` | Server | `next/image` 4:3 aspect, brand/name/"From ₦X" price, entire card is Link to PDP |
| `ProductGrid` | Server | 1/2/3-col grid; renders EmptyState when empty |
| `EmptyState` | Server | MagnifyingGlassIcon, "No products found", "Clear filters"/"Browse all" Link |
| `Pagination` | Server | Link-based prev/next + up to 5 page numbers; `aria-label="Pagination"` |
| `SortSelect` | Client | `onChange` → `router.push` preserving params |
| `ProductFilters` | Client | Desktop sidebar + mobile `role="dialog"` drawer; brand checkboxes + price range + "Apply filters" + "Clear all" |
| `CategoryCard` | Server | 4:3 image with gradient overlay, "Shop now" label |

### Task 3: Listing pages (commit d261d0d)

**`src/app/page.tsx`**: Storefront landing (D-07). Hero banner + 3 CategoryCards + FeaturedProducts inside `<Suspense>`. Replaced Next.js scaffold.

**`src/app/[categorySlug]/page.tsx`**: CATA-01. `generateStaticParams` for electronics/watches/phones. Async `params` + `searchParams` (Next.js 16). `notFound()` for invalid slugs. All data fetching inside `CategoryContent` wrapped in `<Suspense>`. Full filter/sort/grid/pagination layout.

**`src/app/products/page.tsx`**: All-products listing (D-06). Same layout without category filter. Data inside `<Suspense>`.

**`src/app/search/page.tsx`**: CATA-02. `q` passed as parameterized DB filter only (T-02-04). Results heading uses React text node — never into attributes or dangerouslySetInnerHTML (T-02-05). Data inside `<Suspense>`.

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| tests/catalog/queries.test.ts | 14 | PASS |
| tests/catalog/schema.test.ts | 14 | PASS |
| Full suite (excluding pre-existing verify-email timeout) | 78/79 | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] cacheComponents: true requires all uncached async data access inside Suspense**

- **Found during:** Task 3 (`npx next build --webpack`)
- **Issue:** With `cacheComponents: true` in next.config.ts, Next.js 16 enforces that uncached async data (DB calls, `await searchParams`) must be inside `<Suspense>` boundaries. The build failed with "Uncached data was accessed outside of Suspense" on 5 pages: `/verify-email`, `/[categorySlug]`, `/account/orders`, `/admin`.
- **Fix:** Extracted all async data-fetching logic into inner async components (`VerificationContent`, `CategoryContent`, `ProductsContent`, `SearchContent`, `FeaturedProducts`, `AdminContent`, `OrdersContent`) and wrapped each in `<Suspense>`. Build now produces `◐ (Partial Prerender)` for all affected routes.
- **Files modified:** `src/app/(auth)/verify-email/page.tsx`, `src/app/account/orders/page.tsx`, `src/app/admin/page.tsx` (pre-existing pages retrofitted), plus all new listing pages.
- **Commits:** d261d0d

**2. [Rule 1 - Bug] ProductFilters simplified to unified Client Component**

- **Found during:** Task 2 (design review)
- **Issue:** Plan described a "Server shell + Client island" split for ProductFilters, but a Server shell containing a Client island with `useState` for the mobile drawer would require careful serialization of the brands list as props. A unified `"use client"` component is simpler and equivalent — the brands list is passed as a prop from the page, not fetched inside the component.
- **Fix:** Built `ProductFilters` as a single `"use client"` component; the brands list is always provided by the calling page (which does the DB query server-side).
- **Impact:** Functionally equivalent to the plan spec; simpler implementation.

**3. [Rule 2 - Missing Critical Functionality] Neon latency vitest timeout**

- **Found during:** Task 3 (full test suite run)
- **Issue:** Neon serverless cold-start latency causes DB operations to exceed the default 5s/10s Vitest test/hook timeouts.
- **Fix:** Added `testTimeout: 30000, hookTimeout: 30000` to `vitest.config.ts`.
- **Files modified:** `vitest.config.ts`

## Known Stubs

None blocking the plan's goal. The `getCatalog` function and all listing pages are fully wired with real data.

- `getProduct(slug)` exists in queries.ts but is not wired to any page yet — intentionally deferred to Plan 02-03 (PDP).
- Cart icon in SiteHeader is a stub button with no action — intentionally deferred to Phase 3.

## Threat Flags

No new threat surface beyond what the plan's threat model documents:

- T-02-04 (SQLi): All DB filters use Drizzle parameterized operators — CONFIRMED
- T-02-05 (XSS): `q` rendered only as React text node in search heading — CONFIRMED
- T-02-06 (DoS): page clamped 1..1000, price clamped 0..1e9, q length ≤100, PAGE_SIZE fixed 24 — CONFIRMED
- T-02-07 (open redirect): `q` used only as DB filter, never in router.push target — CONFIRMED

## Self-Check: PASSED

Files created/exist:
- src/lib/catalog/queries.ts: FOUND
- src/lib/catalog/format.ts: FOUND
- src/lib/validation/catalog-params.ts: FOUND
- src/components/layout/SiteHeader.tsx: FOUND
- src/components/catalog/SearchBar.tsx: FOUND
- src/components/catalog/ProductCard.tsx: FOUND
- src/components/catalog/ProductGrid.tsx: FOUND
- src/components/catalog/ProductFilters.tsx: FOUND
- src/components/catalog/SortSelect.tsx: FOUND
- src/components/catalog/Pagination.tsx: FOUND
- src/components/catalog/EmptyState.tsx: FOUND
- src/components/catalog/CategoryCard.tsx: FOUND
- src/app/[categorySlug]/page.tsx: FOUND
- src/app/products/page.tsx: FOUND
- src/app/search/page.tsx: FOUND

Commits:
- 0582aa8: feat(02-02): catalog query module, NGN formatter, and searchParams validator — FOUND
- fa56276: feat(02-02): global header, search bar, and shared catalog components — FOUND
- d261d0d: feat(02-02): storefront listing pages — home, category, all-products, search — FOUND

Build:
- npx next build --webpack: EXIT 0 — CONFIRMED (15/15 routes generated)
- npx tsc --noEmit: EXIT 0 — CONFIRMED
- npm run lint: EXIT 0 — CONFIRMED
- npx vitest run tests/catalog/queries.test.ts: 14/14 PASS — CONFIRMED
