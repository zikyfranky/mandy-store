---
phase: 05-admin-panel
plan: 04
subsystem: api
tags: [order-fulfillment, state-machine, resend, react-email, zod, drizzle, admin]

# Dependency graph
requires:
  - phase: 05-admin-panel
    provides: "05-01 store_settings table + async isPaymentMethodEnabled; 05-02 admin read-queries + Wave 0 RED test scaffolds; 04-payments confirmOrderPaid idempotent confirmation path"
provides:
  - "updateOrderStatus(orderId, nextStatus) — the single guarded order-status transition function (D-08), exported alongside LEGAL_TRANSITIONS and getValidNextStatuses"
  - "Admin bank-transfer confirmation (awaiting_bank_transfer -> payment_confirmed) delegating verbatim to confirmOrderPaid (D-09), including idempotent re-confirm on double-call"
  - "ORD-03 shipped/delivered status-change email (template + lazy-Resend sender), non-blocking, never fired on processing"
  - "toggleStoreSetting Server Action — ADMN-04 write half, admin-gated + Zod-enum-validated"
affects: [06-admin-ui, order-detail-ui, settings-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-writer state machine: only admin-orders.ts and confirm-order-paid.ts may write orders.status"
    - "Guarded transition allowlist (LEGAL_TRANSITIONS) validated server-side regardless of what a caller sends"
    - "Idempotent re-confirm: a nextStatus==='payment_confirmed' call is legal both from awaiting_bank_transfer AND from an already-payment_confirmed order, relying on confirmOrderPaid's own idempotency guard to resolve the duplicate"
    - "vi.hoisted() for chained/interdependent vi.mock() factory variables (more reliable than the bare mock-prefix hoisting convention)"

key-files:
  created:
    - src/emails/OrderStatusChangeEmail.tsx
    - src/lib/email/send-order-status-change.ts
    - src/lib/actions/admin-orders.ts
    - src/lib/actions/admin-settings.ts
  modified:
    - tests/admin/settings.test.ts

key-decisions:
  - "updateOrderStatus's payment_confirmed branch is legal from awaiting_bank_transfer OR when the order is already payment_confirmed (idempotent double-call), rather than only ever checking LEGAL_TRANSITIONS[order.status] before dispatch — the plan's own bank-transfer-confirm test requires a second no-op call to succeed via confirmOrderPaid's duplicate-outcome path, which the naive single-allowlist-check would reject as illegal since payment_confirmed has no self-transition in the graph."
  - "settings.test.ts's db-mock chain (mockWhere -> mockSet -> mockUpdate) needed vi.hoisted() instead of the bare 'mock'-prefix hoisting convention, which does not reliably hoist a chain of variables referencing each other."

patterns-established:
  - "ORD-03 email template/sender pair mirrors OrderConfirmationEmail.tsx/send-order-confirmation.ts exactly (lazy getResendClient(), throw-if-null, react: Component(input))."

requirements-completed: [ADMN-03, ADMN-04, ORD-03]

duration: ~35min
completed: 2026-07-08
---

# Phase 5 Plan 04: Order Fulfillment State Machine + Status Email + Settings Toggle Summary

**Single guarded `updateOrderStatus()` transition machine with a `LEGAL_TRANSITIONS` allowlist, bank-transfer confirm delegating verbatim to the existing idempotent `confirmOrderPaid()`, a non-blocking shipped/delivered status-change email, and an admin-gated `toggleStoreSetting` Server Action.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-08
- **Tasks:** 3 (all `type="auto"`, Tasks 2-3 marked `tdd="true"` against pre-existing Wave 0 RED scaffolds)
- **Files modified:** 5 (4 created, 1 test file fixed)

## Accomplishments
- `src/lib/actions/admin-orders.ts`: `updateOrderStatus`, `getValidNextStatuses`, `LEGAL_TRANSITIONS` — the single writer of `orders.status` outside `confirm-order-paid.ts`. Illegal transitions throw server-side regardless of UI input (ADMN-03/D-08).
- Bank-transfer confirm (`awaiting_bank_transfer -> payment_confirmed`) delegates to `confirmOrderPaid(order, { provider: "bank_transfer", eventId: "bank_transfer:<reference>" })` — no reimplementation of the atomic stock decrement/idempotency logic (D-09).
- ORD-03 status-change email (`OrderStatusChangeEmail.tsx` + `send-order-status-change.ts`) fires non-blocking on `shipped`/`delivered` only, never on `processing` — verified by test assertion on call counts.
- `toggleStoreSetting` (ADMN-04 write half): `verifyAdminSession()` first statement, Zod enum restricted to `stripe`/`paypal`/`bank_transfer`, single-row `UPDATE store_settings`.
- `tests/admin/orders.test.ts` and `tests/admin/settings.test.ts` (Wave 0 RED scaffolds) now GREEN — 6/6 tests passing (DB-gated tests ran with `TEST_DATABASE_URL`).

## Task Commits

Each task was committed atomically:

1. **Task 1: ORD-03 status-change email — template + lazy-client sender** - `fe03333` (feat)
2. **Task 2: updateOrderStatus transition machine + D-09 bank-transfer confirm** - `19ede0f` (feat)
3. **Task 3: toggleStoreSetting admin action (ADMN-04 write half)** - `eae36ac` (feat)
4. **Follow-up: lint fix on settings.test.ts** - `6907344` (style, part of Task 3's scope)

_Note: TDD tasks (2, 3) had their test files already written in Wave 0 (05-02) — no separate RED commit was needed in this plan; GREEN was achieved directly against the pre-existing scaffolds._

## Files Created/Modified
- `src/emails/OrderStatusChangeEmail.tsx` - React Email template for shipped/delivered notifications, links to `/order/<guestToken>`
- `src/lib/email/send-order-status-change.ts` - Lazy-Resend sender, mirrors `send-order-confirmation.ts` exactly
- `src/lib/actions/admin-orders.ts` - `updateOrderStatus`/`getValidNextStatuses`/`LEGAL_TRANSITIONS` — the guarded fulfillment state machine
- `src/lib/actions/admin-settings.ts` - `toggleStoreSetting` Server Action
- `tests/admin/settings.test.ts` - Fixed db-mock hoisting bug (see Deviations)

## Decisions Made
- **Idempotent re-confirm branch:** `updateOrderStatus`'s `payment_confirmed` dispatch checks `order.status === "payment_confirmed" || LEGAL_TRANSITIONS[order.status].includes("payment_confirmed")` before delegating to `confirmOrderPaid`, rather than gating purely on the allowlist. This lets a second admin click (or any double-call) reach `confirmOrderPaid`, whose own `processed_webhook_events` idempotency guard resolves it to `{ outcome: "duplicate" }` without a second stock decrement — matching the plan's explicit "double-call is idempotent" behavior requirement (T-05-17) while still rejecting a jump straight to `payment_confirmed` from any other status (e.g. `pending_payment`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Idempotent double-call to `updateOrderStatus(orderId, "payment_confirmed")` was rejected as an illegal transition**
- **Found during:** Task 2 — running `tests/admin/orders.test.ts` bank-transfer-confirm test
- **Issue:** The PATTERNS/RESEARCH skeleton checks `LEGAL_TRANSITIONS[order.status].includes(nextStatus)` for every transition, including `payment_confirmed`, before dispatching. After the first successful confirm, `order.status` is `payment_confirmed`, and `LEGAL_TRANSITIONS["payment_confirmed"]` is `["processing", "cancelled"]` — it does not include `"payment_confirmed"` itself. The test's required second call (`updateOrderStatus(orderId, "payment_confirmed")` again, expecting stock to stay at 4) threw `Illegal transition: payment_confirmed -> payment_confirmed` instead of reaching `confirmOrderPaid`'s duplicate-outcome path.
- **Fix:** Moved the `payment_confirmed` branch's own guard ahead of the generic allowlist check: it now accepts the transition when `order.status === "awaiting_bank_transfer"` (per the allowlist) OR when `order.status === "payment_confirmed"` already (idempotent re-confirm), delegating to `confirmOrderPaid` in both cases. All other statuses still hit the generic allowlist and are rejected.
- **Files modified:** `src/lib/actions/admin-orders.ts`
- **Verification:** `npx vitest run tests/admin/orders.test.ts` — all 3 tests pass, including the double-call idempotency assertion (`stock` stays at 4 after both calls).
- **Committed in:** `19ede0f` (Task 2 commit)

**2. [Rule 3 - Blocking] `tests/admin/settings.test.ts`'s db-mock chain threw `ReferenceError: Cannot access 'mockUpdate' before initialization`**
- **Found during:** Task 3 — running `tests/admin/settings.test.ts`
- **Issue:** The pre-existing Wave 0 scaffold declared `mockWhere`, `mockSet`, `mockUpdate` as plain top-level `const`s (each referencing the previous) and used `mockUpdate` inside a `vi.mock("@/lib/db/client", ...)` factory, relying on Vitest's "mock"-prefix hoisting convention. That convention does not reliably hoist a chain of variables that reference each other in this Vitest version, so the mock factory ran before `mockUpdate` was initialized, failing module collection entirely (0 tests ran).
- **Fix:** Wrapped the three mock functions in `vi.hoisted(() => {...})` (the same pattern already proven working in `tests/email/emails.test.ts`), which explicitly hoists the whole factory above `vi.mock()` calls. Also removed the now-unused `mockWhere`/`mockSet` outer destructure (only `mockUpdate` is asserted on) to satisfy lint.
- **Files modified:** `tests/admin/settings.test.ts`
- **Verification:** `npx vitest run tests/admin/settings.test.ts` — 3/3 tests pass; `npx eslint tests/admin/settings.test.ts` — clean.
- **Committed in:** `eae36ac` (Task 3 commit), lint cleanup in `6907344`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug fix, 1 Rule 3 blocking-issue fix)
**Impact on plan:** Both fixes were necessary to make the plan's own acceptance tests pass as specified (idempotent double-call behavior, and the test file actually collecting/running at all). No scope creep — no files outside the plan's `files_modified` list were touched.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required
None - no external service configuration required. `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL` were already present in `.env.local` from prior phases.

## Next Phase Readiness
- `updateOrderStatus` and `getValidNextStatuses` are ready for the Plan 06 admin UI's guided transition buttons (render only `getValidNextStatuses(currentStatus)`, never a free dropdown — Pitfall 3).
- `toggleStoreSetting` is ready for the Plan 06 Settings page toggle UI.
- No blockers for Phase 5's remaining UI plan.

---
*Phase: 05-admin-panel*
*Completed: 2026-07-08*

## Self-Check: PASSED

All created/modified files verified present on disk; all 4 task/follow-up commit hashes (`fe03333`, `19ede0f`, `eae36ac`, `6907344`) verified in `git log`.
