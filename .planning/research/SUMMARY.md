# Research Summary: Mandy Store

**Synthesized:** 2026-06-05
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md
**Consumed by:** gsd-roadmapper

---

## Executive Summary

Mandy Store is a well-understood problem domain: a single-vendor electronics ecommerce store with three product categories, multi-variant inventory, three payment methods, and an admin panel for product and order management. The architecture is entirely conventional for a Next.js 16 App Router project deployed on Vercel — no novel technical challenges exist here. The biggest risk is not figuring out what to build but rather getting the ordering right, because there is a strict dependency chain from database schema → auth → catalog → cart → checkout → payments. Building anything in the wrong order creates rework.

The recommended approach is PostgreSQL on Neon with Drizzle ORM, Auth.js v5 for both customer and admin auth, Stripe Payment Intents + PayPal React SDK + a manual bank transfer flow, Resend + React Email for transactional email, and Vercel Blob for image storage. All of these are well-matched to the Vercel deployment target and the Next.js 16 serverless runtime. Pricing is manageable: Neon free tier, Resend 3,000 emails/month free, Vercel Blob 5GB/100GB free — the store can operate at zero infrastructure cost until it has meaningful order volume. One critical environment prerequisite: Node.js must be upgraded from v18.17.0 to >=20.9.0 (recommend Node 22 LTS via nvm) before any development work.

The top security and data integrity risks — overselling due to non-atomic stock checks, duplicate order processing from unidempotent webhooks, price manipulation from trusting client-submitted cart totals, and admin route protection relying only on proxy.ts — are all well-understood and have clear prevention patterns. None of them are hard to implement correctly; they are only dangerous if overlooked. The order status machine must also be designed up front before any payment webhook is written, because retrofitting a canonical status abstraction across three payment providers after the fact is painful.

---

## Recommended Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Next.js (App Router) | 16.2.7 | Locked — already scaffolded |
| Language | TypeScript | 5.x | Locked |
| Styling | Tailwind CSS | v4 | Locked |
| UI Primitives | shadcn/ui + Radix UI | latest CLI | Tailwind-native, zero runtime dep, you own the code |
| Database | PostgreSQL via Neon | 16.x | ACID guarantees for orders/inventory; Vercel-native integration |
| ORM | Drizzle ORM + drizzle-kit | ~0.36.x / ~0.27.x | Edge-safe, no codegen, smaller bundle than Prisma for serverless |
| Auth | Auth.js v5 + @auth/drizzle-adapter | ^5.0.0 | Self-hosted, App Router native, supports guest checkout flow |
| Payments — card | Stripe (Payment Intents + Elements) | SDK ~17.x | PCI-compliant embedded checkout; server-side webhook confirmation |
| Payments — PayPal | @paypal/react-paypal-js | ~8.x | Official React SDK; server-side order capture |
| Payments — bank | Custom flow (no SDK) | — | Order created as awaiting_bank_transfer; admin marks paid manually |
| Payment flags | Environment variable config | — | ENABLE_STRIPE, ENABLE_PAYPAL, ENABLE_BANK_TRANSFER — server-only |
| Forms | React Hook Form + Zod | ~7.x / ~3.x | Dominant Next.js pattern; shared client/server validation schemas |
| Email | Resend + React Email | ~4.x / ~0.0.x | Transactional email with JSX templates; 3K/month free |
| Images | next/image + Vercel Blob | built-in / ~0.x | Native Vercel integration; CDN-served; no extra credentials |
| Search (v1) | Postgres full-text search (tsvector) | built-in | Sufficient for <10K SKUs; zero additional service |
| Search (v2) | Algolia or Typesense | — | Research when catalog exceeds ~5K SKUs |
| Cart state | Server-side cookie + DB | — | Survives refresh; guest-to-account merge; no hydration risk |

**Node.js prerequisite:** upgrade local environment from v18.17.0 to Node 22 LTS before npm install.

All third-party package versions above are approximations (knowledge cutoff August 2025). Verify on npmjs.com before pinning in package.json, particularly: drizzle-orm, next-auth (v5 stable vs beta status), stripe, @paypal/react-paypal-js, resend.

---

## Table Stakes Features (Must Ship in v1)

### Product Catalog
- Category browsing (Electronics / Watches / Phones)
- Product listing page: thumbnail, name, price, stock indicator
- Filtering: category, price range, brand
- Sorting: price asc/desc, newest
- Product detail page: multiple images, structured specs table, variant selector (color/storage), stock indicator

### Cart
- Add/remove/update quantity from product detail page
- Cart drawer or cart page showing all items with selected variant labels
- Cart persists across sessions (server-side cookie)
- Line item subtotals and cart total

### Checkout
- Guest checkout (no account required) — non-negotiable; losing this loses ~35% of conversions
- Shipping address form
- Order summary panel
- Shipping cost displayed before payment
- Payment method selection: Stripe, PayPal, bank transfer (each independently toggleable)
- Order review step before submission

### Post-Purchase
- Order confirmation page with order number
- Order confirmation email (item list, quantities, total, shipping address, order ID)
- Order status page (pending / processing / shipped / delivered)

### Admin Panel
- Product CRUD with multi-image upload and variant matrix (each variant: own price + own stock)
- Inventory stock editing per variant
- Order list (filterable by status) + order detail view
- Order status update (triggers fulfillment email)
- Admin authentication (role-gated, separate from customer auth)

### Low-Effort Differentiators to Include in v1
- Live variant price update when user selects a variant (React state, trivial)
- Sticky "Add to Cart" button on mobile scroll (CSS only)
- Stock urgency signal: "Only N left" when quantity <= 5 (one conditional render)
- Cart line item shows selected variant label, not just product name
- Payment method logos as trust signals in checkout and footer

---

## Suggested Phase Order

Dependencies dictate this sequence. Nothing in a later phase can be built without the phase before it being complete.

### Phase 1: Foundation — Database, Auth, Project Setup
**Delivers:** A working development environment with schema, session management, and route protection in place.

- Node.js upgrade (v18 -> v22 LTS)
- shadcn/ui initialization (verify Tailwind v4 compat)
- Drizzle ORM + Neon Postgres setup
- Full database schema: products, product_variants, orders, order_items, customers, addresses, processed_webhook_events
- Order status enum defined up front: pending_payment -> awaiting_bank_transfer | payment_confirmed -> processing -> shipped -> delivered + cancelled, payment_failed
- Auth.js v5 setup: customer + admin roles, session/DAL layer, src/proxy.ts route protection
- Login, register pages
- Double-auth pattern enforced: proxy.ts for redirects + verifySession() inside every Server Action

**Why first:** Everything else has a hard dependency on the schema and auth. The order status machine must be committed to before any payment code is written.

**Research flag:** No additional research needed. All patterns are well-documented in official Next.js 16 docs.

---

### Phase 2: Product Catalog
**Delivers:** A browsable, searchable, filterable storefront. First publicly shippable piece.

- Storefront route groups and layouts: (storefront), (checkout), (auth), (admin)
- Homepage with featured products and category navigation
- /shop and /shop/[category] product listing with filtering (category, price range, brand) and sorting
- /product/[slug] product detail: multi-image display, structured specs, variant selector (client island), stock indicator, sticky Add to Cart on mobile
- Postgres full-text search on product name + description (GIN index on generated tsvector column)
- next/image with remotePatterns configured for Vercel Blob from the start
- Caching strategy: use cache + cacheTag on catalog/product data; stock/price NOT cached beyond session; revalidateTag called on every admin product update
- Product JSON-LD structured data and canonical URLs on product detail pages

**Why second:** Cart needs variant IDs from the catalog. Admin product management also depends on the product schema.

**Research flag:** No additional research needed.

---

### Phase 3: Cart
**Delivers:** A fully functional cart that survives page navigation and browser refresh for both guest and authenticated users.

- Server-side cart via HTTP-only cookie (stores [{ variantId, quantity }] only — never prices)
- Server Actions: addToCart, removeFromCart, updateQuantity (quantity clamped to stock)
- Cart drawer (client component island) + /cart page
- Cart count in header via Server Component reading cookie
- useOptimistic for instant UI feedback on cart mutations
- Guest cart keyed by session cookie ID (not localStorage alone)
- Cart line items show selected variant label ("iPhone 15 — 256GB Black")
- Stock urgency signal ("Only N left") on cart items

**Why third:** Checkout cannot exist without a cart.

**Pitfalls to avoid:** Cart cookie stores only variantId + quantity — never prices. Server recalculates total from DB at checkout. Guest session ID in cookie for cart continuity.

**Research flag:** No additional research needed.

---

### Phase 4: Checkout and Payments
**Delivers:** End-to-end purchase flow with all three payment methods and order creation.

- Checkout route group with minimal chrome layout
- Shipping address form (React Hook Form + Zod, client + server validation)
- Order summary panel (Server Component)
- Atomic stock check at checkout: UPDATE variants SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock — not a separate read + write
- Order creation with canonical status machine
- Stripe Payment Intents + Elements (embedded, not redirect)
- PayPal React SDK with server-side order create and capture
- Bank transfer flow: order created as awaiting_bank_transfer, bank details displayed in confirmation, admin marks paid manually
- Payment feature flags enforced in Server Actions and Route Handlers (not only in UI)
- Stripe webhook handler (/api/webhooks/stripe) with processed_webhook_events idempotency table
- PayPal webhook handler (/api/webhooks/paypal) with same idempotency guard
- Checkout double-submission prevention: disable submit button on first click + server-side idempotency key
- Order confirmation page
- Order confirmation email via Resend + React Email template

**Why fourth:** Strict dependency on cart (Phase 3) and auth (Phase 1).

**Pitfalls to avoid (critical):** Non-atomic stock check causes overselling. Webhook idempotency not enforced causes duplicate orders. Client-submitted prices trusted for payment amount. Payment feature flags enforced only in UI. Order status diverges across payment providers.

**Research flag:** Likely needs /gsd-research-phase to verify current Stripe SDK version, PayPal webhook event names, and Auth.js v5 Drizzle adapter setup against current npm releases.

---

### Phase 5: Admin Panel
**Delivers:** Full store management — product CRUD, inventory management, order fulfillment.

- Admin route group with sidebar layout
- Admin auth: every Server Action re-verifies session + admin role (not proxy-only)
- Product list (paginated), create, edit, delete/archive (soft delete)
- Variant matrix UI: add/edit/delete variants per product, each with own price + stock
- Product image upload to Vercel Blob (client-side direct upload via signed URL)
- Admin image upload form: alt text required field, validated server-side
- Inventory stock editing per variant
- Order list (filterable by status) + order detail view
- Order status update Server Action: calls confirmOrder() / shipOrder() shared functions — never sets status field directly
- Status transition emails: send fulfillment email when order moves to shipped
- revalidateTag('products') on every product save to expire catalog cache
- DAL enforces: Server Actions return minimal DTOs, not raw DB records

**Why fifth:** Depends on auth (Phase 1), product schema (Phase 2), order schema (Phase 4). Can begin in parallel with Phase 4 once auth and schemas are solid.

**Pitfalls to avoid:** Admin Server Actions unguarded by auth check. Raw DB records leaking to client. Missing status-change emails. Product images with empty alt text.

**Research flag:** No additional research needed.

---

### Phase 6: Customer Accounts
**Delivers:** Optional account features for repeat buyers.

- Account creation at or after checkout ("Save your details" CTA)
- Login / logout
- Order history page (/account/orders, protected by proxy.ts + verifySession)
- Saved shipping addresses
- Guest cart merge into user cart at login

**Why last:** Table stakes features are complete without accounts. Accounts add value for repeat buyers but are not on the critical path for the first sale.

**Research flag:** No additional research needed.

---

## Critical Pitfalls Summary

| # | Pitfall | When to Address | Prevention |
|---|---------|----------------|------------|
| 1 | Admin routes protected only at proxy layer | Phase 1 (auth setup) | Every admin Server Action calls verifySession() as first statement |
| 2 | Non-atomic stock check causes overselling | Phase 3/4 (cart/checkout) | Single atomic UPDATE ... WHERE stock > 0 RETURNING stock |
| 3 | Webhook duplicate processing (no idempotency) | Phase 4 (payments) | processed_webhook_events table with unique constraint on event ID; wrap in DB transaction |
| 4 | Client-submitted cart prices trusted for payment | Phase 3 (cart) | Server always recalculates total from DB before creating PaymentIntent |
| 5 | Order status diverges across payment providers | Phase 1 (schema design) | Define canonical status enum and confirmOrder() abstraction before writing any webhook |
| 6 | Payment feature flags enforced only in UI | Phase 4 (payments) | Feature flag check at top of every payment Server Action and Route Handler (server-only env vars, no NEXT_PUBLIC_ prefix) |
| 7 | Product pages cache stock/price with long TTL | Phase 2 (catalog) | Split cache: product content uses cacheTag; stock/price either streaming or cacheLife('minutes') |
| 8 | middleware.ts used instead of proxy.ts | Phase 1 | Create src/proxy.ts, export proxy() function — Next.js 16 breaking change from all tutorials |

---

## Key Open Questions (Decisions Needed Before Planning)

These must be resolved before the roadmap is finalized or before the relevant phase begins.

1. **Which payment methods are enabled at launch?** All three are built, but if the owner does not have a Stripe or PayPal merchant account ready, the environment flags let those providers be disabled. Knowing this affects what must be tested before go-live.

2. **Shipping cost model.** Research assumes a flat rate or "included in price" model. Is there a fixed shipping fee per order? Per region? Free above a threshold? This determines whether shipping_total is calculated dynamically or hardcoded. Flat rate is simplest for v1.

3. **Currency and locale.** A single currency is assumed. If the store serves multiple markets, price handling and Stripe PaymentIntent currency must be decided up front — this affects the schema.

4. **Image storage volume.** Vercel Blob free tier is 5GB / 100GB bandwidth per month. Confirm expected catalog size and images-per-product to validate Vercel Blob vs. a dedicated object store.

5. **Admin user provisioning.** How will the first admin user be created? Options: database seed script, a one-time setup route, or manual DB insert. Must be decided before the admin panel is built.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| Feature set | HIGH | Well-established domain consensus; benchmarked against Apple Store, B&H, Newegg |
| Architecture patterns | HIGH | Verified against Next.js 16.2.7 official docs; proxy.ts rename confirmed |
| Build order / phase dependencies | HIGH | Dependency chain is deterministic; no ambiguity |
| Database schema | MEDIUM | Standard ecommerce patterns; implementation details may need adjustment |
| Stack technology choices | MEDIUM | Rationale is sound; all versions approximate (knowledge cutoff Aug 2025) — verify on npm |
| Auth.js v5 Drizzle adapter | MEDIUM | v5 stable status and adapter version compatibility need npm verification |
| PayPal React SDK | LOW | Version unverified; confirm on npm and PayPal developer docs before Phase 4 |
| Vercel Blob free tier limits | MEDIUM | Verify current limits at vercel.com/docs before committing to it as primary image store |

**Overall: MEDIUM-HIGH.** Architecture and feature decisions are solid. Main uncertainty is package version accuracy for third-party SDKs, all resolvable with npm lookups before each install.

---

## Aggregated Sources

- Next.js 16.2.7 official documentation (nextjs.org) — architecture, proxy.ts, Server Actions, caching — HIGH confidence
- PROJECT.md — scope, constraints, and requirements — authoritative
- Training knowledge (cutoff Aug 2025) — stack choices, feature benchmarks, ecommerce domain patterns — MEDIUM confidence
- Industry consensus (Apple Store, Samsung, B&H, Newegg, Best Buy) — feature expectations — HIGH confidence
- Stripe, PayPal public documentation knowledge — payment patterns — MEDIUM confidence

Version verification before npm install:
- https://orm.drizzle.team/docs/overview
- https://authjs.dev/getting-started
- https://neon.tech/docs
- https://stripe.com/docs/payments/payment-intents
- https://github.com/paypal/react-paypal-js
- https://resend.com/docs
- https://vercel.com/docs/storage/vercel-blob
- https://ui.shadcn.com/docs/installation/next
