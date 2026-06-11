---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: "Plan 01-04 Tasks 1-3 complete; hitting manual human-verify checkpoint (Task 4). All automated work done: proxy.ts, auth UI, e2e tests green. User must run the live auth journey manually."
last_updated: "2026-06-11T15:17:40.933Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# Project State: Mandy Store

## Project Reference

**Core Value:** Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.
**Current Focus:** Phase 01 — foundation
**Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4. Neon Postgres + Drizzle, Auth.js v5, Stripe + PayPal + manual bank transfer, Resend, Vercel Blob.
**Currency:** NGN (Nigerian Naira)
**Shipping:** Flat rate

## Current Position

Phase: 01 (foundation) — EXECUTING (awaiting manual checkpoint)
Plan: 4 of 4 — EXECUTING (01-04-PLAN.md — Tasks 1-3 complete; Task 4 is manual human-verify checkpoint)

- **Phase:** 2 of 6 (product catalog)
- **Plan:** Not started
- **Status:** Ready to plan
- **Progress:** [####      ] 3/4 phase-1 plans complete (01-04 partial)

## Performance Metrics

- Phases completed: 0/6
- Plans completed: 3 (01-01 complete 2026-06-10 ~35 min; 01-02 complete 2026-06-10 ~67 min; 01-03 complete 2026-06-11 ~45 min)
- Plans in-progress: 1 (01-04 Tasks 1-3 done ~30 min; Task 4 manual checkpoint pending)
- Requirements delivered: 3/27 (AUTH-01/02/03 server-side; UI wired in 01-04)

## Accumulated Context

### Decisions

- Phase order follows the deterministic dependency chain: Foundation → Catalog → Cart → Checkout+Payments → Admin → Accounts.
- Order status machine and processed_webhook_events idempotency table must be designed into the schema in Phase 1, before any payment code is written.
- Payment method feature flags are server-only env vars (no NEXT_PUBLIC_ prefix), enforced in Server Actions / Route Handlers.
- Guest checkout is non-negotiable; accounts (Phase 6) are off the critical path to first sale.
- Cart cookie stores only { variantId, quantity }; totals always recalculated server-side.
- Node 22 pinned via .nvmrc; all deps (argon2 native addon, drizzle-orm, next-auth@beta) installed on Node 22.
- Drizzle schema uses pgEnum for order_status (8 values) and role; processedWebhookEvents table has named unique constraint for webhook idempotency.
- Auth.js v5 Drizzle adapter shape confirmed; D-08 workaround implemented in Plan 01-02 (manual db.insert(sessions) in jwt callback when account.provider === "credentials").
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
- D-08 side-effect: UnsupportedStrategy error logged per proxy request; functionally harmless (proxy redirects work); accepted limitation.

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

- None (Plan 01-01 fully complete; 01-02 ready to start)

### Open Questions (from research, resolve before/at relevant phase)

1. Which payment methods are enabled at launch? (affects Phase 4 go-live testing)
2. Currency/locale confirmed as NGN; flat-rate shipping confirmed.
3. How is the first admin user provisioned? (seed script + ADMIN_EMAILS env allowlist — confirmed in D-10, implemented in Plan 01-02)
4. Verify third-party SDK versions on npm before Phase 4 install (Stripe, PayPal React SDK, Auth.js v5 Drizzle adapter).

## Session Continuity

**Last session:** 2026-06-11T02:25:00Z
**Stopped at:** Plan 01-04 Tasks 1-3 complete; hitting manual human-verify checkpoint (Task 4). All automated work done: proxy.ts, auth UI, e2e tests green. User must run the live auth journey manually.
**Resume file:** .planning/phases/01-foundation/01-04-PLAN.md (Task 4 manual checkpoint)

---
*State initialized: 2026-06-10*
