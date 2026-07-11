# 08-02 Summary — DB-first credential resolver

**Plan:** 08-02 · **Wave:** 2 · **Status:** COMPLETE · **Date:** 2026-07-11
**Requirements:** ADMN-07

## What was built
- **`src/lib/payments/gateway-credentials.ts`** (D-03) — the load-bearing resolver:
  - `FIELD_MANIFEST`: 30 fields across all 8 providers (field / envVar / isSecret) — single source of truth.
  - `getGatewayCredentialsMap`: React.cache batched single-query loader (mirrors `getStoreSettingsMap`).
  - `getGatewayConfig(provider)` / `getGatewayCredential(provider, field)`: DB value wins when non-empty → else `process.env[envVar]`; empty-string DB row treated as absent; field empty from both sources omitted (fail-closed); `decryptSecret` throw propagates uncaught (D-07).
- **`tests/payments/gateway-credentials.test.ts`** — 8 unit tests (DB-first, env-fallback, fail-closed, empty-string, non-secret-no-decrypt, single-field accessor, cache-wrapper, throw-propagation). Mocks db client + spies crypto (call-through) + React.cache passthrough.
- **`tests/payments/gateway-credentials-integration.test.ts`** — DB-gated: empty table ⇒ env-only resolution; DB row wins once inserted. Leaves table empty (verified 0 rows).
- **`tests/helpers/db.ts`** — `truncateGatewayCredentialsTable()` for phase DB-gated tests.

## Verification
- `npx vitest run tests/payments/gateway-credentials*.test.ts` → 10 passed (8 unit + 2 integration).
- TEST DB `gateway_credentials` count = 0 after run (clean).

## Deviations
- Unit test mocks React's `cache` as an identity passthrough (not `resetModules`) — React.cache memoizes globally outside an RSC request context, which leaked a stale map across tests; passthrough makes each `getGatewayConfig` re-read the mocked rows. No production impact (cache still active in real RSC requests).
- Integration test needed `vi.mock("server-only", () => ({}))` (resolver imports `server-only`).

## Notes for downstream plans
- Consumers call `const cfg = await getGatewayConfig(provider)` then check `cfg.<field>` truthiness (missing = not configured). NEVER read `process.env` for gateway creds directly anymore.
- `webpay-core.ts` must stay sync — Interswitch/GTPay resolve via `getGatewayConfig` in the async adapter and pass values into the sync hooks as data (08-05).

## Self-Check: PASSED
