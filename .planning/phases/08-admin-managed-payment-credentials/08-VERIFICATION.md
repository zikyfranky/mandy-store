---
phase: 08-admin-managed-payment-credentials
verified: 2026-07-12T09:54:40Z
status: human_needed
score: 5/5 roadmap success criteria verified (code level); 3/3 requirements satisfied (code level)
overrides_applied: 0
human_verification:
  - test: "Write-only secret round-trip (Paystack secret_key) — 08-HUMAN-UAT.md Test 2"
    expected: "Enter a secret key, Save, reload, re-expand — field shows masked •••• + 'Last updated' caption, never the typed value"
    why_human: "Requires a live admin browser session; cannot be automated by static code analysis"
  - test: "DevTools no-leak check — 08-HUMAN-UAT.md Test 3"
    expected: "No substring of the entered secret key appears anywhere in page HTML / RSC payload / Network responses"
    why_human: "Requires live DevTools inspection of an actual rendered page; code trace strongly suggests this holds (see Data-Flow Trace) but is not a substitute for the real browser check"
  - test: "Replace / Cancel flow + empty-submit preserves stored value — 08-HUMAN-UAT.md Tests 4 and 7"
    expected: "Cancel reverts without submitting; saving an unrelated field never clears/overwrites an untouched masked secret"
    why_human: "Requires live UI interaction across a save/reload cycle"
  - test: "Test-connection affordance — 08-HUMAN-UAT.md Tests 5 and 6"
    expected: "Stripe/Paystack/Flutterwave show Testing→Connected/Failed; Interswitch shows a static 'not verifiable' pill; PayPal shows neither"
    why_human: "Requires a real (test-mode) gateway credential and live network call from the browser action"
---

# Phase 8: Admin-Managed Payment Credentials Verification Report

**Phase Goal:** All 8 payment gateways' credentials configurable in the admin portal (DB-stored), secrets encrypted at rest (AES-256-GCM, one master key in `.env`), credentials resolved DB-first with `.env` fallback, write-only secret UI, admin-gated + server-only, webhook signature verification fail-closed on missing credentials.
**Verified:** 2026-07-12T09:54:40Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Phase 8 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Admin can enter/replace each gateway's credentials from `/admin/settings`, DB-persisted, no redeploy | ✓ VERIFIED | `saveGatewayCredentials` (`src/lib/actions/gateway-credentials.ts`) inserts/upserts into `gatewayCredentials` via `onConflictDoUpdate`; `gateway_credentials` table confirmed live (empty) in both Neon DBs via direct SQL query in this session; `/admin/settings` build output includes the route and renders `GatewayCredentialCard` for all 8 providers |
| SC2 | Secrets encrypted at rest (AES-256-GCM, single master key); stored secrets never returned to browser; write-only UI with masked/Replace; public keys may show | ✓ VERIFIED (code) / needs human browser check | `crypto.ts`: `aes-256-gcm`, fresh 12-byte IV per call, 32-byte key hard-validated, `decryptSecret` throw not swallowed. `GatewayCredentialCard.tsx` props (`FieldPresence`) carry only `isConfigured`/`updatedAt`/`updatedBy` for secret fields and `publicValue` only when `isSecret:false`; `page.tsx` never passes a decrypted secret to the client. DevTools/live round-trip listed as human verification (below) |
| SC3 | Every gateway/webhook resolves credentials DB-first with `.env` fallback | ✓ VERIFIED | `getGatewayConfig` (`gateway-credentials.ts`) — DB row wins if non-empty, else `process.env[envVar]`, else omitted. All 5 gateway modules (`paystack`, `flutterwave`, `remita`, `interswitch`, `gtpay`) and `stripe.ts`/`config.ts` call it exclusively for credential values (grep results below) |
| SC4 | Webhook signature verification uses DB-resolved secret for all gateways with webhook routes; missing/invalid credential fails closed | ✓ VERIFIED | All 5 existing webhook routes (`stripe`, `paystack`, `flutterwave`, `gtpay`, `remita`) call `getGatewayConfig`/resolve the signing secret and return HTTP 400 **before** any HMAC/hash compute if the secret is empty — confirmed by direct code read of all 5 routes. See "Webhook Fail-Closed Check" below for the doc-count discrepancy (6 vs 5) |
| SC5 | Every credential read/write re-verifies admin role server-side; stays server-only, no `NEXT_PUBLIC_`, no secret leakage into client bundle | ✓ VERIFIED | `saveGatewayCredentials`/`testGatewayConnection` call `verifyAdminSession()` as literal first statement; `/admin/layout.tsx` re-verifies `verifyAdminSession()` for every `/admin/*` request (defense-in-depth beyond `proxy.ts`); all Phase 8 modules have `import "server-only"` at the top |

**Score:** 5/5 success criteria verified at the code level. SC2's live-browser no-leak/round-trip check is still pending human execution (tracked in `08-HUMAN-UAT.md`, not fabricated by this verifier).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| ADMN-05 | 08-01, 08-03, 08-09 | Admin configure/replace credentials, DB-persisted, no redeploy | ✓ SATISFIED | `saveGatewayCredentials`, `gatewayCredentials` schema, `GatewayCredentialCard` UI |
| ADMN-06 | 08-01, 08-03, 08-09 | AES-256-GCM at rest, single master key, write-only UI | ✓ SATISFIED | `crypto.ts`, UI props contract (code-verified; browser no-leak check pending human) |
| ADMN-07 | 08-02, 08-04, 08-05, 08-06, 08-07, 08-08 | DB-first/env-fallback for all 8 gateways incl. webhooks, admin-gated, server-only, fail-closed | ✓ SATISFIED | `getGatewayConfig` resolver; 5 gateway modules + `stripe.ts`/`config.ts` migrated; 5 webhook routes fail closed |

No orphaned requirements — REQUIREMENTS.md maps exactly ADMN-05/06/07 to Phase 8 and all three are claimed across the 9 plans. **Note:** REQUIREMENTS.md traceability table still shows `[ ]` unchecked / "Pending" for all three — this is a documentation bookkeeping gap (CLAUDE.md says to mark requirements complete as phases finish), not a code gap. Flagged as INFO, not a blocker.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/lib/db/schema.ts` (`gatewayCredentials`) | Table def, compound PK (provider, field) | ✓ VERIFIED | Confirmed live with matching columns (`provider`, `field`, `value`, `is_secret`, `updated_at`, `updated_by`) in both DEV and TEST Neon DBs, 0 rows each (queried directly this session) |
| `src/lib/payments/crypto.ts` | AES-256-GCM envelope, fresh IV, fail-loud key validation | ✓ VERIFIED | `encryptSecret`/`decryptSecret`, versioned `v1:iv:tag:ciphertext` envelope, `getKey()` throws on missing/wrong-length key, decrypt throw not caught internally |
| `src/lib/payments/gateway-credentials.ts` | FIELD_MANIFEST (8 providers), DB-first/env-fallback/fail-closed resolver | ✓ VERIFIED | 8 providers present (stripe, paypal, bank_transfer, paystack, flutterwave, interswitch, gtpay, remita); empty-string treated as absent; omits fully-unresolved fields |
| `src/lib/payments/config.ts` | `hasEnvAndCredentials` resolver-backed for all 8 | ✓ VERIFIED | All 8 cases call `getGatewayConfig`; `ENABLE_<GATEWAY>` flags remain direct env reads by design (out of scope per D-03/D-03a) |
| `src/lib/payments/stripe.ts` | Async `getStripe()` via resolver | ✓ VERIFIED | Lazy singleton, `await getGatewayConfig("stripe")`, throws if `secret_key` missing |
| `src/lib/payments/gateways/{paystack,flutterwave,remita,interswitch,gtpay}.ts` | Resolver-backed credential reads | ✓ VERIFIED | All 5 call `getGatewayConfig(provider)` per adapter method; remaining `process.env.APP_URL` reads in `gtpay.ts`/`interswitch.ts` are callback-URL construction, not credentials — correctly out of scope |
| `src/lib/payments/gateways/webpay-core.ts` | Stays sync / unmigrated | ✓ VERIFIED (expected) | No `getGatewayConfig` call, still reads env directly — matches the phase's explicit "webpay-core.ts untouched" design note |
| `src/app/api/webhooks/{stripe,paystack,flutterwave,gtpay,remita}/route.ts` | Resolver-backed signing secret, fail-closed | ✓ VERIFIED | All 5 resolve the secret via `getGatewayConfig` and return 400 before any HMAC/hash compute when empty |
| `src/lib/actions/gateway-credentials.ts` | `saveGatewayCredentials`/`testGatewayConnection`, admin-gated, closed Zod, encrypt-before-persist, empty-submit-preserves, never echoes | ✓ VERIFIED | `verifyAdminSession()` first statement; `.strict()` Zod schema derived from FIELD_MANIFEST; `encryptSecret` before insert; empty/undefined submitted values are skipped (never overwrite with ""); returns only `{success}`, no field values |
| `src/app/admin/settings/page.tsx` + `GatewayCredentialCard.tsx` | Only presence booleans + public values cross to client | ✓ VERIFIED | Server component builds `FieldPresence[]` — secret fields carry no value, only booleans/dates; public fields carry `publicValue` only when `isSecret:false` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `saveGatewayCredentials` | `gatewayCredentials` table | `db.insert(...).onConflictDoUpdate(...)` | ✓ WIRED | Verified in source |
| Gateway modules (5) | `gateway-credentials.ts` | `getGatewayConfig(provider)` | ✓ WIRED | Verified via grep + read for all 5 |
| Webhook routes (5) | `gateway-credentials.ts` | `getGatewayConfig(provider)` before HMAC | ✓ WIRED | Verified via read for all 5; fail-closed guard precedes signature compute in every route |
| `admin/settings/page.tsx` | `GatewayCredentialCard` | props (`FieldPresence[]`) | ✓ WIRED, data flows real (not hollow) | `getGatewayConfig`/`getGatewayCredentialsMap` are real DB+env resolved values, not hardcoded; confirmed live DB query returns real (empty) rows and env fallback populates `publicValue` |
| `GatewayCredentialCard` | `saveGatewayCredentials` Server Action | `onClick` → `startTransition` → action call | ✓ WIRED | Real submission path, not a stub `preventDefault`-only handler |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `admin/settings/page.tsx` gateway cards | `cfg` (per-provider `Record<string,string>`) | `getGatewayConfig(provider)` → `getGatewayCredentialsMap()` → real `db.select().from(gatewayCredentials)` | Yes — confirmed real Neon query in this session returns actual (currently empty) rows; env fallback populates real values | ✓ FLOWING |
| `GatewayCredentialCard` secret field render | `f.isConfigured`, `f.updatedAt`, `f.updatedBy` | Derived from real `rawMap[provider][field]` row + `cfg[field]` boolean, not hardcoded | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full unit + integration test suite | `npm test` (Node 22) | 40 files, 394 tests passed, 0 failed | ✓ PASS |
| Production build (webpack) | `npx next build --webpack` | Compiled successfully, TypeScript clean, `/admin/settings` + all 5 webhook routes present in route manifest | ✓ PASS |
| `gateway_credentials` table live in both DBs | direct Neon SQL query (this session) | Matching schema columns, 0 rows, both DEV and TEST DB | ✓ PASS |
| `CREDENTIALS_ENCRYPTION_KEY` decodes to 32 bytes | `Buffer.from(key,"base64").length` | 32 | ✓ PASS |

### process.env Migration Grep Results

```
src/lib/payments/gateways/gtpay.ts:32,77     process.env.APP_URL   (callback URL fallback, NOT a credential)
src/lib/payments/gateways/interswitch.ts:81  process.env.APP_URL   (callback URL fallback, NOT a credential)
```
No remaining direct `process.env.<GATEWAY>_*` credential reads found in any of the 5 gateway modules, `config.ts`, or `stripe.ts`. `webpay-core.ts` correctly left untouched (expected/allowed per design — Paystack+Flutterwave's shared WebPay core stays sync; the per-call resolved config is passed in from the caller).

### Webhook Fail-Closed Check

All 5 webhook routes under `src/app/api/webhooks/` (`stripe`, `paystack`, `flutterwave`, `gtpay`, `remita`) resolve their signing secret via `getGatewayConfig` and return HTTP 400 with `{error: "Gateway not configured"}` **before** computing/comparing any HMAC or hash. Confirmed by direct source read of all 5 routes plus passing dedicated fail-closed tests (`paystack-webhook.test.ts`, `flutterwave-webhook.test.ts`, `gtpay-webhook.test.ts`, `remita-webhook.test.ts`, `webhook.test.ts` for Stripe).

**Doc discrepancy (INFO, not a blocker):** ROADMAP/08-CONTEXT.md/SUMMARY docs repeatedly say "6 webhook routes" / "all 6 webhooks resolver-backed", but only 5 webhook route files exist in the codebase (`src/app/api/webhooks/{stripe,paystack,flutterwave,gtpay,remita}/route.ts`). PayPal has no webhook (deferred, D-05a), bank_transfer is manually confirmed (no webhook), and Interswitch uses a callback/requery route (`api/payments/interswitch/callback`) rather than a signature-verified webhook. The actual migrated set (5) is architecturally complete and consistent with prior phases — the "6" figure appears to be a repeated counting typo across the phase's own docs, not evidence of a missing 6th route.

### Test-Integrity Finding (flagged risk investigation)

**Confirmed real, but scoped narrower than it could have been.** Five test files use the pattern `vi.mock("@/lib/payments/gateway-credentials", async (importOriginal) => { const actual = await importOriginal(...); return {...actual, getGatewayCredentialsMap: vi.fn().mockResolvedValue({}) } })` — spreading `actual` and overriding only `getGatewayCredentialsMap`, while the module's own `getGatewayConfig` (the function actually called by call sites) keeps its real implementation:

- `tests/payments/config.test.ts`
- `tests/checkout/paystack-actions.test.ts`
- `tests/checkout/flutterwave-actions.test.ts`
- `tests/checkout/remita-actions.test.ts`
- `tests/checkout/interswitch-actions.test.ts`

Because `getGatewayConfig` calls `getGatewayCredentialsMap()` via the module's own internal ESM binding (not through the re-exported/mocked reference), **the override does not intercept that internal call**. `@/lib/db/client` is not mocked in any of these 5 files either, so `getGatewayConfig` in these tests performs a **real network call** to the Neon `TEST_DATABASE_URL` (confirmed configured in `.env.local`, and confirmed by this verifier's own direct query to return 0 rows in that database). The tests still pass, but only because:
1. The test DB table happens to be empty (so every field falls through to env, matching what each test expects), and
2. None of these 5 files ever assert "a DB-persisted row wins over env" — they only test the env-fallback path, which is what an empty real DB incidentally produces.

**This is a test-integrity issue, not a production defect.** The 584-second full-suite runtime (394 tests, `npm test`) is consistent with dozens of unintended live Neon HTTP round-trips hidden inside what are labeled "unit" tests — a real architecture smell (network dependency + non-determinism risk + slow CI), and it means these 5 files provide **zero actual coverage of DB-first precedence** despite superficially looking like they exercise the resolver.

**However, ADMN-07's DB-first precedence IS properly covered elsewhere:**
- `tests/payments/gateway-credentials.test.ts` correctly mocks `@/lib/db/client` directly and asserts "DB-first: a non-empty DB secret row wins over the env var (decrypted)" with a controlled fake row.
- `tests/payments/gateway-credentials-integration.test.ts` is DB-gated (`describe.skipIf(!hasDatabase)`) and asserts against the **real** isolated `TEST_DATABASE_URL`: "DB value wins once a real row is inserted, and the row is cleaned up after the test" — a genuine, correctly-designed integration test.
- `tests/payments/gateways.test.ts` (the file the risk description specifically called out as previously buggy) was **already fixed** in 08-05: its comment explicitly documents this exact bug and the fix mocks `@/lib/db/client` directly instead of `gateway-credentials.ts`, avoiding the self-reference problem entirely.
- `tests/checkout/paystack-webhook.test.ts`, `flutterwave-webhook.test.ts`, `webhook.test.ts` (Stripe), `gtpay-webhook.test.ts`, `remita-webhook.test.ts` all override `getGatewayConfig` **directly** (the function actually called by the webhook routes) rather than the internal helper — these are correctly isolated and their fail-closed assertions are trustworthy.
- `tests/actions/gateway-credentials.test.ts` also overrides `getGatewayConfig` directly and mocks `db.insert` — correctly isolated.

**Conclusion:** ADMN-07's DB-first-with-env-fallback claim is trustworthy — it rests on a properly-mocked unit test plus a genuine real-DB integration test, not on the 5 flawed files. The 5 flawed files are a **quality/hygiene gap** (silently-network-dependent "unit" tests, zero incremental precedence coverage) worth fixing in a follow-up, but they do not undermine the phase's correctness claim.

**Severity: WARNING (test-integrity, non-blocking).** Recommend a follow-up task to either (a) mock `@/lib/db/client` directly in these 5 files (matching the `gateways.test.ts` fix), or (b) override `getGatewayConfig` directly instead of `getGatewayCredentialsMap`.

### Anti-Patterns Found

None. No TODO/FIXME/PLACEHOLDER/stub markers found across all 17 Phase 8 core files scanned (`crypto.ts`, `gateway-credentials.ts`, `config.ts`, `stripe.ts`, `actions/gateway-credentials.ts`, `admin/settings/page.tsx`, `GatewayCredentialCard.tsx`, 5 gateway modules, 5 webhook routes).

### Human Verification Required

See frontmatter `human_verification` — 4 items, all sourced directly from `08-HUMAN-UAT.md` (already tracked by the executor, not newly discovered): live write-only round-trip, DevTools no-leak check, Replace/Cancel + empty-submit preserve, and the Test-connection affordance. All are genuine browser/live-session checks that cannot be substituted by static code analysis, though the code-level trace in this report (Data-Flow Trace + Required Artifacts) provides strong supporting evidence that the no-leak and precedence logic are implemented correctly.

### Gaps Summary

No code-level gaps found. All 5 ROADMAP Phase 8 success criteria and all 3 requirements (ADMN-05/06/07) are implemented and verified at the source-code level: schema live in both Neon DBs, AES-256-GCM crypto envelope correct and fail-loud, DB-first/env-fallback/fail-closed resolver correctly implemented and correctly wired into all 5 gateway modules + `stripe.ts`/`config.ts` + all 5 webhook routes (fail-closed before any HMAC/hash compute), write-only Server Action with admin-gating/closed-Zod/encrypt-before-persist/never-echoes, and a Settings UI that only ever passes presence booleans + public values to the client. Full test suite (394/394) and production build both pass cleanly.

The phase is NOT blocked, but is not yet fully closeable either: `08-HUMAN-UAT.md` (owned by the executor, status `pending`) documents 7 live-browser checks that require a real admin session and DevTools inspection — standard "cannot be automated" territory per this verifier's mandate, not a sign of missing implementation. One non-blocking WARNING is raised: 5 test files (`config.test.ts` + 4 checkout action test files) silently make real, unmocked Neon network calls due to an ESM self-reference mocking gap, providing no actual DB-precedence coverage of their own — though the DB-first claim is independently and correctly verified by other test files plus this verifier's direct source/DB inspection.

**Recommendation:** Route to human for the 7 `08-HUMAN-UAT.md` checks before considering Phase 8 fully closed; separately, consider a low-priority follow-up to fix the 5 test-integrity files (mock `@/lib/db/client` directly, matching the pattern already used correctly in `gateways.test.ts`).

---

_Verified: 2026-07-12T09:54:40Z_
_Verifier: Claude (gsd-verifier)_
