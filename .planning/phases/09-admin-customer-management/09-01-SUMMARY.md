# 09-01 Summary — Foundation (ADMN-08 data layer)

**Status:** COMPLETE — 2026-07-12 (executed inline by orchestrator; executor-agent fallback per repo convention)

## What was built
- **D-01 `users.createdAt`** — added `createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull()` to the `user` table in `src/lib/db/schema.ts`.
- **[BLOCKING] dual-DB push** — two direct-SQL scripts (`apply-users-createdat-schema.mjs` + `-to-test-db.mjs`, `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "created_at"`). Ran both: `created_at` now physically present on `user` in **both** `DATABASE_URL` and `TEST_DATABASE_URL`.
- **D-02/D-06 `listCustomersForAdmin`** — appended to `src/lib/catalog/admin-queries.ts` (mirrors `listOrdersForAdmin` + a `GROUP BY orders.userId` COUNT subquery). Returns the minimal DTO `{id,name,email,role,emailVerified,createdAt,orderCount}`; parameterized `ilike` search on email/name; pagination at `ADMIN_PAGE_SIZE`(24); `createdAt DESC`. **Never selects `passwordHash`/tokens** (grep count 0).
- **Wave 0 tests** — `tests/admin/customers.test.ts` (ADMN-08, **GREEN 6/6**) and `tests/actions/admin-customers.test.ts` (ADMN-09/10, **RED** on missing `@/lib/actions/admin-customers` + `@/lib/email/send-password-reset` — correct Wave 0 signal for 09-02).

## Verification
- `npx vitest run tests/admin/customers.test.ts` → 6 passed (DB-gated ran against TEST_DATABASE_URL).
- `npx vitest run tests/actions/admin-customers.test.ts` → RED, `Cannot find package '@/lib/email/send-password-reset'` (expected).
- `npx next build --webpack` → clean.

## Notes for downstream
- 09-02 must create `@/lib/actions/admin-customers` (`sendCustomerPasswordReset`, `resetPassword`, `updateCustomerRole`) and `@/lib/email/send-password-reset` (`sendPasswordResetEmail`) to turn the RED scaffold GREEN. The scaffold encodes the exact intended contract (return shapes, `pwreset_` prefix, 1h expiry, session revoke, atomic last-admin, self-guard).
- `admin-customers.test.ts` `afterEach` truncates auth tables; the customers list test also truncates order tables first (FK: orders → users).

## Requirements
- ADMN-08 data layer delivered (query + tests). UI in 09-03.
