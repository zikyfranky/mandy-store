---
phase: "07-nigerian-payment-gateways"
plan: "03"
subsystem: "payments"
tags: ["flutterwave", "webhook", "gateway-adapter", "naira-conversion", "idempotency", "server-actions", "tdd"]
dependency_graph:
  requires: ["07-01", "07-02"]
  provides: ["flutterwave-adapter", "flutterwave-server-actions", "flutterwave-webhook"]
  affects: ["07-04"]
tech_stack:
  added: []
  patterns:
    - "FlutterwaveAdapter implementing GatewayAdapter interface (D-02)"
    - "naira↔kobo conversion: amountKobo÷100 outbound, Math.round(naira×100) inbound (Pitfall 1/8)"
    - "100× overcharge guard: amountNaira > 1_000_000 → throw (Pitfall 1)"
    - "toggle-first Server Actions (PAY-12, D-06)"
    - "HMAC SHA-256 base64 webhook signature + verif-hash plaintext fallback (T-07-11, Pitfall 5)"
    - "shared confirmOrderPaid path for webhook + verify-on-callback (D-04, T-07-13)"
    - "oversold → flutterwaveRefund(String(data.id)) + payment_failed (T-07-14)"
    - "amount guard: v.amountKobo < order.totalKobo → reject (T-07-12, Pitfall 8)"
key_files:
  created:
    - "src/lib/payments/gateways/flutterwave.ts (FlutterwaveAdapter: flutterwaveBuildParams/flutterwaveVerify/flutterwaveRefund + flutterwaveAdapter)"
    - "src/lib/actions/flutterwave.ts (initFlutterwavePayment + verifyFlutterwavePayment)"
    - "tests/checkout/flutterwave-actions.test.ts (11 tests: toggle rejection, amount guard, eventId, oversold, DB happy path)"
  modified:
    - "src/app/api/webhooks/flutterwave/route.ts (replaced Wave 1 stub with full implementation)"
    - "tests/checkout/flutterwave-webhook.test.ts (completed: 8 tests — 4 always-runs + 4 DB-gated)"
    - "tests/payments/gateways.test.ts (filled Flutterwave amount-conversion + status-mapping cases — 18 total, up from 7 Paystack)"
decisions:
  - "flutterwaveVerify accepts string|number transactionId — actions pass numeric txn id from popup callback; adapter verifyTransaction(reference) passes reference as the id string"
  - "verif-hash fallback: signature === secretHash (plaintext) accepted alongside HMAC SHA-256 base64 — covers legacy Flutterwave webhook configs (Pitfall 5)"
  - "flutterwaveRefund takes String(event.data.id) — numeric Flutterwave txn id, not tx_ref — Flutterwave refund endpoint requires numeric id"
  - "eventId 'flutterwave:'+txRef shared by verify-on-callback and webhook (D-04) — first caller wins ON CONFLICT DO NOTHING; tx_ref is stable across both paths"
  - "Amount guard uses < not !== (allow exact integer match; any shortfall is tampering) — same convention as Paystack adapter"
metrics:
  duration: "~45 minutes"
  tasks_completed: 3
  files_created: 3
  files_modified: 3
  completed_date: "2026-07-04"
---

# Phase 7 Plan 03: Flutterwave End-to-End (PAY-06/PAY-12) Summary

**One-liner:** FlutterwaveAdapter (buildParams/verify/refund against D-02 interface) with naira↔kobo conversion + 100× overcharge guard, initFlutterwavePayment + verifyFlutterwavePayment Server Actions (toggle-first, server-recompute, amount guard), and HMAC SHA-256 base64 webhook route (verif-hash fallback) all funneling into the shared `confirmOrderPaid()` path; 37 tests green (18 unit + 8 webhook unit/DB + 11 action unit/DB).

## What Was Built

### Task 1 — FlutterwaveAdapter (TDD)

Created `src/lib/payments/gateways/flutterwave.ts` (import server-only).

- `flutterwaveBuildParams`: assembles FlutterwaveCheckout() popup params; `amount: amountKobo / 100` (÷100 kobo→naira, Pitfall 1 anti-pattern avoided); unit guard `if (amountNaira > 1_000_000) throw` catches accidental kobo double-pass; includes `public_key = NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY`, `tx_ref`, `currency: "NGN"`, `customer`, `meta: { orderId }`, `customizations`
- `flutterwaveVerify`: GET `api.flutterwave.com/v3/transactions/:id/verify`, Bearer FLUTTERWAVE_SECRET_KEY; maps `"successful"` → `"confirmed"` (Pitfall 7 — distinct from Paystack's `"success"`); returns `amountKobo: Math.round(data.data.amount * 100)` (naira→kobo, Pitfall 8); reference = `data.data.tx_ref`
- `flutterwaveRefund`: POST `api.flutterwave.com/v3/transactions/:id/refund`; body `{ ...(amountKobo ? { amount: amountKobo / 100 } : {}) }` (naira); throws on !res.ok
- `flutterwaveAdapter: GatewayAdapter` — provider="flutterwave"; initPayment returns buildParams; verifyTransaction delegates to flutterwaveVerify; refund delegates to flutterwaveRefund
- Filled Flutterwave describe blocks in `tests/payments/gateways.test.ts` (11 new tests across 3 describe blocks: amount conversion, status normalization, refund)

### Task 2 — Server Actions (TDD)

Created `src/lib/actions/flutterwave.ts` (use server + import server-only):

- `initFlutterwavePayment(input: CheckoutInput)`: toggle FIRST; buildOrderContext; db.batch insert (pending_payment, gatewayProvider="flutterwave", gatewayReference=ctx.reference as tx_ref); returns `{ publicKey: NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY, txRef, amountNaira: totalKobo/100, email, customerName, phone, guestToken }` — secret never in return value (T-07-16)
- `verifyFlutterwavePayment({ transactionId, txRef })`: toggle FIRST; getOrderByGatewayReference(txRef); flutterwaveVerify(transactionId); status guard (`v.status !== "confirmed"` → reject); amount guard (`v.amountKobo < order.totalKobo` → reject — adapter already normalized naira×100); confirmOrderPaid(order, `{ provider:"flutterwave", eventId:"flutterwave:"+txRef }`); oversold → flutterwaveRefund(transactionId) + `{ error }`; success → `{ guestToken }`
- Created `tests/checkout/flutterwave-actions.test.ts` (11 tests): 2 initFlutterwavePayment toggle rejection, 2 verifyFlutterwavePayment toggle rejection, 3 verify path logic (amount mismatch, not-confirmed, order-not-found), 2 eventId/guestToken assertions, 1 oversold refund path, 1 DB-gated happy path (secret never in return value check)

### Task 3 — Webhook Route (TDD)

Replaced Wave 1 stub in `src/app/api/webhooks/flutterwave/route.ts`:

0. Toggle FIRST before `req.text()` (D-06, PAY-12, T-07-15) — disabled gateway → 400
1. `await req.text()` raw body (Pitfall 4)
2. `flutterwave-signature` ?? `verif-hash` header; HMAC SHA-256 base64 computed; accepted if HMAC match OR plaintext `=== secretHash` (Pitfall 5 fallback, T-07-11)
3. `charge.completed` + `data.status === "successful"` filter (Pitfall 7); 200 no-op for all other events
4. `getOrderByGatewayReference(txRef)` → 400 on miss; `order.status === "payment_confirmed"` shortcut → 200
5. `confirmOrderPaid(order, { provider:"flutterwave", eventId:"flutterwave:"+txRef })` (D-04, T-07-13)
6. Oversold → `flutterwaveRefund(String(event.data.id)).catch()` + 200 (T-07-14, no retry storm)
7. No `export const runtime` (Node.js default; cacheComponents:true compatible)

Completed `tests/checkout/flutterwave-webhook.test.ts` (8 tests): bad-sig → 400 (always-runs); non-charge.completed → 200 (always-runs); status !== "successful" → 200 (always-runs); verif-hash plaintext fallback → 200 (always-runs); DB-gated: happy path (payment_confirmed + stock decrement + email); idempotency (same tx_ref → one decrement); last-unit race (stock=1/qty=2 → payment_failed + flutterwaveRefund spy); order-not-found → 400

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/payments/gateways.test.ts | 7 Paystack + 11 Flutterwave = 18 total | Green |
| tests/checkout/flutterwave-actions.test.ts | 11 (10 unit + 1 DB) | Green |
| tests/checkout/flutterwave-webhook.test.ts | 8 (4 always-runs + 4 DB-gated) | Green |
| **Total new** | **37 passing** | **All passing** |
| npx tsc --noEmit | — | Clean |

Existing tests (paystack-*, confirm-order-paid, config, webhook, etc.): all still green — no regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wave 1 webhook stub had toggle check AFTER body read**

- **Found during:** Task 3 implementation — the existing stub had `await req.text()` before `isPaymentMethodEnabled("flutterwave")`. Plan Task 3 step 0 explicitly requires toggle FIRST.
- **Fix:** Rewrote the full handler per plan spec: toggle → `req.text()` → signature verify → event filter → order lookup → confirmOrderPaid
- **Files modified:** `src/app/api/webhooks/flutterwave/route.ts`

**2. [Rule 2 - Missing] Already-confirmed shortcut before confirmOrderPaid**

- **Found during:** Task 3 implementation — the Paystack webhook had an early-return guard `if (order.status === "payment_confirmed") return 200` before calling confirmOrderPaid. Added the same pattern to avoid hitting the idempotency table unnecessarily on already-confirmed orders.
- **Fix:** Added `if (order.status === "payment_confirmed") return NextResponse.json({ received: true })` after the order lookup, mirroring the Paystack pattern. Mirrors existing behavior; no new test needed (covered by idempotency test).
- **Files modified:** `src/app/api/webhooks/flutterwave/route.ts`

## Known Stubs

None. All Wave 1 stubs for Flutterwave resolved:
- `src/app/api/webhooks/flutterwave/route.ts` — full implementation (was stub with TODO)
- `tests/checkout/flutterwave-webhook.test.ts` — all 8 tests implemented (were todos)
- `tests/payments/gateways.test.ts` — Flutterwave describe blocks implemented (were todos)

## Threat Flags

No new threat surface beyond the plan's threat model. All mitigations implemented and tested:

| Threat ID | Mitigation | Test |
|-----------|-----------|------|
| T-07-11 (Spoofing) | HMAC SHA-256 base64 flutterwave-signature; verif-hash plaintext fallback; mismatch → 400 | webhook.test.ts: bad-sig → 400 |
| T-07-12 (Tampering) | Server re-fetches from FLW verify; adapter normalizes naira×100; v.amountKobo < order.totalKobo → reject | actions.test.ts: amount mismatch test |
| T-07-13 (Repudiation) | eventId "flutterwave:"+txRef shared by callback + webhook | actions.test.ts: eventId assertion; webhook.test.ts: idempotency |
| T-07-14 (Elevation) | Atomic conditional decrement in confirmOrderPaid; oversold → flutterwaveRefund + payment_failed | webhook.test.ts: oversold DB test |
| T-07-15 (Access Control) | isPaymentMethodEnabled("flutterwave") first statement in every action/route | toggle rejection tests (all files) |
| T-07-16 (Info Disclosure) | Only NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY returned to client; FLWSECK never in response | actions.test.ts: JSON.stringify check |

## Commits

| Hash | Message |
|------|---------|
| `c13f3ec` | feat(07-03): FlutterwaveAdapter (build-params/verify/refund) + gateways unit tests |
| `60e0299` | feat(07-03): initFlutterwavePayment + verifyFlutterwavePayment Server Actions + toggle tests |
| `2673fd3` | feat(07-03): Flutterwave webhook route + complete webhook integration tests |

## Self-Check: PASSED

```
FOUND: src/lib/payments/gateways/flutterwave.ts
FOUND: src/lib/actions/flutterwave.ts
FOUND: src/app/api/webhooks/flutterwave/route.ts
FOUND: tests/checkout/flutterwave-actions.test.ts
FOUND: tests/checkout/flutterwave-webhook.test.ts
FOUND: tests/payments/gateways.test.ts (Flutterwave cases filled — 18 total)
FOUND: c13f3ec (Task 1 commit)
FOUND: 60e0299 (Task 2 commit)
FOUND: 2673fd3 (Task 3 commit)
TSC: clean (npx tsc --noEmit exits 0, no output)
TESTS: 37 passing / 0 failing
GREP CHECKS: all acceptance criteria pass for each task (verified above)
```
