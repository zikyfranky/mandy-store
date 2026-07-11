# 08-01 Summary — Foundation: schema + crypto

**Plan:** 08-01 · **Wave:** 1 · **Status:** COMPLETE · **Date:** 2026-07-11
**Requirements:** ADMN-05, ADMN-06

## What was built

- **`gateway_credentials` table** (D-01) added to `src/lib/db/schema.ts` — field-level key/value rows `(provider, field, value, is_secret, updated_at, updated_by)`, compound PK `(provider, field)`. Ships empty (D-09).
- **Direct-SQL push scripts** — `src/scripts/apply-gateway-credentials-schema.mjs` (+ `-to-test-db.mjs`), mirroring the store-settings pattern. **Applied live to BOTH dev + test Neon DBs** (verified 0 rows, idempotent re-run exit 0). `drizzle-kit push` not attempted (documented TTY prompt).
- **`src/lib/payments/crypto.ts`** (D-02/ADMN-06) — AES-256-GCM `encryptSecret`/`decryptSecret`, versioned `v1:<iv>:<tag>:<ct>` envelope, fresh 12-byte IV per call, `getKey()` fail-loud on missing/wrong-length key, decrypt throw never swallowed. `import "server-only"`.
- **`tests/payments/crypto.test.ts`** — 8 tests (round-trip incl. empty string, missing key, wrong-length key, ciphertext tamper, authTag tamper, envelope format, fresh-IV). **All 8 green.**
- **`.env.local.example`** documents `CREDENTIALS_ENCRYPTION_KEY` (Phase 8 section); a real 32-byte key generated into the gitignored `.env.local` for downstream DB/UI tests.

## Verification
- `npx vitest run tests/payments/crypto.test.ts` → 8 passed.
- Both apply scripts print SUCCESS against dev + test DBs; re-run idempotent.
- `grep -c "export const gatewayCredentials" src/lib/db/schema.ts` → 1.

## Key-files
- created: `src/lib/payments/crypto.ts`, `tests/payments/crypto.test.ts`, `src/scripts/apply-gateway-credentials-schema.mjs`, `src/scripts/apply-gateway-credentials-schema-to-test-db.mjs`
- modified: `src/lib/db/schema.ts`, `.env.local.example`

## Notes for downstream plans
- The encryption key is set locally; 08-02's DB-gated integration test and 08-03's encrypt-before-persist test can rely on it.
- Table is empty by design — 08-02's resolver must treat "no row" as env-fallback, and an empty-string row as absent.

## Self-Check: PASSED
