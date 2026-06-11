---
phase: 02-product-catalog
plan: "03"
subsystem: product-detail-page
tags: [pdp, variant-selector, client-components, suspense, tdd, cata-04]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [product-detail-page, variant-resolution-module]
  affects: [02-04]
tech_stack:
  added: []
  patterns:
    - "TDD RED/GREEN with pure unit test module"
    - "prop-driven variant resolver via find()+every() — O(variants × optionValues)"
    - "lift-to-parent variantImageUrl state (ProductDetailClient wrapper)"
    - "non-async default export + Promise-params pattern for cacheComponents"
    - "two Suspense boundaries — content (cacheable) + stock/price (always fresh)"
    - "Drizzle nested with: { optionValue: { with: { option: true } } } for option name"
key_files:
  created:
    - src/lib/catalog/variant.ts
    - src/components/product/VariantSelector.tsx
    - src/components/product/StockIndicator.tsx
    - src/components/product/ProductGallery.tsx
    - src/components/product/ProductDetailClient.tsx
    - src/components/product/VariantSkeleton.tsx
    - src/components/product/VariantError.tsx
    - src/app/products/[slug]/page.tsx
  modified:
    - tests/catalog/variant-resolver.test.ts
    - src/lib/catalog/queries.ts
decisions:
  - "lift-to-parent for variantImageUrl state: ProductDetailClient holds variantImageUrl useState; VariantSelector receives onVariantImageChange callback; ProductGallery receives variantImageUrl prop. Both gallery and selector are siblings — no prop-drilling through Server Component boundary."
  - "non-async default export for ProductPage: cacheComponents requires all await inside Suspense. The default export passes the Promise<{slug}> params directly down to ProductContent and VariantStockPriceBlock which await it inside their respective Suspense boundaries."
  - "double Suspense boundaries: ProductContent (static: breadcrumb/name/brand) and VariantStockPriceBlock (fresh: gallery/selector/description) each have their own Suspense. Plan 04 adds 'use cache' to ProductContent only."
  - "getProduct extended with nested optionValue option join: variants.optionValues.optionValue now includes { with: { option: true } } so VariantForSelector.productOption.name resolves at runtime."
metrics:
  duration: "~10 minutes"
  completed: "2026-06-11"
  tasks_completed: 3
  files_changed: 10
---

# Phase 02 Plan 03: Product Detail Page Summary

**One-liner:** Interactive PDP at `/products/[slug]` with prop-driven variant resolution (CATA-04), live price+stock updates via `useState`, OOS-disable, tiered stock labels, and Suspense-split content/price blocks.

---

## What Was Built

### Task 1 — Variant resolver + stock tier module (TDD)

`src/lib/catalog/variant.ts` — pure functions, no DB, safe for client + test import:

- `VariantForSelector` type (exported) — explicit shape for Drizzle query → component boundary (RESEARCH Pitfall 6)
- `resolveVariant(variants, selected)` — `Array.find()` + `every()` set intersection against all `optionValue.id` values in the selection
- `stockTier(stock, threshold=5)` — returns `"in" | "low" | "out"` with threshold-5 per RESEARCH A3 / UI-SPEC
- `stockLabel(stock, threshold=5)` — produces `"In stock"`, `"Only N left"`, `"Out of stock"` copy (D-17)
- `isOptionValueAvailable(variants, selected, optionName, optionValueId)` — substitutes the candidate value and checks if any in-stock variant matches (drives D-16 OOS-disable)

Test file: `tests/catalog/variant-resolver.test.ts` — 24 pure unit tests covering all four exported functions with a 2-option `Color×Storage` fixture (4 variants including 0-stock and 3-stock edge cases). No DB, no vi.mock.

TDD gate: RED commit `b7e0360` → GREEN commit `468b8a6`.

### Task 2 — Client components (D-15 through D-19)

- `StockIndicator` — tiered text with `aria-live="polite"` (green/amber/red per UI-SPEC colors)
- `VariantSelector` — `useState<Record<string,string>>` initialized to first in-stock variant; pill/swatch buttons; OOS pills show `disabled`, `aria-disabled`, `opacity-50`, `title="Out of stock"` (D-16); `aria-live` on price; CTA "Add to cart" / "Out of stock" stub with Phase 3 comment (D-18)
- `ProductGallery` — `next/image`, thumbnail strip, variant image override via prop (D-19); display precedence: `variantImageUrl > selectedThumbnail > images[0]`
- `ProductDetailClient` — client wrapper lifting `variantImageUrl` state; Gallery + Selector are siblings sharing it
- `VariantSkeleton` — `animate-pulse` Suspense fallback per UI-SPEC
- `VariantError` — "Availability unavailable — refresh to retry" error fallback

### Task 3 — PDP server component shell

`src/app/products/[slug]/page.tsx`:

- Default export is **non-async** — passes `Promise<{slug}>` params down to inner async functions (required by `cacheComponents: true`)
- `ProductContent(params)` — breadcrumb, name, brand; wrapped in Suspense with skeleton fallback; Plan 04 adds `'use cache'` here
- `VariantStockPriceBlock(params)` — fresh stock/price data, no cache directive; wraps `ProductDetailClient`; wrapped in `<Suspense fallback={<VariantSkeleton />}>`
- `notFound()` when slug has no product (T-02-09 threat mitigation)
- No `generateMetadata`, no JSON-LD, no `'use cache'` — all deferred to Plan 04

`src/lib/catalog/queries.ts` updated: `getProduct` now includes `with: { optionValue: { with: { option: true } } }` so the `productOption.name` is available for `VariantForSelector`.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] getProduct query missing nested option relation**

- **Found during:** Task 3 implementation
- **Issue:** Plan spec said `VariantForSelector` needs `optionValue.productOption.name` but the Drizzle `getProduct` query only fetched `optionValue` rows — the `productOption` name relation was not included. At runtime, all option names would have been empty strings.
- **Fix:** Extended `getProduct` query: `with: { optionValue: { with: { option: true } } }` — uses the existing `optionValuesRelations.option` (one-to-one to productOptions). Page now uses `ov.optionValue.option?.name ?? ""`.
- **Files modified:** `src/lib/catalog/queries.ts`
- **Commit:** `cb482b3`

**2. [Rule 3 - Blocking] cacheComponents requires all await inside Suspense**

- **Found during:** Task 3 build (first attempt)
- **Issue:** First page implementation used `export default async function ProductPage` with `const { slug } = await params` at the page level. With `cacheComponents: true`, this caused a build error: "Uncached data was accessed outside of `<Suspense>`".
- **Fix:** Changed default export to non-async, passes `Promise<{slug}>` directly to inner async server components. Each inner component awaits `params` inside its own Suspense boundary. This is the same pattern used by `ProductsPage` (Plan 02-02).
- **Files modified:** `src/app/products/[slug]/page.tsx`
- **Commit:** `cb482b3`

---

## Architecture Decision: Caching Split Boundary

Plan 04 caching split boundary for `/products/[slug]`:

| Component | Caches? | Plan 04 action |
|-----------|---------|----------------|
| `ProductContent` | Yes (Plan 04) | Add `'use cache'` + `cacheLife('hours')` + `cacheTag('product-'+slug)` |
| `VariantStockPriceBlock` | Never | Leave as-is — always dynamic |
| `ProductDetailClient` | Never | Client component — no server caching applies |

The breadcrumb/name/brand are in `ProductContent`. The description is intentionally placed in `VariantStockPriceBlock` (same DB fetch, avoids a second query) — Plan 04 should be aware and move description to `ProductContent` if desired, or keep it in the fresh block.

---

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED — failing test | `b7e0360` | PASS |
| GREEN — passing implementation | `468b8a6` | PASS |
| REFACTOR | not needed (code is clean) | N/A |

---

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| Add-to-cart `onClick` no-op | `src/components/product/VariantSelector.tsx` | ~111 | D-18: Phase 3 wires cart. Comment `// Phase 3 wires cart — this is a no-op stub (D-18)` present. |

---

## Threat Surface Scan

All plan threats (T-02-09, T-02-10, T-02-11) addressed:
- T-02-09: `getProduct(slug)` uses Drizzle parameterized `eq(products.slug, slug)`; `notFound()` for unknown slugs.
- T-02-10: Price comes from `resolvedVariant.priceKobo` (server-provided); `VariantSelector` never submits price. CTA has no payload.
- T-02-11: Only `"Only N left"` (≤5) reveals count; above threshold shows `"In stock"` only.

No new threat surface introduced.

## Self-Check: PASSED

- `src/lib/catalog/variant.ts` — exists with resolveVariant, stockTier, stockLabel, isOptionValueAvailable, VariantForSelector
- `src/components/product/VariantSelector.tsx` — exists
- `src/components/product/StockIndicator.tsx` — exists
- `src/components/product/ProductGallery.tsx` — exists
- `src/components/product/ProductDetailClient.tsx` — exists
- `src/components/product/VariantSkeleton.tsx` — exists
- `src/components/product/VariantError.tsx` — exists
- `src/app/products/[slug]/page.tsx` — exists
- `tests/catalog/variant-resolver.test.ts` — 24 tests passing
- Commits: b7e0360, 468b8a6, d7e85ee, cb482b3 — all present in git log
- Build: `npx next build --webpack` exits 0, /products/[slug] renders as ◐ Partial Prerender
- tsc: exits 0; lint: exits 0
