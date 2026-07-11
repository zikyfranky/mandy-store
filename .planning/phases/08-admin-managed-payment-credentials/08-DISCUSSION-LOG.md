# Phase 8: Admin-Managed Payment Credentials — Discussion Log

**Mode:** `--auto --chain` (autonomous; all gray areas auto-resolved with recommended defaults)
**Date:** 2026-07-11

Human reference only — not consumed by downstream agents (they read `08-CONTEXT.md`).

## Pre-discussion decisions (user-selected, before this run)

Captured via AskUserQuestion when the feature was requested:
- **Security posture:** Encrypted at rest (AES-256-GCM) + one master key in `.env` — *chosen over* plaintext-in-DB.
- **Scope:** All 8 gateways — *chosen over* "active NGN only" or "Paystack+Flutterwave only".
- **Delivery:** As a GSD phase (added as Phase 8) — *chosen over* direct build.

## Auto-resolved gray areas

| # | Area | Question | Selected (recommended) | → CONTEXT |
|---|------|----------|------------------------|-----------|
| 1 | Storage schema | JSON blob per gateway vs field-level rows | `gateway_credentials` key/value table (provider,field,value,is_secret,updatedAt,updatedBy) | D-01 |
| 2 | Encryption | Which scheme + envelope | Node crypto AES-256-GCM, `v1:iv:tag:ct`, key=base64 32B; encrypt only is_secret fields | D-02 |
| 3 | Runtime resolution | DB-vs-env precedence + hot path | async `getGatewayConfig()` resolver, DB-first→env fallback, React.cache batched, fail-closed | D-03/D-03a |
| 4 | Settings UI | Present secrets + test/live | Per-gateway card; secret fields write-only (Configured/Replace, empty=unchanged); single active keyset | D-04 |
| 5 | Write security | Action shape | `saveGatewayCredentials()` mirroring `toggleStoreSetting` (auth-first, closed Zod, encrypt-before-persist) | D-05 |
| 6 | Test connection | Verify before enable | Best-effort for Stripe/Paystack/Flutterwave; skip redirect-only; non-blocking | D-06 |
| 7 | Key rotation | Rotation policy | Single key v1, versioned prefix; rotation ⇒ re-entry; throw-on-ciphertext-without-key | D-07 |
| 8 | Audit | Trail depth | Minimal updatedBy+updatedAt; full audit log deferred | D-08 |
| 9 | Migration | Scope + push | db:push to BOTH DBs; all 8 gateways' full field sets; safe pre-migration via env fallback | D-09 |

## Deferred (captured, out of scope)

- Dual test/live keyset storage + mode switch
- Automated encryption-key rotation + bulk re-encrypt
- Full credential-change audit log with history
- External secrets manager / KMS integration

## Scope-creep redirects

None — discussion stayed within the "move credentials from env to DB-backed admin UI" boundary. The payment *flows*, the enable/disable *toggle*, and adding new gateways were all explicitly held out of scope.
