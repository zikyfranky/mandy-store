---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 4 Plan 01 complete
last_updated: "2026-06-30T07:14:37Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 17
  completed_plans: 12
  percent: 71
---

# Project State: Mandy Store

## Project Reference

**Core Value:** Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.
**Current Focus:** Phase 4 — Checkout & Payments
**Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4. Neon Postgres + Drizzle, Auth.js v5, Stripe + PayPal + manual bank transfer, Resend, Vercel Blob.
**Currency:** NGN (Nigerian Naira)
**Shipping:** Flat rate

## Current Position

Phase: 4 (Checkout & Payments) — EXECUTING
Plan: 2 of 6

- **Phase:** 4 of 6 (checkout & payments)
- **Plan:** Plan 01 complete (order schema + shipping foundation)
- **Status:** Executing Phase 4
- **Progress:** [###########] 3/6 phases complete partial (12/17 plans complete)

## Performance Metrics

- Phases completed: 3 (partial — Phase 4 in progress)
- Plans completed: 12 (01-01, 01-02, 01-03, 01-04, 02-01, 02-02, 02-03, 02-04 — complete 2026-06-10/11; 03-01, 03-02, 03-03 — complete 2026-06-19; 04-01 — complete 2026-06-30)
- Requirements delivered: 12/27 (AUTH-01/02/03; CATA-01/02/03; CATA-04; SC5; CART-01/02/03) + CHKT-03 foundation (04-01)

## Accumulated Context

### Decisions

- Phase order follows the deterministic dependency chain: Foundation → Catalog → Cart → Checkout+Payments → Admin → Accounts.
- Order status machine and processed_webhook_events idempotency table must be designed into the schema in Phase 1, before any payment code is written.
- Payment method feature flags are server-only env vars (no NEXT_PUBLIC_ prefix), enforced in Server Actions / Route Handlers.
- Guest checkout is non-negotiable; accounts (Phase 6) are off the critical path to first sale.
- Cart cookie stores only { variantId, quantity }; totals always recalculated server-side.
- cart/cart_item tables live in Neon (Plan 03-01); CART_COOKIE='ms_cart', MAX_AGE=30d; hydrateCart computes all prices from variants.priceKobo only (SC4).
- drizzle-kit push requires TTY for some constraint prompts — use direct SQL via @neondatabase/serverless for non-interactive schema operations (see 03-01-SUMMARY.md).
- cart-db tests use afterEach + tracked-ID cleanup (not bulk truncateCatalogTables) to avoid contaminating schema.test.ts in sequential full-suite runs.
- getCartCount() isolated in async CartShell component wrapped in Suspense in RootLayout — required for cacheComponents:true PPR compatibility; direct await in RootLayout blocked static prerendering of auth pages (/_not-found, /account/register).
- login() D-10 merge: signIn(redirect:false) → auth() → mergeGuestCartOnLogin → redirect('/') — the NEXT_REDIRECT from signIn(redirectTo:'/') prevents any code after signIn from running; redirect:false allows the merge to execute.
- next/cache mocked in cart tests (vi.mock) to avoid 'static generation store missing' from revalidatePath — established pattern for all Server Action integration tests.
- CartProvider extended to hold cart:CartResult seeded from initialCart — drawer reads cart from context; revalidatePath in mutations re-seeds initialCart on next render (Plan 03-03).
- focus-trap-react@12.0.2 installed; CartDrawer uses FocusTrap with fallbackFocus=[data-cart-close] for empty-cart edge case (Plan 03-03).
- Checkout CTA routes to /cart as Phase 4 stub per UI-SPEC Decision Log — Phase 4 upgrades to /checkout (Plan 03-03).
- All acceptance criterion greps scan file text including comments — ensure class names (blue-600, font-bold) do not appear in comments as literal strings to avoid false-positive failures.
- Node 22 pinned via .nvmrc; all deps (argon2 native addon, drizzle-orm, next-auth@beta) installed on Node 22.
- Drizzle schema uses pgEnum for order_status (8 values) and role; processedWebhookEvents table has named unique constraint for webhook idempotency.
- Auth.js v5 Drizzle adapter shape confirmed. **D-08 (corrected @048cec7):** the initial Plan 01-02 approach (session.strategy:"database" + jwt-callback db.insert) was WRONG — @auth/core forbids database strategy with Credentials (threw UnsupportedStrategy → login 500). Correct pattern: session.strategy:"jwt" + jwt.encode/decode overrides that mint/resolve a real DB session row (so sessions stay database-backed and server-side revocable per D-06). RESEARCH Pattern 1 was incorrect — note for future auth work.
- DAL verifySession()/verifyAdminSession() implemented in src/lib/dal.ts with import "server-only" guard; 9 unit tests passing.
- Resend email seam implemented in src/lib/email/send-verification.ts; React Email template in src/emails/VerificationEmail.tsx.
- Auth.js route handler wired at src/app/api/auth/[...nextauth]/route.ts.
- Auth Server Actions in src/lib/actions/auth.ts: register (argon2id, ADMIN_EMAILS D-10a, zod, single-use 24h tokens), verifyEmail (expiry check+delete, T-01-12), login (generic error T-01-11), logout (signOut).
- Admin seed script at src/scripts/seed.ts: idempotent upsert, argon2id, sets emailVerified, ADMIN_EMAILS env (D-10b).
- 25 integration tests in tests/auth/ all green; vitest fileParallelism=false for shared Neon isolation.
- Vitest config: next-auth inlined + next/server alias to resolve ESM in test context.
- src/proxy.ts created (Plan 01-04): auth() wrapper, redirects unauth→/account/login, non-admin→/, already-authed→/ from login/register; matcher excludes _next/ and api/.
- Auth UI wired (Plan 01-04): LoginForm (name="identifier", D-04), RegisterForm, verify-email page (async searchParams, Next.js 16).
- Admin/orders stubs with in-page verifyAdminSession()/verifySession() double-auth (SC4, CLAUDE.md).
- playwright.config.ts webServer uses npx next dev --webpack (Turbopack unavailable on darwin/arm64).
- Playwright e2e: 2/2 redirect tests pass; non-admin case is test.skip (manual checkpoint covers it).
- vitest.config.ts loads .env.local (Node loadEnvFile) so `npx vitest run` passes bare (48/48); src/scripts/load-env.ts does the same for the standalone seed script.
- Code review (01-REVIEW.md): 0 blockers, 7 warnings, 4 info — advisory, deferred. Notable for follow-up: register() partial-failure recovery (WR-02), verify-email page refresh shows "Invalid token" after success (WR-06), proxy /account matcher hardcoded vs startsWith (WR-01). Run /gsd-code-review-fix 1 to address.
- Phase 2 Plan 01: 8 catalog tables (brands, categories, products, productImages, productOptions, optionValues, variants, variantOptionValues) pushed to Neon with Drizzle relations. variants.priceKobo (NGN integer kobo, D-04) and variants.stock (Phase 4 atomic decrement target) established at data layer. 6-product realistic seed across 3 categories (Electronics/Watches/Phones), 4 brands, 29 variants with OOS+low-stock coverage, picsum.photos images (D-05). Wave 0 test scaffold: schema.test.ts (14 tests), queries.test.ts (scaffold), variant-resolver.test.ts (scaffold). truncateCatalogTables() FK-safe helper in tests/helpers/db.ts. slugify installed; toSlug/uniqueSlug in src/lib/utils/slug.ts. 64/64 tests passing.
- Array-return extra-config style used for Phase 2 tables in schema.ts (both styles valid in drizzle-orm 0.45.2; existing tables unchanged).
- getCatalog uses Drizzle subquery MIN(price_kobo) per product for price sorting and filtering; cards show "From ₦X,XXX" (RESEARCH Pitfall 4).
- cacheComponents: true + Suspense boundaries adopted for all async Server Components — catalog pages use Partial Prerender (◐). All existing auth pages retrofitted.
- parseCatalogParams with Zod: q≤100chars, price clamped 0..1e9 kobo, sort allowlisted, page clamped 1..1000 (T-02-04..07 mitigations).
- vitest testTimeout + hookTimeout raised to 30s for Neon serverless cold-start latency tolerance.
- CATA-01/02/03 delivered: category pages /electronics /watches /phones, search /search?q=, filter by brand + price range, sort by Price↑/↓/Newest/Name A-Z (all URL-driven SSR per D-14).
- CATA-04 delivered (Plan 02-03): PDP at /products/[slug] with prop-driven variant resolution (resolveVariant), live price+stock via useState, OOS-disable (D-16), tiered stock labels (D-17), CTA stub (D-18), gallery variant image swap (D-19). Suspense split: ProductContent (cacheable boundary for Plan 04) + VariantStockPriceBlock (always dynamic). getProduct query extended to include optionValue.option nested join for productOption.name. Non-async default export pattern required for cacheComponents mode.
- SC5 delivered (Plan 02-04): ProductContent cached via 'use cache' + cacheLife('hours') + cacheTag('product-<slug>'). VariantStockPriceBlock stays dynamic (no use cache). generateMetadata with alternates.canonical (/products/<slug>, relative, resolves via metadataBase). Product JSON-LD in fresh block (schema.org Product + offers with InStock/OutOfStock per current stock). XSS mitigation: .replace(/</g, "\\u003c") on JSON.stringify. cacheTag hook established for Phase 5 admin updateTag() invalidation. Build: ◐ Partial Prerender. Phase 02 fully complete.
- Plan 04-01 complete: orders + order_item tables in Neon (dev + test databases). FLAT_SHIPPING_KOBO=200000 (default) server-only constant in src/lib/orders/shipping.ts. truncateOrderTables() helper in tests/helpers/db.ts. Schema applied via direct SQL (@neondatabase/serverless fallback — TTY prompt blocked drizzle-kit push). Schema must be applied to both DATABASE_URL and TEST_DATABASE_URL separately. JavaScript sort() is lexicographic — use .sort((a,b)=>a-b) for numeric ordering in tests. 159/159 tests pass.

### Carried-Forward Constraints (cross-phase pitfalls)

- Atomic stock decrement (`UPDATE ... WHERE stock > 0 RETURNING stock`) — design intent set in Phase 1 schema, enforced in Phase 4.
- Webhook idempotency via unique-constrained processed_webhook_events table — Phase 1 schema created (Plan 01-01), enforced in Phase 4.
- Use `src/proxy.ts` (Next.js 16), not `middleware.ts` — Phase 1 (Plan 01-02).
- Double-auth: proxy redirect + verifySession() in every protected action — Phases 1, 5, 6.
- Split product caching: content vs stock/price — Phases 2 and 5.
- Drizzle ExtraConfigBuilder uses symbol-keyed API (not `._`) for accessing unique constraint names — documented in 01-01-SUMMARY.md.

### Todos

- (none yet)

### Blockers

- None

### Open Questions (from research, resolve before/at relevant phase)

1. Which payment methods are enabled at launch? (affects Phase 4 go-live testing)
2. Currency/locale confirmed as NGN; flat-rate shipping confirmed.
3. How is the first admin user provisioned? (seed script + ADMIN_EMAILS env allowlist — confirmed in D-10, implemented in Plan 01-02)
4. Verify third-party SDK versions on npm before Phase 4 install (Stripe, PayPal React SDK, Auth.js v5 Drizzle adapter).

## Session Continuity

**Last session:** 2026-06-30T07:14:37Z
**Stopped at:** Phase 4 Plan 01 complete (order schema + shipping foundation)
**Next action:** Execute Phase 4 Plan 02 (payment config + Stripe lib)

---
*State initialized: 2026-06-10*
