---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
last_updated: "2026-06-10T13:05:12.565Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State: Mandy Store

## Project Reference

**Core Value:** Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.
**Current Focus:** Phase 1 — Foundation (database schema, auth, route protection)
**Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4. Recommended: Neon Postgres + Drizzle, Auth.js v5, Stripe + PayPal + manual bank transfer, Resend, Vercel Blob.
**Currency:** NGN (Nigerian Naira)
**Shipping:** Flat rate

## Current Position

- **Phase:** 1 of 6 — Foundation
- **Plan:** None yet (run `/gsd-plan-phase 1`)
- **Status:** Roadmap complete, not started
- **Progress:** [          ] 0/6 phases complete

## Performance Metrics

- Phases completed: 0/6
- Plans completed: 0
- Requirements delivered: 0/27

## Accumulated Context

### Decisions

- Phase order follows the deterministic dependency chain: Foundation → Catalog → Cart → Checkout+Payments → Admin → Accounts.
- Order status machine and processed_webhook_events idempotency table must be designed into the schema in Phase 1, before any payment code is written.
- Payment method feature flags are server-only env vars (no NEXT_PUBLIC_ prefix), enforced in Server Actions / Route Handlers.
- Guest checkout is non-negotiable; accounts (Phase 6) are off the critical path to first sale.
- Cart cookie stores only { variantId, quantity }; totals always recalculated server-side.

### Carried-Forward Constraints (cross-phase pitfalls)

- Atomic stock decrement (`UPDATE ... WHERE stock > 0 RETURNING stock`) — design intent set in Phase 1 schema, enforced in Phase 4.
- Webhook idempotency via unique-constrained processed_webhook_events table — Phase 1 schema, enforced in Phase 4.
- Use `src/proxy.ts` (Next.js 16), not `middleware.ts` — Phase 1.
- Double-auth: proxy redirect + verifySession() in every protected action — Phases 1, 5, 6.
- Split product caching: content vs stock/price — Phases 2 and 5.

### Todos

- (none yet)

### Blockers

- Node.js local environment is v18.17.0; must upgrade to >=20.9.0 (recommend Node 22 LTS) before npm install — address at start of Phase 1.

### Open Questions (from research, resolve before/at relevant phase)

1. Which payment methods are enabled at launch? (affects Phase 4 go-live testing)
2. Currency/locale confirmed as NGN; flat-rate shipping confirmed.
3. How is the first admin user provisioned? (seed script vs setup route vs manual insert) — decide before Phase 5.
4. Verify third-party SDK versions on npm before Phase 4 install (Stripe, PayPal React SDK, Auth.js v5 Drizzle adapter).

## Session Continuity

**Last session:** 2026-06-10T13:05:12.561Z
**Next action:** Run `/gsd-plan-phase 1` to decompose the Foundation phase into executable plans.

---
*State initialized: 2026-06-10*
