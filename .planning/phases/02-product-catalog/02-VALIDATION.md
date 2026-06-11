---
phase: 2
slug: product-catalog
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 02-RESEARCH.md §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (already configured) |
| **Config file** | `vitest.config.ts` — loads `.env.local`, inlines next-auth, resolves `@/` alias, `fileParallelism: false` (shared Neon) |
| **Quick run command** | `npx vitest run tests/catalog/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (48 existing + new catalog tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/catalog/`
- **After every plan wave:** Run `npx vitest run` (full suite — all existing 48 + new catalog tests)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-* | 01 | 1 | CATA-01 / SC5 | — | Schema exports catalog tables; categories seed with 3 rows; variant.stock integer defined for Phase 4 atomic decrement | integration | `npx vitest run tests/catalog/schema.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-* | 02 | 2 | CATA-01/02/03 | — | getCatalog() filters by category, searches name/desc (ILIKE), filters brand + price range, sorts, paginates | integration | `npx vitest run tests/catalog/queries.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-* | 03 | 3 | CATA-04 | — | Variant resolver picks correct variant from selected options; stock indicator tiers ("Only N left" below threshold) | unit | `npx vitest run tests/catalog/variant-resolver.test.ts` | ❌ W0 | ⬜ pending |
| 2-04-* | 04 | 4 | SC5 | — | Product pages emit canonical URL + JSON-LD; product content cached, stock/price fresh per request | manual + static | see Manual-Only Verifications | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/catalog/schema.test.ts` — static schema checks (table exports, column presence) + integration (seed round-trip for categories, brands, a product with variants)
- [ ] `tests/catalog/queries.test.ts` — integration tests for `getCatalog()` and `getProduct()` (search, filter, sort, pagination)
- [ ] `tests/catalog/variant-resolver.test.ts` — pure unit tests for variant resolution logic + stock-indicator thresholds (no DB required)
- [ ] `tests/helpers/db.ts` — extend truncation helper to clear catalog tables in FK-safe order

> **Truncation order (FK-safe):** `variant_option_values` → `variants` → `option_values` → `product_options` → `product_images` → `products` → `brands` → `categories` (before auth tables)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live variant price/stock update on swatch click | CATA-04 | Client interactivity; requires rendered browser | On a PDP, select different option combinations; price and stock indicator update without a page reload |
| Sidebar facets collapse into mobile drawer | D-11 | Responsive layout | Resize to mobile width; filters appear behind a "Filters" drawer/sheet |
| Product content cached but stock/price fresh | SC5 | Cache behavior across requests | Edit stock in DB; reload PDP — stock reflects new value immediately while static content served from cache |
| Canonical URL + Product JSON-LD present | SC5 | Rendered HTML head inspection | View source / Rich Results Test on a PDP — `<link rel="canonical">` and `application/ld+json` Product present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
