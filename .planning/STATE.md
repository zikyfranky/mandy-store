---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-06-11T03:15:00Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 12
---

# Project State: Mandy Store

## Project Reference

**Core Value:** Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.
**Current Focus:** Phase 01 — foundation
**Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4. Neon Postgres + Drizzle, Auth.js v5, Stripe + PayPal + manual bank transfer, Resend, Vercel Blob.
**Currency:** NGN (Nigerian Naira)
**Shipping:** Flat rate

## Current Position

Phase: 01 (foundation) — EXECUTING
Plan: 4 of 4 — NEXT (01-04-PLAN.md)

- **Phase:** 1 of 6 — Foundation
- **Plan:** 01-01 COMPLETE; 01-02 COMPLETE; 01-03 COMPLETE; next is 01-04 (proxy.ts + auth UI)
- **Status:** EXECUTING — Plans 01-01, 01-02, 01-03 done; Plan 01-04 remaining
- **Progress:** [###       ] 3/4 phase-1 plans complete

## Performance Metrics

- Phases completed: 0/6
- Plans completed: 3 (01-01 complete 2026-06-10 ~35 min; 01-02 complete 2026-06-10 ~67 min; 01-03 complete 2026-06-11 ~45 min)
- Requirements delivered: 3/27 (AUTH-01/02/03 delivered; full UI delivery in Plan 01-04)

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

**Last session:** 2026-06-11T03:15:00Z
**Stopped at:** Plan 01-03 fully complete (Tasks 1-3 done; auth.ts+seed.ts live; 25/25 tests pass; tsc clean)
**Resume file:** .planning/phases/01-foundation/01-04-PLAN.md

---
*State initialized: 2026-06-10*
