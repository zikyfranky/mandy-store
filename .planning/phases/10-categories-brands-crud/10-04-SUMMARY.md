# Plan 10-04 Summary — Storefront taxonomy decouple (D-03)

**Status:** COMPLETE
**Requirements:** ADMN-12 (also ADMN-13 via brand-facet)
**Completed:** 2026-07-12

## What was built
- **`src/app/[categorySlug]/page.tsx`** — removed hardcoded `VALID_CATEGORY_SLUGS`/`CATEGORY_NAMES`/`CategorySlug`. `generateStaticParams` now maps `listActiveCategoriesForNav()`; `generateMetadata` + `CategoryContent` resolve via `getActiveCategoryBySlug` and call `notFound()` for an unknown OR soft-deleted slug. `getCatalog`/`getBrandsForCategory`/`basePath` use the raw slug string.
- **`src/components/layout/SiteHeader.tsx`** — now an `async` Server Component; deleted the `NAV` constant; builds the nav from `await listActiveCategoriesForNav()` + the static "All Products" entry. Stays in the static PPR shell because the query is `'use cache'`-tagged (Pitfall 3).
- **`src/app/page.tsx`** — deleted the `RAILS` constant; `CategoryRails` builds rails from active categories with a generic `New in ${name}` title (D-03 — bespoke copy intentionally dropped, flagged for UAT).
- `src/app/layout.tsx` unchanged — both `<SiteHeader />` sites already sit inside the layout `<Suspense>` boundary, so an async child is valid.

## Verification
- Grep invariants all pass: 0 hardcoded `VALID_CATEGORY_SLUGS`/`CATEGORY_NAMES`/`NAV`/`RAILS`; `getActiveCategoryBySlug` ×3; `notFound()` gate ×1; `await listActiveCategoriesForNav()` in header.
- `tsc --noEmit` clean.
- `next build --webpack`: **compiled successfully, 37/37 static pages**; **`/` and `/[categorySlug]` retain `◐` (Partial Prerender)** — no dynamic regression. (SWC native-binding warnings are the known darwin issue; `--webpack` is the CLAUDE.md-mandated path.)

## Self-Check: PASSED

## Enables
Storefront now reflects admin taxonomy changes: a new active category is browsable + in nav/rails; a soft-deleted one 404s and disappears. Plan 10-06 UAT exercises this end-to-end.
