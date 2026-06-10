---
phase: 01-foundation
plan: 02
subsystem: auth-core
tags: [auth, next-auth-v5, drizzle-adapter, credentials-provider, dal, resend, react-email, server-only]
dependency_graph:
  requires:
    - 01-01 (db client, schema with users/sessions/accounts/verificationTokens tables, Node 22 toolchain)
  provides:
    - src/lib/auth.ts — NextAuth config exporting handlers, auth, signIn, signOut
    - src/types/auth.ts — Session type augmentation adding id and role
    - src/app/api/auth/[...nextauth]/route.ts — Auth.js GET/POST route handlers
    - src/lib/dal.ts — verifySession() and verifyAdminSession() server-only auth seam
    - src/lib/email/send-verification.ts — Resend verification email sender (server-only)
    - src/emails/VerificationEmail.tsx — React Email template for verification links
  affects:
    - Plan 01-03 (register/login/logout Server Actions consume signIn/signOut/dal)
    - Plan 01-04 (proxy.ts wraps auth() from this plan)
    - Phase 4/5 (Resend seam reused for order confirmation emails)
tech_stack:
  added:
    - next-auth@5.0.0-beta.31 (Auth.js v5, already installed)
    - "@auth/drizzle-adapter@1.11.2" (already installed)
    - argon2@0.44.0 (already installed)
    - resend@6.12.4 (already installed)
    - "@react-email/components@1.0.12" (already installed)
    - server-only@0.0.1 (already installed)
  patterns:
    - D-08 workaround: manual db.insert(sessions) in jwt callback for Credentials provider
    - DAL pattern with import "server-only" as structural client-bundle guard
    - TDD RED/GREEN cycle for verifySession/verifyAdminSession
key_files:
  created:
    - src/lib/auth.ts
    - src/types/auth.ts
    - src/app/api/auth/[...nextauth]/route.ts
    - src/lib/dal.ts
    - src/lib/email/send-verification.ts
    - src/emails/VerificationEmail.tsx
    - tests/lib/dal.test.ts (updated from stub to full passing tests)
  modified: []
decisions:
  - D-08 workaround applied exactly as documented in RESEARCH.md — db.insert(sessions) directly in jwt callback; no adapter.createSession() call
  - Role cast as "customer" | "admin" in session callback to satisfy strict TypeScript augmentation
  - server-only import placed as literal first line in dal.ts and send-verification.ts to satisfy acceptance criteria
  - Resend from address uses onboarding@resend.dev for development; TODO comment for production domain
  - 9 unit tests added for DAL covering both redirect paths and success paths with mocked auth()
metrics:
  duration_minutes: 67
  completed_date: "2026-06-10"
  tasks_completed: 3
  files_created: 7
requirements_delivered: [AUTH-02, AUTH-03]
---

# Phase 01 Plan 02: Auth Core Summary

**One-liner:** Auth.js v5 with Credentials provider, D-08 DB-session workaround via manual jwt-callback insert, email-or-username login, emailVerified gate, server-only DAL (verifySession/verifyAdminSession), and Resend verification email seam.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Auth.js config + type augmentation | 8495bf5 | src/lib/auth.ts, src/types/auth.ts, src/app/api/auth/[...nextauth]/route.ts |
| 2 | DAL (verifySession / verifyAdminSession) | e4b698c | src/lib/dal.ts, tests/lib/dal.test.ts |
| 3 | Resend verification email sender + template | 54f4305 | src/lib/email/send-verification.ts, src/emails/VerificationEmail.tsx |

## Artifacts Produced

### src/lib/auth.ts
NextAuth configuration with:
- `DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens })`
- `session: { strategy: "database", maxAge: 30*24*60*60, updateAge: 24*60*60 }` (D-06, D-07)
- Credentials provider with `identifier` field — resolves user via `or(eq(users.email, identifier), eq(users.username, identifier))` (D-04)
- `if (!user.emailVerified) return null` gate (D-02)
- D-08 workaround in `jwt` callback: `if (account?.provider === "credentials" && user)` → `db.insert(sessions).values({ sessionToken, userId, expires })`
- `session` callback populates `session.user.id` and `session.user.role`
- Exports `{ handlers, auth, signIn, signOut }`

### src/types/auth.ts
TypeScript `declare module "next-auth"` augmentation adding `id: string` and `role: "customer" | "admin"` to `Session["user"]`.

### src/app/api/auth/[...nextauth]/route.ts
`export const { GET, POST } = handlers` — wires Auth.js into the Next.js App Router.

### src/lib/dal.ts
- `import "server-only"` as first line (T-01-08 build-time guard)
- `verifySession()` → `auth()` → redirect to /account/login if no session; returns `{ id, role, email }`
- `verifyAdminSession()` → delegates to `verifySession()`, then redirects to / if `role !== "admin"`
- Role read exclusively from `session.user.role` — never from URL/form (T-01-09, RESEARCH Pitfall 7)

### src/lib/email/send-verification.ts
- `import "server-only"` first line (T-01-08)
- `sendVerificationEmail(email, token)` builds `NEXT_PUBLIC_APP_URL/verify-email?token=TOKEN&email=EMAIL`
- Uses `RESEND_API_KEY` (no NEXT_PUBLIC_ prefix — server secret)
- From address: `"Mandy Store <onboarding@resend.dev>"` (TODO: replace with verified domain for production)

### src/emails/VerificationEmail.tsx
React Email component using `@react-email/components` (Html, Body, Container, Heading, Text, Button, Hr, Preview) accepting `{ verifyUrl }` prop.

## Test Results

`npx vitest run tests/lib/dal.test.ts` — 9/9 tests passing.

Tests cover:
- `verifySession()` redirects to /account/login when session is null
- `verifySession()` redirects when session exists but user.id is undefined
- `verifySession()` returns `{ id, role, email }` for authenticated customer
- `verifySession()` returns `{ id, role, email }` for authenticated admin
- `verifySession()` defaults role to "customer" when not set
- `verifyAdminSession()` redirects to / for non-admin authenticated user
- `verifyAdminSession()` redirects to / when role is undefined
- `verifyAdminSession()` returns session user for authenticated admin
- `verifyAdminSession()` redirects to /account/login when unauthenticated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict type error in session callback role cast**
- **Found during:** Task 1 tsc --noEmit check
- **Issue:** `(user as { role?: string }).role ?? "customer"` yields `string` type, but `session.user.role` is typed as `"customer" | "admin"` from the augmentation
- **Fix:** Added explicit `as "customer" | "admin"` cast: `((user as { role?: string }).role ?? "customer") as "customer" | "admin"`
- **Files modified:** src/lib/auth.ts (line 94)
- **Commit:** Included in 8495bf5

**2. [Rule 2 - Convention] server-only import moved to literal first line**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** Comments placed before `import "server-only"` caused the plan's acceptance criterion `"first line is import 'server-only'"` to fail
- **Fix:** Moved `import "server-only"` before the comment block in both dal.ts and send-verification.ts
- **Files modified:** src/lib/dal.ts

## Threat Surface Scan

No new threat surface beyond what was specified in the plan's threat model. All six threats (T-01-04 through T-01-09) have been mitigated as designed:
- T-01-04: emailVerified gate in authorize() — returns null if null
- T-01-05: argon2.verify() only — no plaintext comparison; passwordHash never returned
- T-01-06: crypto.randomUUID() sessionToken; httpOnly/secure cookie managed by Auth.js
- T-01-07: DB-backed sessions enable server-side revocation
- T-01-08: `import "server-only"` on dal.ts and send-verification.ts
- T-01-09: Role read from session.user.role only (DAL)

## Known Stubs

None. All artifacts are fully wired. The Resend sender uses `onboarding@resend.dev` for development — this is intentional and documented with a TODO comment; it is not a stub blocking the plan's goals.

## Self-Check: PASSED
