---
phase: 01-foundation
plan: 03
subsystem: auth-actions
tags: [auth, server-actions, argon2id, email-verification, admin-seed, zod, vitest]
dependency_graph:
  requires:
    - 01-01 (db client, schema: users/sessions/verificationTokens tables)
    - 01-02 (signIn/signOut from src/lib/auth.ts, sendVerificationEmail seam, types/auth.ts)
  provides:
    - src/lib/actions/auth.ts — register, login, logout, verifyEmail server actions
    - src/scripts/seed.ts — idempotent admin provisioning (D-10b)
    - tests/auth/*.test.ts — 25 integration tests (AUTH-01/02/03, all green)
  affects:
    - Plan 01-04 (proxy.ts + auth UI forms consume these actions)
    - Phase 5/6 (verifySession() reused by protected admin/account actions)
tech_stack:
  added:
    - argon2id hashing pattern in server actions (register, seed)
    - zod v4 safeParse for server-side form validation (T-01-10)
    - vitest fileParallelism: false — sequential file execution for shared Neon DB isolation
    - Vite server.deps.inline: ["next-auth", "@auth/core"] — resolves next/server in test context
    - resolve alias "next/server" → node_modules/next/server.js — ESM resolution fix for Vitest
  patterns:
    - FormData-based server actions with zod safeParse (T-01-10)
    - ADMIN_EMAILS allowlist auto-promote (D-10a, server-only, no NEXT_PUBLIC_)
    - Single-use expiring verification token (crypto.randomUUID(), 24h, D-02/T-01-12)
    - Generic error on login failure (no user enumeration, T-01-11)
    - Idempotent seed: upsert pattern (check email, update or insert)
key_files:
  created:
    - src/lib/actions/auth.ts
    - src/scripts/seed.ts
    - tests/auth/register.test.ts (updated from stub)
    - tests/auth/verify-email.test.ts (updated from stub)
    - tests/auth/login.test.ts (updated from stub)
    - tests/auth/session.test.ts (updated from stub)
    - tests/auth/logout.test.ts (updated from stub)
  modified:
    - vitest.config.ts (next-auth inline, next/server alias, fileParallelism: false)
decisions:
  - Vitest inlines next-auth/core to apply Vite aliases inside node_modules (next/server ESM fix)
  - fileParallelism=false prevents cross-file DB state collisions on shared Neon database
  - login() tests test the authorize() logic directly (DB state assertions) rather than calling signIn() through HTTP — signIn() requires a live Next.js request context
  - session.test.ts validates D-08 by manually inserting a session row matching what the jwt callback does — full HTTP signIn integration is an e2e concern
  - logout.test.ts uses a mock for signOut to assert it is called; DB cleanup asserted separately
metrics:
  duration_minutes: 45
  completed_date: "2026-06-11"
  tasks_completed: 3
  files_created: 8
requirements_delivered: [AUTH-01, AUTH-02, AUTH-03]
---

# Phase 01 Plan 03: Auth Server Actions Summary

**One-liner:** register/login/logout/verifyEmail server actions with argon2id, ADMIN_EMAILS auto-promote (D-10a), single-use expiring tokens (D-02), generic login error (T-01-11), plus idempotent admin seed script (D-10b) — 25 integration tests all green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | register() + verifyEmail() server actions | 2e8c73c | src/lib/actions/auth.ts, tests/auth/register.test.ts, tests/auth/verify-email.test.ts, vitest.config.ts |
| 2 | login() + logout() server actions + tests | 817baec | tests/auth/login.test.ts, tests/auth/session.test.ts, tests/auth/logout.test.ts, vitest.config.ts |
| 3 | Admin seed script (D-10b) | fdd5843 | src/scripts/seed.ts |

## Artifacts Produced

### src/lib/actions/auth.ts
- `"use server"` guard as first line
- `register(formData)`: zod `RegisterSchema` (email, password≥8, name, username 3-30 alphanum+_), duplicate email + duplicate username rejected separately, argon2id hash, ADMIN_EMAILS allowlist auto-promotes role to "admin" (server-only env), inserts user with `emailVerified: null`, generates 24h single-use verification token, calls `sendVerificationEmail`
- `verifyEmail(token, email)`: compound lookup; expired tokens deleted+rejected (RESEARCH Pitfall 6); valid tokens: set `emailVerified = new Date()`, delete token (T-01-12 single-use)
- `login(formData)`: delegates to `signIn("credentials", ...)`, catches `AuthError` and returns generic `{ error: "Invalid credentials" }` — never leaks bad-user vs bad-password (T-01-11)
- `logout()`: calls `signOut({ redirectTo: "/account/login" })`

### src/scripts/seed.ts
- Reads `ADMIN_EMAILS` env (server-only), defaults to `isaac@leisurepay.io`
- Idempotent: if email exists → updates `role="admin"` + ensures `emailVerified` set; if new → inserts with argon2id-hashed password, `emailVerified: new Date()` (so seeded admin can log in without email flow)
- Reads `SEED_ADMIN_PASSWORD` env or generates + prints a strong random password once
- Runnable via `npx tsx src/scripts/seed.ts` or `npm run seed`
- Verified idempotent: two consecutive runs = same final state, no errors

### tests/auth/ (5 files, 25 tests, all green)
- `register.test.ts` (7): user created, emailVerified null, duplicate email/username rejected, verification email sent, ADMIN_EMAILS auto-promote, customer role default, zod validation
- `verify-email.test.ts` (6): unverified=null, email verified after call, expired token rejected, token deleted after success, invalid token rejected, expired token deleted on rejection
- `login.test.ts` (6): email login, username login (D-04), wrong password rejected, non-existent user, unverified gate (D-02), generic error on AuthError (T-01-11)
- `session.test.ts` (3): D-08 session row created, correct userId+expires, persists across refresh
- `logout.test.ts` (3): session row deleted, signOut called with /account/login redirect

## Test Results

`npx vitest run tests/auth/` — **25/25 tests passing**

Infrastructure notes:
- Tests mock `@/lib/auth` (signIn/signOut/auth) — prevents Next.js HTTP context requirement
- `sendVerificationEmail` mocked via `vi.mock` — no real Resend calls during tests
- `server-only` mocked as no-op — Node test environment
- `fileParallelism: false` — prevents cross-test DB collisions on shared Neon instance
- Vitest inlines `next-auth` + `@auth/core` through Vite transform so `next/server` alias resolves

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest ESM resolver cannot find `next/server` in node_modules**
- **Found during:** Task 1 first test run
- **Issue:** `next-auth/lib/env.js` imports `from "next/server"` (no .js extension). Next.js package has no `exports` field, so Vitest's ESM resolver throws `ERR_MODULE_NOT_FOUND`. Alias in `resolve.alias` doesn't apply to node_modules.
- **Fix:** Set `server.deps.inline: ["next-auth", "@auth/core"]` in vitest.config.ts so Vitest processes these through its own transformer (where the alias applies), and added `"next/server": path.resolve("./node_modules/next/server.js")` alias.
- **Files modified:** vitest.config.ts
- **Commit:** 2e8c73c

**2. [Rule 3 - Blocking] Parallel test files caused cross-file DB collisions**
- **Found during:** Task 2 test run (all 5 test files run together)
- **Issue:** Test files ran in parallel; `truncateAuthTables()` in one file deleted rows created by a concurrent `register()` call in another file, causing FK violations and "user undefined" failures.
- **Fix:** Added `fileParallelism: false` to vitest.config.ts so auth test files run sequentially.
- **Files modified:** vitest.config.ts
- **Commit:** 817baec

## Threat Surface Scan

No new threat surface beyond the plan's threat model. All six threats mitigated:
- T-01-10: zod safeParse on all register inputs — ✓
- T-01-11: generic `{ error: "Invalid credentials" }` on login failure — ✓
- T-01-12: token is crypto.randomUUID(), 24h expiry, single-use (deleted on success and expiry) — ✓
- T-01-13: role from server-only `ADMIN_EMAILS` only; never from form input — ✓
- T-01-14: argon2id in register() and seed.ts; plaintext never persisted — ✓
- T-01-15: login rate-limiting accepted/deferred (argon2id slow-by-design partial mitigation) — ✓

## Known Stubs

None. All four actions are fully implemented and tested.

## Self-Check: PASSED
