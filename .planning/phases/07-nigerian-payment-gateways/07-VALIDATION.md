---
phase: 7
slug: nigerian-payment-gateways
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `07-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing — no new config) |
| **Config file** | `vitest.config.ts` (existing; loads `.env.local`, `fileParallelism=false`) |
| **Quick run command** | `npm test` (unit only; DB integration tests skip without `TEST_DATABASE_URL`) |
| **Full suite command** | `TEST_DATABASE_URL=<neon-test-branch> npm test` |
| **Estimated runtime** | ~30–60 s unit; +Neon cold-start for integration |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (unit tests, no DB required)
- **After every plan wave:** Run `TEST_DATABASE_URL=<test-branch> npm test` (full suite incl. integration)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 s (unit)

---

## Per-Task Verification Map

*Populated per-task by the planner as tasks are defined. Each task's `<acceptance_criteria>` maps to a row below. The requirement→test map and Wave 0 gaps (from research) are the authoritative source until then.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirements → Test Map (from research)

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| PAY-12 | `isPaymentMethodEnabled("paystack"/"flutterwave")` false when `ENABLE_*` unset or secret missing | unit | `npm test -- tests/payments/config.test.ts` |
| PAY-12 | `initPaystackPayment` / `initFlutterwavePayment` return `{ error }` when toggle disabled (first statement) | unit | `npm test -- tests/checkout/actions.test.ts` |
| PAY-05 | Paystack webhook `charge.success` → `payment_confirmed`, stock decremented, email sent | integration (DB) | `npm test -- tests/checkout/paystack-webhook.test.ts` |
| PAY-05 | Paystack webhook duplicate event → no-op (idempotency) | integration (DB) | same |
| PAY-05 | Paystack webhook invalid signature → 400 | unit (always-runs) | same |
| PAY-05 | Paystack verify-on-callback valid reference → `payment_confirmed`; collides with webhook idempotency | integration (DB) | same |
| PAY-06 | Flutterwave webhook `charge.completed` + `status:"successful"` → confirmed, decrement, email | integration (DB) | `npm test -- tests/checkout/flutterwave-webhook.test.ts` |
| PAY-06 | Flutterwave webhook duplicate `tx_ref` → no-op | integration (DB) | same |
| PAY-06 | Flutterwave webhook invalid signature → 400 | unit (always-runs) | same |
| PAY-06 | Flutterwave amount: verify rejects when `amountNaira × 100 < order.totalKobo` (100× bug guard) | unit | `npm test -- tests/payments/gateways.test.ts` |
| — | Last-unit race (both gateways) → refund API called + `payment_failed` + `refundReason` | integration (DB) | webhook test files |
| — | `confirmOrderPaid()` called twice with same eventId → exactly one stock decrement | integration (DB) | `npm test -- tests/payments/confirm-order-paid.test.ts` |

## Critical Security Properties → Test Coverage

| Security Property | Test Strategy |
|-------------------|---------------|
| Never trust client price | init action with wrong client amount → server recomputes from `getCart()` (unit, mock getCart) |
| Signature verify required | Both webhook tests assert bad-signature → 400 (unit, always-runs) |
| Amount matches order before confirm | Stub gateway verify to return wrong amount → expect `{ error }` (unit) |
| Atomic stock decrement, no read-then-write | Integration: stock=1/qty=2 → oversold path; stock=5/qty=2 → stock=3 post-confirm |
| Toggle enforcement first-statement | Stub `ENABLE_PAYSTACK=false` → action returns `{ error }` without calling gateway |
| No secret in client | Returned action data must not contain `*_SECRET_KEY` |
| Gateway ref → order lookup (not enumerable) | Lookup by `gatewayReference`; wrong ref → `undefined` → 400 |

---

## Wave 0 Requirements

- [ ] `tests/payments/config.test.ts` — add Paystack + Flutterwave toggle cases
- [ ] `tests/checkout/paystack-webhook.test.ts` — signature fail, happy path, idempotency, last-unit race
- [ ] `tests/checkout/flutterwave-webhook.test.ts` — signature fail, happy path, idempotency, amount-unit
- [ ] `tests/checkout/actions.test.ts` — extend with Paystack/Flutterwave init toggle-rejection tests
- [ ] `tests/payments/confirm-order-paid.test.ts` — shared helper: idempotency, oversold, email
- [ ] `tests/payments/gateways.test.ts` — Flutterwave amount conversion + status-string mapping

*Existing vitest infra reused (`vi.stubEnv`, DB helpers, `next/cache` mock). No new framework config.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live inline popup opens + completes on `/checkout` | PAY-05, PAY-06 | Third-party popup + live/test gateway keys; not automatable in vitest | With `ENABLE_PAYSTACK`/`ENABLE_FLUTTERWAVE` + test keys set, add item → checkout → select gateway → complete test payment → land on `/order/[token]` confirmed |
| Real webhook delivery over HTTPS | PAY-05, PAY-06 | Gateways require public HTTPS endpoint; local needs tunnel | Configure gateway dashboard webhook to tunnel URL (ngrok); complete a test payment; confirm order flips via webhook path |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
