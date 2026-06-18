---
phase: 02-product-catalog
verified: 2026-06-18T13:08:42Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Browse category pages live — /electronics, /watches, /phones"
    expected: "Each page renders products from the correct category with filters, sort, and pagination controls visible"
    why_human: "Category data comes from Neon DB; requires a running dev server to confirm the full SSR response for each slug"
  - test: "Search via header search bar → /search?q=samsung"
    expected: "Results page heading shows '2 results for \"samsung\"' (or similar) and the product grid is populated; empty search → redirects to /products"
    why_human: "SearchBar uses useRouter client-side push; verifying the redirect and rendered results requires a browser"
  - test: "Brand filter and price sort on /products"
    expected: "Checking 'Apple' brand checkbox updates the URL to ?brand=Apple and re-renders only Apple products; sort 'Price: Low to High' orders cards by ascending From ₦X,XXX"
    why_human: "Filter interaction is client-side URL mutation (useRouter); sort correctness requires visual card ordering"
  - test: "Variant selection on any seeded PDP (e.g. /products/casio-g-shock-ga-2100)"
    expected: "Clicking OOS variant (Blue — stock 0) shows it disabled/greyed; clicking Black shows 'In stock'; clicking White (stock 4) shows 'Only 4 left'; price updates instantly without page reload"
    why_human: "Live variant interaction is client-side React state (VariantSelector); stock-tier display requires visual confirmation"
  - test: "SC5 fresh stock/price: edit a variant's stock in Neon DB, reload the PDP"
    expected: "Stock indicator reflects the DB edit immediately (fresh block); static breadcrumb/name may be cached"
    why_human: "Requires a DB write followed by page reload to confirm the caching split is correct — cannot verify from static code alone"
  - test: "SC5 canonical and JSON-LD: view-source on any PDP"
    expected: "<link rel=\"canonical\" href=\"/products/<slug>\"> present in <head>; <script type=\"application/ld+json\"> with @type Product present in page source; no literal < in the JSON payload"
    why_human: "Canonical and JSON-LD are rendered server-side; requires a browser view-source or curl to confirm the generated HTML"
  - test: "Mobile Filters drawer on a category or search page (viewport < 1024px)"
    expected: "A 'Filters' button appears (desktop sidebar hidden); tapping it opens a bottom-sheet drawer with brand checkboxes and price inputs; 'Show results' closes the drawer"
    why_human: "Mobile drawer behavior (open/close via useState) requires a narrowed viewport to test; not detectable by static grep"
---

# Phase 02: Product Catalog Verification Report

**Phase Goal:** Customers can discover products by browsing, searching, and filtering, and can inspect a product with live variant-aware pricing — the first publicly shippable piece of the store. This phase also defines the product/category/brand/variant schema (deferred from Phase 1 by D-11) and seeds a realistic catalog (no admin panel until Phase 5).
**Verified:** 2026-06-18T13:08:42Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                              | Status     | Evidence                                                                                                                                     |
|----|-------------------------------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Browse products grouped by category (Electronics, Watches, Phones)                                               | ✓ VERIFIED | `/[categorySlug]/page.tsx` with `generateStaticParams` for 3 slugs; `getCatalog({categorySlug})` fully wired; `notFound()` on invalid slugs |
| 2  | Search products by name or description, see matching results                                                      | ✓ VERIFIED | `getCatalog` uses `ilike(products.name, ...)` OR `ilike(products.description, ...)`; `/search?q=` page wired; test coverage confirmed         |
| 3  | Sort by price; filter by brand and price range                                                                    | ✓ VERIFIED | `parseCatalogParams` allowlists 4 sort keys (price_asc/desc/newest/name_asc); brand `eq` and price `gte`/`lte` filters via Drizzle params   |
| 4  | Select a variant and see price + stock indicator update live for that variant                                     | ✓ VERIFIED | `VariantSelector` (client) with `resolveVariant` + `stockTier`; `aria-live="polite"` on price and StockIndicator; OOS values `aria-disabled` |
| 5  | Product pages serve fresh stock/price (NOT over-cached), carry canonical URLs, and emit Product structured data  | ✓ VERIFIED | `ProductContent` has `"use cache"` + `cacheLife("hours")` + `cacheTag`; `VariantStockPriceBlock` has NO cache directive; `alternates.canonical` in `generateMetadata`; JSON-LD with `.replace(/</g, "\\u003c")` XSS mitigation |

**Score:** 10/10 truths verified (all PLAN-level and ROADMAP-level must-haves pass automated checks)

### Required Artifacts

| Artifact                                         | Expected                                         | Status     | Details                                                                   |
|--------------------------------------------------|--------------------------------------------------|------------|---------------------------------------------------------------------------|
| `src/lib/db/schema.ts`                           | 8 pgTable catalog exports + relations            | ✓ VERIFIED | 13 total pgTable calls (5 existing + 8 catalog); all relations present    |
| `src/scripts/seed-catalog.ts`                    | Idempotent realistic catalog seed                | ✓ VERIFIED | `import "@/scripts/load-env"` is line 1; 6 products, 4 brands, 3 cats    |
| `src/lib/utils/slug.ts`                          | `toSlug` + `uniqueSlug` exports                  | ✓ VERIFIED | Both functions exported                                                    |
| `src/lib/catalog/queries.ts`                     | `getCatalog`, `getProduct`, `getBrandsForCategory` server-only | ✓ VERIFIED | `import "server-only"` line 1; all 3 functions exported               |
| `src/lib/catalog/format.ts`                      | `formatNGN(kobo)` NGN formatter                  | ✓ VERIFIED | Exported; uses `Intl.NumberFormat("en-NG", {currency:"NGN"})`             |
| `src/lib/validation/catalog-params.ts`           | `parseCatalogParams` with sort allowlist          | ✓ VERIFIED | Zod schema with q/brand/minPrice/maxPrice/sort/page; sort allowlist present|
| `src/lib/catalog/variant.ts`                     | `resolveVariant`, `stockTier`, `stockLabel`, `isOptionValueAvailable`, `VariantForSelector` type | ✓ VERIFIED | All 4 functions + type exported; pure module (no server-only) |
| `src/components/product/VariantSelector.tsx`     | Client component with live price+stock+CTA stub  | ✓ VERIFIED | `"use client"`; uses `resolveVariant`; `aria-live`, `aria-disabled`, "Add to cart" CTA |
| `src/components/product/ProductGallery.tsx`      | Client gallery with variant image swap           | ✓ VERIFIED | `"use client"`; `next/image`; variant image precedence implemented        |
| `src/components/product/StockIndicator.tsx`      | Tiered stock display with `aria-live`            | ✓ VERIFIED | `aria-live="polite"` present; tier-colored text                           |
| `src/components/product/VariantSkeleton.tsx`     | Suspense fallback with `animate-pulse`           | ✓ VERIFIED | `animate-pulse` present; `aria-hidden="true"`                             |
| `src/app/products/[slug]/page.tsx`               | PDP with Suspense split + SEO + caching          | ✓ VERIFIED | `Suspense`, `VariantSkeleton`, `getProduct`, `"use cache"` on content only, `canonical`, JSON-LD |
| `next.config.ts`                                 | `cacheComponents: true` + `remotePatterns`       | ✓ VERIFIED | Both present; `picsum.photos` whitelisted; no deprecated `domains:`       |
| `src/app/page.tsx`                               | Storefront landing (not Next.js scaffold)        | ✓ VERIFIED | Hero + CategoryCards + FeaturedProducts; no scaffold content              |
| `src/app/[categorySlug]/page.tsx`                | Category listing SSR page                        | ✓ VERIFIED | `generateStaticParams`, `await params`, `notFound()`, `getCatalog` wired  |
| `src/app/products/page.tsx`                      | All-products page                                | ✓ VERIFIED | `getCatalog` wired; same filter/sort/grid/pagination pattern               |
| `src/app/search/page.tsx`                        | Search results page                              | ✓ VERIFIED | `getCatalog({q,...})` wired; heading renders q as text node only (XSS safe)|
| `src/components/layout/SiteHeader.tsx`           | Global header with SearchBar + nav               | ✓ VERIFIED | SearchBar island; nav links for electronics/watches/phones/products        |
| `src/components/catalog/SearchBar.tsx`           | Client search bar                                | ✓ VERIFIED | `"use client"`, `role="search"`, `router.push("/search?q=...")`           |
| `src/components/catalog/ProductFilters.tsx`      | Sidebar + mobile drawer                          | ✓ VERIFIED | `role="dialog"`, `aria-modal="true"`, `aria-label="Product filters"`      |
| `src/components/catalog/EmptyState.tsx`          | No-results state with CTA                        | ✓ VERIFIED | "No products found" + conditional "Clear filters"/"Browse all products"   |
| `src/app/layout.tsx`                             | SiteHeader + metadataBase                        | ✓ VERIFIED | `<SiteHeader />` in body; `metadataBase` with `NEXT_PUBLIC_BASE_URL` env  |
| `tests/catalog/schema.test.ts`                   | Schema static + integration tests                | ✓ VERIFIED | 14 tests pass (static + integration round-trip against Neon)              |
| `tests/catalog/queries.test.ts`                  | Query integration tests (14 total)               | ✓ VERIFIED | 14 tests pass; covers category/search/sort/brand/pagination/price-filter  |
| `tests/catalog/variant-resolver.test.ts`         | Variant resolver + stock-tier unit tests         | ✓ VERIFIED | 24 tests pass; covers resolveVariant/stockTier/stockLabel/isOptionValueAvailable |
| `tests/helpers/db.ts`                            | `truncateCatalogTables` helper                   | ✓ VERIFIED | Present; FK-safe deletion order confirmed                                  |

### Key Link Verification

| From                                         | To                                   | Via                                             | Status     | Details                                                         |
|----------------------------------------------|--------------------------------------|-------------------------------------------------|------------|-----------------------------------------------------------------|
| `src/lib/db/schema.ts`                       | `src/lib/db/client.ts`               | `import * as schema` in client                  | ✓ WIRED    | Schema already auto-registered; relations traversable via `db.query.*` |
| `src/app/[categorySlug]/page.tsx`            | `src/lib/catalog/queries.ts`         | `await getCatalog(parsedParams)`                | ✓ WIRED    | `getCatalog` called in `CategoryContent`; result drives `ProductGrid` |
| `src/app/search/page.tsx`                    | `src/lib/catalog/queries.ts`         | `await getCatalog({q,...})`                     | ✓ WIRED    | `getCatalog` called in `SearchContent`; result drives grid      |
| `src/components/catalog/SearchBar.tsx`       | `/search`                            | `router.push('/search?q=...')`                  | ✓ WIRED    | Confirmed in SearchBar.tsx line 18                              |
| `src/app/layout.tsx`                         | `src/components/layout/SiteHeader.tsx` | `<SiteHeader />` in body                      | ✓ WIRED    | Line 33 of layout.tsx                                           |
| `src/components/product/VariantSelector.tsx` | `src/lib/catalog/variant.ts`         | `resolveVariant(variants, selected)` + `isOptionValueAvailable` | ✓ WIRED | Both imported and called in render |
| `src/components/product/VariantSelector.tsx` | `src/components/product/ProductGallery.tsx` | `onVariantImageChange` callback lifted to `ProductDetailClient` | ✓ WIRED | `useEffect` fires on `resolvedVariant?.id` change, calls `onVariantImageChange?.(imageUrl)` |
| `src/app/products/[slug]/page.tsx` (ProductContent) | Next.js cache | `"use cache"` + `cacheLife("hours")` + `cacheTag` | ✓ WIRED | Directive at line 73 inside `ProductContent` only; `VariantStockPriceBlock` has NO cache directive (confirmed) |
| `src/app/products/[slug]/page.tsx` (generateMetadata) | canonical URL | `alternates.canonical = '/products/${slug}'` | ✓ WIRED | Present in `generateMetadata`; `metadataBase` on root layout resolves to full URL |

### Data-Flow Trace (Level 4)

| Artifact                          | Data Variable      | Source                              | Produces Real Data | Status       |
|-----------------------------------|--------------------|-------------------------------------|--------------------|--------------|
| `VariantSelector.tsx`             | `variants` prop    | `getProduct(slug)` via `VariantStockPriceBlock` → mapped to `VariantForSelector[]` | DB query via Drizzle relational API | ✓ FLOWING |
| `ProductGallery.tsx`              | `images` prop      | `getProduct(slug).images`           | DB query           | ✓ FLOWING    |
| `[categorySlug]/page.tsx`         | `result.products`  | `getCatalog({categorySlug,...})`    | Drizzle join with MIN price subquery | ✓ FLOWING |
| `search/page.tsx`                 | `result.products`  | `getCatalog({q,...})`               | ILIKE parameterized query | ✓ FLOWING |
| `StockIndicator.tsx`              | `stock` prop       | `resolvedVariant.stock` from `VariantSelector` state | DB-sourced via `VariantStockPriceBlock` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                              | Command                                                                            | Result   | Status  |
|---------------------------------------|------------------------------------------------------------------------------------|----------|---------|
| Variant resolver — 24 unit tests      | `npx vitest run tests/catalog/variant-resolver.test.ts`                           | 24 passed | ✓ PASS |
| Schema integration — 14 tests         | `npx vitest run tests/catalog/schema.test.ts`                                     | 14 passed | ✓ PASS |
| Query integration — 14 tests          | `npx vitest run tests/catalog/queries.test.ts`                                    | 14 passed | ✓ PASS |
| TypeScript clean                      | `npx tsc --noEmit`                                                                 | Exit 0   | ✓ PASS  |
| `VariantStockPriceBlock` has no cache | `grep -n '"use cache"' .../products/[slug]/page.tsx` — only line 73 (ProductContent) | 1 match at line 73 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                    | Status      | Evidence                                                                 |
|-------------|-------------|----------------------------------------------------------------|-------------|--------------------------------------------------------------------------|
| CATA-01     | Plans 02-01, 02-02 | Browse products by category (Electronics, Watches, Phones) | ✓ SATISFIED | `/[categorySlug]/page.tsx` routes for 3 categories; `getCatalog({categorySlug})` filters by category |
| CATA-02     | Plan 02-02  | Search products by name or description                         | ✓ SATISFIED | `getCatalog` uses ILIKE on `products.name` and `products.description`; `/search?q=` page built |
| CATA-03     | Plan 02-02  | Sort by price, filter by brand and price range                 | ✓ SATISFIED | 4 sort keys; brand `eq` filter; `minPrice`/`maxPrice` against MIN variant price subquery |
| CATA-04     | Plans 02-03, 02-04 | Select variants with live price update                    | ✓ SATISFIED | `VariantSelector` client component; `resolveVariant` + `stockTier` wired; OOS disable per D-16 |

**Note on REQUIREMENTS.md traceability table:** The body section correctly marks CATA-01, CATA-02, CATA-03, CATA-04 as `[x]` delivered, but the traceability table at the bottom still shows CATA-01/02/03 as "Pending" (CATA-04 as "Complete"). This is a documentation inconsistency — the code fully satisfies all four requirements. The traceability table needs to be updated to reflect the delivered state.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/product/VariantSelector.tsx` | `onClick` is a no-op stub (D-18 intentional) | INFO | By design — Phase 3 wires cart. `// Phase 3 wires cart` comment present. Not a blocker. |
| `src/components/layout/SiteHeader.tsx` | Cart icon button has no action (Phase 3 stub) | INFO | By design — CONTEXT.md §Deferred explicitly defers cart CTA. Not a blocker. |

No STUB, MISSING, or BLOCKER anti-patterns found. Both flagged patterns are explicitly documented as Phase 3 deferred behavior.

### Human Verification Required

#### 1. Category page live render

**Test:** Start dev server (`npm run dev`), navigate to `/electronics`, `/watches`, and `/phones`
**Expected:** Each page shows the correct category heading, a product grid populated from the Neon seed (≥1 product per category), brand filter sidebar (desktop), and sort control
**Why human:** Category pages are SSR with data from Neon DB; the route renders dynamically and requires a running server

#### 2. Search submit and results render

**Test:** Click the header search bar, type "samsung", press Enter → verify redirect to `/search?q=samsung`
**Expected:** Results heading shows "2 results for 'samsung'" (or matching count); product grid shows Samsung products; empty search → redirects to `/products`
**Why human:** `SearchBar` uses `router.push` in a browser event handler; rendered results require Neon DB

#### 3. Brand filter + price sort interaction

**Test:** On `/products`, check the "Apple" brand checkbox; observe URL change to `?brand=Apple` and grid re-render; switch sort to "Price: Low to High"
**Expected:** Only Apple products remain; products ordered ascending by "From ₦X,XXX" price; sidebar shows brand checked
**Why human:** Filter interactions are client-side URL mutations; visual ordering requires a running page

#### 4. Variant selection live update on PDP

**Test:** Navigate to `/products/casio-g-shock-ga-2100` (or any seeded PDP); click each color swatch
**Expected:** Blue (OOS) swatch is greyed/disabled; Black shows "In stock"; White shows "Only 4 left"; price updates instantly; gallery swaps image if variant-specific image exists
**Why human:** Live price/stock update is React client state; OOS disable styling requires visual confirmation

#### 5. SC5 cache split — fresh stock/price

**Test:** Edit a variant's stock directly in Neon (e.g., set a "In stock" variant to 0), reload the PDP
**Expected:** Stock indicator immediately reflects "Out of stock" (fresh block); breadcrumb, name, and brand may be cached but stock/price is fresh
**Why human:** Requires a live DB write; cache correctness cannot be verified from static code (only the structural split can be confirmed, not runtime behavior)

#### 6. SC5 canonical + JSON-LD in page source

**Test:** Open any PDP in a browser, use View Source or DevTools
**Expected:** `<link rel="canonical" href="/products/<slug>">` in `<head>`; `<script type="application/ld+json">` with `"@type": "Product"` in body; no literal `<` characters in the JSON payload
**Why human:** `generateMetadata` outputs are rendered as HTML by Next.js; requires a running server to see the `<head>` output

#### 7. Mobile Filters drawer

**Test:** Open any category page with DevTools viewport narrowed to < 1024px; look for "Filters" button; tap it
**Expected:** Desktop sidebar is hidden; a "Filters" button appears; tapping opens a bottom-sheet drawer with brand checkboxes and price range inputs; "Show results" button closes it
**Why human:** Mobile drawer is controlled by `useState(drawerOpen)` — requires a narrowed viewport in a running browser

---

## Notes

- **REQUIREMENTS.md traceability table inconsistency:** The requirement body (`[x]`) and the traceability table (`Pending`) disagree for CATA-01/02/03. The traceability table should be updated to `Complete` for all four CATA requirements. This is a documentation gap, not a code gap.
- **Seed image host:** `next.config.ts` whitelists `picsum.photos` (the seed's primary image host) plus `images.unsplash.com` for any additional URLs.
- **Cache split boundary:** `"use cache"` is confirmed only at line 73 inside `ProductContent`. `VariantStockPriceBlock` has no cache directive — the split is structurally correct.

---

_Verified: 2026-06-18T13:08:42Z_
_Verifier: Claude (gsd-verifier)_
