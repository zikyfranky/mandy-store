---
phase: 02-product-catalog
plan: "04"
subsystem: product-detail-page-seo
tags: [seo, caching, use-cache, json-ld, canonical, sc5, cata-01, cata-04]
dependency_graph:
  requires: [02-01, 02-02, 02-03]
  provides: [seo-layer, cache-split, product-json-ld, canonical-url]
  affects: [phase-05-admin]
tech_stack:
  added: []
  patterns:
    - "use cache + cacheLife('hours') + cacheTag on static content component"
    - "JSON-LD in fresh (uncached) block so offers reflect current stock (T-02-13)"
    - "generateMetadata with alternates.canonical (relative, resolves via metadataBase)"
    - "XSS-safe JSON-LD: JSON.stringify().replace(/</g, '\\u003c') (T-02-12)"
key_files:
  created: []
  modified:
    - src/app/products/[slug]/page.tsx
decisions:
  - "JSON-LD placed in VariantStockPriceBlock (fresh block) rather than ProductContent so offers.availability reflects current stock — not stale cached data. T-02-13 resolved."
  - "canonical URL uses relative path /products/<slug> (not absolute) — metadataBase on root layout resolves it to the full URL. T-02-14: NEXT_PUBLIC_BASE_URL must be set at deploy time."
  - "cacheTag('product-<slug>') establishes the Phase 5 admin updateTag() invalidation hook — no Phase 5 code needed here, just the tag name."
  - "Task 1 (cacheComponents + remotePatterns) was already complete from Plan 03 Wave 3 deviation — verified present, no duplicate config added."
metrics:
  duration: "~15 minutes"
  completed: "2026-06-11"
  tasks_completed: 2
  files_changed: 1
---

# Phase 02 Plan 04: SEO + Caching Layer Summary

**One-liner:** PDP product content cached via `'use cache'`/`cacheLife('hours')`/`cacheTag`, canonical URL via `generateMetadata`, and XSS-safe Product JSON-LD in the fresh block — completing SC5.

---

## What Was Built

### Task 1 — cacheComponents + remotePatterns (pre-existing from Plan 03)

`next.config.ts`: `cacheComponents: true` and `images.remotePatterns` whitelisting `picsum.photos`, `images.unsplash.com`, `*.unsplash.com` were already present as a Wave 3 deviation in Plan 03. All acceptance criteria pass:

- `grep cacheComponents: true next.config.ts` — PASS
- `grep remotePatterns next.config.ts` — PASS
- `grep picsum.photos next.config.ts` — PASS
- `grep domains: next.config.ts` — returns non-zero (deprecated key absent) — PASS

No file changes needed; task verified complete.

### Task 2 — use cache + canonical + JSON-LD on PDP

`src/app/products/[slug]/page.tsx` received all SC5 additions:

**Cache directive on ProductContent:**

```typescript
async function ProductContent({ params }) {
  "use cache"
  const { slug } = await params
  cacheLife("hours")
  cacheTag(`product-${slug}`)   // Phase 5 admin updateTag() hook
  const product = await getProduct(slug)
  // ... breadcrumb, name, brand (static content)
}
```

`VariantStockPriceBlock` has NO `'use cache'` directive — stock/price always fetched fresh (RESEARCH Pitfall 2, T-02-13).

**generateMetadata with canonical:**

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const product = await getProduct(slug)
  return {
    title: `${product.name} | Mandy Store`,
    description: product.description ?? undefined,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, images: [...] },
  }
}
```

Relative canonical `/products/<slug>` resolves against `metadataBase` set on root layout in Plan 02-02.

**Product JSON-LD (XSS-safe):**

JSON-LD placed in `VariantStockPriceBlock` (fresh block) so `offers.availability` reflects actual current stock:

```typescript
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: product.name,
  brand: { "@type": "Brand", name: product.brand.name },
  offers: variants.map(v => ({
    "@type": "Offer",
    priceCurrency: "NGN",
    price: (v.priceKobo / 100).toFixed(2),
    availability: v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
  })),
}
// XSS mitigation — T-02-12
<script type="application/ld+json" dangerouslySetInnerHTML={{
  __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c")
}} />
```

**Build result:** `/products/[slug]` renders as `◐ Partial Prerender` — static content cached, dynamic stock/price/JSON-LD streamed. `tsc --noEmit` and `next build --webpack` both exit 0.

---

## Deviations from Plan

### Pre-existing completion

**Task 1 work already done (Plan 03 Wave 3 deviation):**
- `cacheComponents: true` was added to `next.config.ts` in Plan 03 as a Rule 3 fix (blocking build error with async page export).
- `images.remotePatterns` (picsum.photos + unsplash) was added in Plan 03 as well.
- Task 1 verified complete with all acceptance criteria checks passing. No changes made.
- No commit needed for Task 1.

### Architectural decision: JSON-LD placement

The plan offered two options for JSON-LD placement: ProductContent (cached, simple) or VariantStockPriceBlock (fresh, accurate stock). Chosen: **fresh block** to ensure `offers.availability` is not cached stale. This directly mitigates T-02-13 (over-caching stock as InStock). The trade-off is an extra full `getProduct` query per request for the fresh block — already existing since Plan 03, no performance regression.

---

## Threat Model Resolution

| Threat | Status |
|--------|--------|
| T-02-12 XSS via JSON-LD `</script>` injection | Mitigated — `.replace(/</g, "\\u003c")` present |
| T-02-13 Stale stock in JSON-LD offers | Mitigated — JSON-LD in uncached VariantStockPriceBlock |
| T-02-14 Wrong canonical domain | Accepted (dev) — relative canonical + metadataBase; NEXT_PUBLIC_BASE_URL needed at deploy |

---

## SC5 Deliverables Verification

| Deliverable | Status |
|-------------|--------|
| `cacheComponents: true` in next.config.ts | PASS |
| `images.remotePatterns` whitelists picsum.photos | PASS |
| ProductContent: `'use cache'` + `cacheLife('hours')` + `cacheTag('product-<slug>')` | PASS |
| VariantStockPriceBlock has NO `'use cache'` | PASS |
| `generateMetadata` with `alternates.canonical` | PASS |
| Product JSON-LD `application/ld+json` in page | PASS |
| XSS-safe serialization (`\\u003c`) | PASS |
| `cacheTag` hook for Phase 5 admin `updateTag()` | PASS |
| `npx tsc --noEmit` exits 0 | PASS |
| `npx next build --webpack` exits 0 | PASS |

---

## Known Stubs

None — all SC5 deliverables are fully wired.

---

## Threat Surface Scan

No new threat surface introduced. The JSON-LD `<script>` injection vector (T-02-12) was already in the plan's threat model and is mitigated by the `\\u003c` escape.

---

## User Setup Note

**Deploy-time action required:** Set `NEXT_PUBLIC_BASE_URL` to the production domain (e.g., `https://mandy-store.vercel.app`). The root layout uses this for `metadataBase`, which resolves the relative canonical `/products/<slug>` to an absolute URL. Dev falls back to the placeholder `https://mandy-store.vercel.app`.

---

## Deferred Items

**Pre-existing integration test state contamination:** When running `npx vitest run` (full suite) against the shared Neon database, some integration tests fail due to FK violations during truncation in `afterEach`/`afterAll` hooks (categories table delete fails when products still reference it). This is a pre-existing issue unrelated to Plan 04 changes. The 24 unit tests (no DB) in `tests/catalog/variant-resolver.test.ts` pass cleanly. Individual test file runs also pass (confirmed via stash test). Logged to `deferred-items.md`.

---

## Self-Check: PASSED

- `src/app/products/[slug]/page.tsx` — exists with `"use cache"` at line 73, `cacheLife`, `cacheTag`, `generateMetadata`, `canonical`, `application/ld+json`, `u003c`
- `next.config.ts` — `cacheComponents: true`, `picsum.photos` in `remotePatterns`
- Commit `9ab160f` — present in git log
- Build output: `/products/[slug]` renders as `◐ Partial Prerender` (confirming cache split)
- `npx tsc --noEmit` — exits 0 (clean)
- `npx next build --webpack` — exits 0
