# Phase 2: Product Catalog - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the first publicly-shippable storefront: customers **discover** products by
browsing (by category), **searching** (name/description), and **filtering/sorting**, and
**inspect** a product detail page with **live variant-aware price + stock** (CATA-01–04).

This phase also **defines the product/category/variant/brand schema** — explicitly deferred
from Phase 1 by D-11 ("defer products, categories, variants … to their respective phases,
where their requirements are discussed first"). The catalog is **seeded** with realistic data
because the admin panel (CRUD) does not arrive until Phase 5.

Per ROADMAP SC5, product pages must serve **fresh stock/price (not over-cached)**, carry
**canonical URLs**, and emit **Product structured data**.

**Out of this phase:** cart/add-to-cart wiring (Phase 3 — a CTA is rendered but its action is
a stub here), admin product CRUD and image uploads (Phase 5), checkout/payments (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Data model (products / variants / categories / brands)
- **D-01:** **Flexible per-product options.** Each product defines its own named option types
  (e.g. Color, Storage, Strap, Case size); a **variant is a combination of option values**, each
  variant carrying its **own SKU, price, and stock**. One uniform model across phones, watches,
  and electronics — no hard-coded color/storage columns.
- **D-02:** **Brand is its own table**, referenced by products (clean filter-by-brand for CATA-03,
  no string-casing drift, room for brand pages/logos later). Seeded alongside products.
- **D-03:** **Categories are a seeded table** (not a code enum), seeded with the fixed v1 set
  **Electronics, Watches, Phones**; products reference it. Enables clean category landing pages
  and growth without a migration. (Contrast: order_status stays a pgEnum; categories do not.)
- **D-04:** Prices are stored server-side in **NGN minor units (kobo) as integers** and displayed
  formatted as ₦. Totals/prices are always read from the DB, never trusted from the client
  (carries the CLAUDE.md "never trust client prices" constraint forward into the catalog layer).
  *(Storage representation is planner discretion; the NGN/integer intent is locked.)*

### Seeding (no admin panel until Phase 5)
- **D-05:** A **seed script populates a realistic catalog** — multiple products across all three
  categories, with brands, variants (price + stock per variant), and image URLs — so the
  storefront is demoable end-to-end this phase. Modeled on the existing admin seed script pattern
  (`src/scripts/seed.ts`). Image URLs are seeded directly now; Vercel Blob uploads wire in Phase 5.

### Browse & URL structure (canonical URLs / SEO — SC5)
- **D-06:** **Dedicated category pages** — `/electronics`, `/watches`, `/phones` are real,
  shareable landing pages — plus an all-products page. Filters/sort/search layer on via query params.
- **D-07:** **The home page (`/`) becomes the storefront landing** — category entry points + a
  featured/all-products grid. (Replaces the current Next.js default page.)
- **D-08:** **Slug-based product detail URLs** — `/products/<slug>` (unique slug generated from
  product name, seeded). This is the **canonical URL** for SC5.
- **D-09:** **Pagination via a `page` query param** (`?page=2`) — server-rendered and crawlable,
  the SEO-friendly choice over infinite scroll.

### Search / filter / sort UX
- **D-10:** **Global header search bar** present on every page; submitting goes to a results
  listing (query-param driven, e.g. `?q=`).
- **D-11:** **Sidebar facets on desktop, collapsing to a Filters drawer/sheet on mobile** for
  brand + price-range filters and sort control.
- **D-12:** **Sort options: Price ↑, Price ↓, Newest, Name A–Z.** (Price sort satisfies CATA-03;
  Newest is the natural default — planner may confirm default order.)
- **D-13:** **Friendly no-results state** — clear "no products match" message with a one-click
  "Clear filters / Browse all" action (and optionally a few suggested products). No dead-ends.
- **D-14:** Search/filter/sort/pagination state lives in **URL query params** (shareable,
  SSR-rendered, consistent with D-09 and the SEO requirement).

### Product detail & variant selection (CATA-04)
- **D-15:** **Option buttons / swatches** (a row of selectable pills/swatches per option type),
  not dropdowns. Selecting options **live-updates price and stock** for the resolved variant.
- **D-16:** **Out-of-stock combinations are shown but disabled** (greyed, not selectable) so
  shoppers can see the variant exists; purchase is disabled for an OOS selection.
- **D-17:** **Tiered stock indicator with low-stock count** — "In stock" / "Only N left" (below a
  low threshold) / "Out of stock". Exact inventory is not shown except when low.
- **D-18:** **Add-to-cart CTA is rendered** (enabled/disabled per variant stock) but its action is
  a **no-op/stub this phase** — Phase 3 (Cart) wires the real behavior. Keeps the PDP looking
  complete without pulling cart scope forward.
- **D-19:** **Product gallery with variant image swap** — each product has a small image gallery;
  selecting a variant swaps the main image when a variant-specific image exists, otherwise falls
  back to the product gallery.

### Claude's Discretion
- Exact slug-generation + collision strategy; price storage column type (the NGN-minor-units intent
  is locked, the representation is not).
- Low-stock threshold value for D-17; default sort order for D-12.
- Caching mechanism choice for the content-vs-stock/price split (see Canonical Refs) — the *intent*
  (fresh stock/price, cacheable content) is locked; the Next.js mechanism (revalidate tags, dynamic
  segments, etc.) is for research/planning.
- Product structured-data (JSON-LD) and canonical `<link>` implementation details — required by SC5,
  but the shape is planner/researcher territory.
- Grid layout specifics (columns, breakpoints), typography, loading skeletons.

</decisions>

<specifics>
## Specific Ideas

- Catalog should look and feel like a real, browsable store on day one (hence realistic seed data),
  not a skeleton waiting for the admin panel.
- "Only N left" urgency messaging on low stock; full inventory numbers stay private otherwise.
- Variant selection should feel tactile (swatches/pills) with the price and stock reacting immediately.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 2: Product Catalog" — goal, dependencies (Phase 1), and the 5
  success criteria (esp. SC5: fresh stock/price, canonical URLs, Product structured data).
- `.planning/REQUIREMENTS.md` — CATA-01 (browse by category), CATA-02 (search name/description),
  CATA-03 (sort by price, filter by brand/price range), CATA-04 (variant selection w/ live price).
- `.planning/PROJECT.md` — scope boundaries, out-of-scope list, "variants each carry own price + stock".

### Cross-phase constraints (carry forward)
- `CLAUDE.md` §"Critical Constraints" — **never trust client-submitted prices** (applies to how the
  catalog exposes price), **split product caching** (content vs stock/price), Next.js 16 `proxy.ts`.
- `.planning/STATE.md` §"Carried-Forward Constraints" — "Split product caching: content vs
  stock/price — Phases 2 and 5"; atomic stock decrement intent (enforced Phase 4, but the variant
  stock field is defined here).

### Existing code to extend
- `src/lib/db/schema.ts` — current Drizzle schema (auth tables + order_status enum +
  processed_webhook_events). Phase 2 **adds** products / categories / brands / variants tables here.
- `src/scripts/seed.ts` — existing idempotent seed-script pattern to model the catalog seed on.
- `.planning/codebase/` — `STRUCTURE.md`, `CONVENTIONS.md`, `STACK.md`, `ARCHITECTURE.md`
  (Tailwind v4, App Router `src/` layout, Neon/Drizzle conventions).
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-11 (schema deferral that this phase fulfills),
  established Drizzle/Next.js 16 patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Drizzle schema** (`src/lib/db/schema.ts`): pgTable/pgEnum/unique patterns established; add
  product/category/brand/variant tables alongside the existing auth + infra tables.
- **Seed script pattern** (`src/scripts/seed.ts`): idempotent upsert via `src/scripts/load-env.ts`
  for env loading — reuse for the catalog seed.
- **Auth UI components** (`src/components/auth/LoginForm.tsx`, `RegisterForm.tsx`): only existing
  client-component + Tailwind v4 styling reference for new catalog UI.
- **App Router layout** (`src/app/layout.tsx`, `globals.css`): site shell where the global header
  search bar (D-10) and storefront nav attach.

### Established Patterns
- Next.js 16 App Router, `src/` layout, Server Components by default; `proxy.ts` (not middleware).
- Async `searchParams` (Next.js 16) — already used in the verify-email page; the catalog's
  query-param-driven listings (D-14) follow the same async params pattern.
- NGN currency, flat-rate shipping (project-wide).

### Integration Points
- `/` (`src/app/page.tsx`) is replaced by the storefront landing (D-07).
- New public routes: `/electronics`, `/watches`, `/phones`, all-products, `/products/<slug>`,
  search results — none are auth-protected (catalog is public; `proxy.ts` matcher already excludes
  non-`/admin` `/account` paths).
- Variant stock field defined here is the same field Phase 4 will atomically decrement.

</code_context>

<deferred>
## Deferred Ideas

- **Add-to-cart behavior** — CTA rendered now (D-18) but wired in Phase 3 (Cart).
- **Admin product/variant CRUD + image uploads (Vercel Blob)** — Phase 5; catalog is seeded here.
- **Product reviews/ratings, wishlists, discount codes** — v2 (PROJECT.md out-of-scope).
- **Brand pages/logos** — brand table supports it (D-02), but dedicated brand landing pages are
  not in this phase's scope.

</deferred>

---

*Phase: 02-product-catalog*
*Context gathered: 2026-06-11*
