---
phase: 4
slug: checkout-payments
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> See `04-RESEARCH.md` §"Validation Architecture" for the source strategy.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (loads `.env.local`; aliases next/server; next-auth inlined) |
| **Quick run command** | `npm test` (unit tests run; DB integration tests skip without `TEST_DATABASE_URL`) |
| **Full suite command** | `TEST_DATABASE_URL=<neon-test-branch> npm test` (runs DB integration suite) |
| **Estimated runtime** | ~30–60 seconds (Neon serverless cold-start tolerance: testTimeout=30s) |

**Critical isolation rule (CLAUDE.md):** DB integration tests TRUNCATE tables and MUST run only
against a separate `TEST_DATABASE_URL` Neon branch — never the dev `DATABASE_URL`. Truncate helpers
hard-refuse without `TEST_DATABASE_URL`. `fileParallelism=false` for shared Neon isolation.

---

## Sampling Rate

- **After every task commit:** Run `npm test` (unit/pure-logic feedback)
- **After every plan wave:** Run full suite with `TEST_DATABASE_URL` set
- **Before `/gsd-verify-work`:** Full suite green WITH `TEST_DATABASE_URL` set (esp. payment +
  idempotency integration tests — CLAUDE.md mandates this for Phase 4)
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Scaffold — the planner fills exact task IDs once plans exist. Every phase requirement below
> must map to at least one automated test (or a justified manual-only entry).

| Requirement | Secure Behavior | Test Type | Automated Command | Status |
|-------------|-----------------|-----------|-------------------|--------|
| CHKT-01 (guest checkout) | Guest can create an order without a user account | integration | `npm test` (checkout action) | ⬜ pending |
| CHKT-02 (shipping address) | Address persisted/snapshotted to order; required fields validated (zod) | unit + integration | `npm test` | ⬜ pending |
| CHKT-03 (flat shipping) | `FLAT_SHIPPING_KOBO` added to total server-side; default 200000 | unit | `npm test` (total calc) | ⬜ pending |
| CHKT-04 (order summary) | Summary total = server-recomputed line items + shipping (never client) | unit + integration | `npm test` | ⬜ pending |
| CHKT-05 (confirmation page) | Confirmation reachable via unguessable token; shows correct order | integration | `npm test` | ⬜ pending |
| PAY-01 (Stripe) | PaymentIntent amount = server-recomputed kobo total; mismatch rejected | integration | `npm test` (mocked Stripe) | ⬜ pending |
| PAY-02 (PayPal) | DEFERRED (D-05a — PayPal lacks NGN). Toggle defaults OFF; no integration. | — | n/a (toggle test only) | ⬜ deferred |
| PAY-03 (bank transfer) | Order created `awaiting_bank_transfer` (NOT paid); email w/ account + ref | integration | `npm test` | ⬜ pending |
| PAY-04 (toggles) | Disabled method rejected at action/route layer, not just UI | unit + integration | `npm test` | ⬜ pending |
| ORD-01 (confirmation email) | Email sent on `payment_confirmed` (webhook-driven) | integration | `npm test` (mocked Resend) | ⬜ pending |
| ORD-02 (bank-transfer email) | Email sent on bank-transfer order creation w/ details + ref | integration | `npm test` (mocked Resend) | ⬜ pending |
| Idempotency (SC5) | Duplicate webhook delivery does NOT create a 2nd order (processed_webhook_events) | integration | `npm test` | ⬜ pending |
| Atomic stock (SC5) | Concurrent confirmed payments cannot oversell; decrement WHERE stock >= qty | integration | `npm test` (concurrency) | ⬜ pending |
| Last-unit race (D-09) | Decrement returns 0 rows on paid order → refund + payment_failed + email | integration | `npm test` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Order schema tests (`tests/checkout/schema.test.ts`) — orders / order_items / address snapshot,
      order_status transitions, processed_webhook_events FK/unique
- [ ] Total-calculation pure-logic tests (`tests/checkout/totals.test.ts`) — line items + flat
      shipping, server-recompute, kobo math (no client trust)
- [ ] Webhook idempotency + atomic-decrement integration tests (`tests/checkout/webhook.test.ts`) —
      requires `TEST_DATABASE_URL`; mock Stripe/Resend per established cart-test pattern (vi.mock
      next/cache, next-auth)
- [ ] Truncate helper extended for new order tables (FK-safe order) in `tests/helpers/db.ts`

*Mirrors the Wave 0 test-infra pattern established in Phases 1–3.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Stripe Payment Element renders + 3DS challenge | PAY-01 | Real Stripe Elements iframe + test cards; not unit-testable | Use Stripe test card 4242…; confirm redirect to confirmation page + "Payment processing…" resolves |
| Real webhook delivery end-to-end | PAY-01/ORD-01 | Requires Stripe CLI `stripe listen`/`trigger` against running dev server | `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; trigger `payment_intent.succeeded`; confirm order flips + email |
| Confirmation email visual render | ORD-01/ORD-02 | Email client rendering | Inspect Resend dashboard / test inbox for both templates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
