---
phase: 06-customer-accounts
plan: 01
status: complete
completed: 2026-07-09
requirements: [AUTH-04]
---

# Plan 06-01 Summary — Data + Linking Layer

**Status:** COMPLETE. Executed INLINE by the orchestrator — the gsd-executor subagent stalled on the ~600s stream watchdog before committing anything (a recurring env issue; researcher/planner/checker succeed, executors intermittently stall). The plan is fully prescriptive, so the orchestrator applied it directly per the workflow's documented inline fallback.

## What was built

- **`src/lib/orders/queries.ts`** — two customer-scoped reads (AUTH-04):
  - `getOrderForUser(userId, orderId)` — IDOR-safe single read: ownership lives IN the SQL `WHERE` (`and(eq(orders.id, orderId), eq(orders.userId, userId))`) with `items` join; returns `null` uniformly for both nonexistent AND not-owned (indistinguishable — no enumeration, D-04).
  - `listOrdersForUser(userId)` — order-history list scoped by `userId`, newest first (`desc(createdAt)`), with a numeric `itemCount` via a grouped subquery; `[]` for a user with no orders.
- **`src/lib/actions/auth.ts`** — best-effort guest-order claim (D-06) after user insert, before the verification-email block: guarded `UPDATE orders SET userId WHERE guestToken=? AND isNull(userId)`, wrapped in try/catch (0 rows = silent no-op; never blocks signup). No `register()` signature change; no pre-check read.
- **`src/components/auth/RegisterForm.tsx`** — optional `orderToken` prop rendered as a hidden field.
- **`src/app/(auth)/account/register/page.tsx`** — async Server Component reading `searchParams` (Next 16) and threading `orderToken` to the form.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run tests/orders/user-queries.test.ts tests/auth/register.test.ts` — **16/16 GREEN** (2 files): 5 user-queries (list newest-first + itemCount; empty; owned-with-items; IDOR→null; nonexistent→null) + 11 register (8 existing + 3 new claim: links unclaimed; does-not-reassign-claimed; garbage-token still succeeds). DB-gated cases ran against `TEST_DATABASE_URL`.
- No schema change (no `db:push`; `orders.userId`/`order_user_idx`/`guestToken` pre-existing).

## Commits

- `f91a5ad` feat(06-01): user-scoped IDOR-safe order queries (AUTH-04)
- `06aaaa2` feat(06-01): best-effort guest-order claim on register (D-06, AUTH-04)
- `3a58740` test(06-01): user-scoped queries (incl. IDOR) + guest-order-claim cases

## Security (threat model satisfied)

- T-06-01 IDOR → ownership in SQL WHERE, null-uniform (verified by IDOR + nonexistent tests).
- T-06-02 guest-order hijack → `userId IS NULL` guard (verified by does-not-reassign test).
- T-06-04 best-effort-claim DoS → try/catch, never rethrows (verified by garbage-token test).

## Self-Check: PASSED
