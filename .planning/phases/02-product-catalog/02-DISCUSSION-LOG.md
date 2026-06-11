# Phase 2: Product Catalog - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 02-product-catalog
**Areas discussed:** Product & variant model, Browse & URL structure, Search/filter/sort UX, Product detail & variants

---

## Product & variant model

| Option | Description | Selected |
|--------|-------------|----------|
| Flexible per-product options | Per-product named option types; variant = combination, own SKU/price/stock | ✓ |
| Fixed option columns | Hard-coded color/storage/size columns | |

| Option | Description | Selected |
|--------|-------------|----------|
| Brand as its own table | brands table referenced by products; clean filtering | ✓ |
| Brand as text field | Plain string column | |

| Option | Description | Selected |
|--------|-------------|----------|
| Categories table (seeded) | categories table seeded with the 3; products reference it | ✓ |
| Fixed enum in code | Hard-coded pgEnum | |

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script, realistic products | Realistic catalog populated by a seed script; demoable now | ✓ |
| Minimal placeholder data | A few bare products until Phase 5 | |

**User's choice:** Flexible per-product options; brand table; categories table; realistic seed script.
**Notes:** Schema for products/categories/brands/variants is defined this phase (fulfills Phase 1 D-11 deferral). NGN minor-units integer pricing, never trust client price.

---

## Browse & URL structure

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated category pages | /electronics, /watches, /phones + all-products page | ✓ |
| Single catalog + filter | One /products page, category as a filter | |

| Option | Description | Selected |
|--------|-------------|----------|
| Home = storefront | / becomes category entry points + product grid | ✓ |
| Home minimal, /shop is catalog | Light landing, catalog at /products | |

| Option | Description | Selected |
|--------|-------------|----------|
| Slug-based | /products/<slug>, canonical URL | ✓ |
| ID-based | /products/[id] | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pagination (page param) | ?page=2, crawlable | ✓ |
| Load more button | Progressive reveal | |
| Infinite scroll | Auto-load on scroll | |

**User's choice:** Dedicated category pages; home = storefront; slug URLs; pagination.
**Notes:** Driven by SC5 (canonical URLs + SEO).

---

## Search / filter / sort UX

| Option | Description | Selected |
|--------|-------------|----------|
| Global header search bar | Search box in header on every page | ✓ |
| On the catalog page only | Search input on products/category page | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar facets, mobile drawer | Left-rail filters on desktop, drawer on mobile | ✓ |
| Top-bar dropdowns | Row of dropdown menus | |

| Option | Description | Selected |
|--------|-------------|----------|
| Price ↑/↓ + Newest | Two price sorts + newest | |
| Price ↑/↓ only | Just price sorts | |
| Price + Newest + Name A–Z | Adds alphabetical | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Friendly empty state + reset | No-match message + clear-filters / suggestions | ✓ |
| Plain 'no results' message | Simple text only | |

**User's choice:** Global header search; sidebar facets (mobile drawer); Price + Newest + Name A–Z; friendly empty state.
**Notes:** Search/filter/sort/pagination state lives in URL query params (SSR-friendly).

---

## Product detail & variants

| Option | Description | Selected |
|--------|-------------|----------|
| Option buttons / swatches | Selectable pills/swatches per option type | ✓ |
| Dropdown selects | One <select> per option type | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show but disable | OOS combos visible but greyed/not selectable | ✓ |
| Selectable + OOS label | Clickable, shows 'Out of stock' | |
| Hide unavailable | Remove OOS options | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tiered + low count | In stock / Only N left / Out of stock | ✓ |
| Simple In / Out | Just in/out | |
| Always exact count | Always 'N in stock' | |

| Option | Description | Selected |
|--------|-------------|----------|
| Visible CTA, wired in Phase 3 | Render add-to-cart, stub action until Phase 3 | ✓ |
| No cart button yet | Omit until Phase 3 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Product gallery + variant swap | Gallery; main image swaps on variant when available | ✓ |
| Single image per product | One hero image | |
| Full per-variant galleries | Complete image set per variant | |

**User's choice:** Swatches/buttons; show-but-disable OOS; tiered + low count; visible CTA stubbed; product gallery + variant image swap.
**Notes:** Live price/stock update on variant selection delivers CATA-04. Add-to-cart action deferred to Phase 3.

---

## Claude's Discretion

- Slug generation + collision strategy; price storage column type (NGN-minor-units intent locked).
- Low-stock threshold value; default sort order.
- Caching mechanism for content-vs-stock/price split (intent locked, mechanism for planner).
- JSON-LD structured data + canonical link implementation; grid layout/typography/skeletons.

## Deferred Ideas

- Add-to-cart behavior wiring — Phase 3.
- Admin product/variant CRUD + Vercel Blob image uploads — Phase 5.
- Reviews/ratings, wishlists, discount codes — v2.
- Brand landing pages/logos — supported by schema, out of scope this phase.
