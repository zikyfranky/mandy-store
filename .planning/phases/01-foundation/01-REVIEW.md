---
phase: 01-foundation
reviewed: 2026-06-11T00:00:00Z
depth: deep
files_reviewed: 29
files_reviewed_list:
  - src/lib/db/schema.ts
  - src/lib/db/client.ts
  - src/lib/auth.ts
  - src/types/auth.ts
  - src/lib/dal.ts
  - src/lib/actions/auth.ts
  - src/lib/email/send-verification.ts
  - src/emails/VerificationEmail.tsx
  - src/scripts/seed.ts
  - src/scripts/load-env.ts
  - src/proxy.ts
  - src/app/api/auth/[...nextauth]/route.ts
  - src/app/(auth)/account/login/page.tsx
  - src/app/(auth)/account/register/page.tsx
  - src/app/(auth)/layout.tsx
  - src/app/(auth)/verify-email/page.tsx
  - src/app/account/orders/page.tsx
  - src/app/admin/page.tsx
  - src/components/auth/LoginForm.tsx
  - src/components/auth/RegisterForm.tsx
  - tests/auth/register.test.ts
  - tests/auth/login.test.ts
  - tests/auth/session.test.ts
  - tests/auth/verify-email.test.ts
  - tests/auth/logout.test.ts
  - tests/db/schema.test.ts
  - tests/e2e/proxy.spec.ts
  - tests/helpers/db.ts
  - tests/lib/dal.test.ts
findings:
  critical: 0
  warning: 7
  info: 4
  total: 11
status: issues_found
---

# Phase 1: Foundation — Code Review Report

**Reviewed:** 2026-06-11
**Depth:** deep (cross-file, call-chain tracing)
**Files Reviewed:** 29
**Status:** issues_found

## Summary

The auth foundation is structurally sound. The D-08 workaround (jwt strategy + encode/decode session bridge) is correctly implemented. The `verifySession()` / `verifyAdminSession()` DAL pattern satisfies the dual-layer protection requirement. No hardcoded secrets in the application proper, no NEXT_PUBLIC_ exposure of server credentials, and the argon2id hashing is correctly applied. Drizzle queries are parameterised throughout — no SQL injection surface.

Seven warnings and four info items were found. None are security-critical blockers, but two warnings (partial-failure in `register()` and the logout test coverage gap) represent reliability risks that should be fixed before adding payment flows on top of this auth layer. The proxy route-coverage gap is the most important structural issue to address before Phase 2 routes land.

---

## Warnings

### WR-01: `proxy.ts` enumerates specific `/account/*` sub-paths — future routes silently unprotected

**File:** `src/proxy.ts:22-23`
**Issue:** `isAccountRoute` is defined as:
```ts
path.startsWith("/account/orders") || path.startsWith("/account/settings")
```
This is an allowlist of specific paths instead of `path.startsWith("/account/")` with exceptions carved out for the auth routes. Any new `/account/*` page added in later phases (e.g. `/account/profile`, `/account/addresses`, `/account/payment-methods`) will NOT be redirected by the proxy for unauthenticated users. The `verifySession()` in-page guard will still protect them functionally, but the UX layer (proxy redirect to login) will silently fail to fire.

D-12 specifies `/account/*` as the protected prefix. The implementation narrows it to two explicit paths.

**Fix:**
```ts
// Replace the enumerated check with a prefix check, then exclude auth sub-paths:
const isAccountRoute =
  path.startsWith("/account/") &&
  path !== "/account/login" &&
  path !== "/account/register"
```
Remove `/account/login` and `/account/register` from `isAuthRoute` accordingly, or keep them as a separate guard — both work. The key fix is switching `/account/*` to a prefix match.

---

### WR-02: `register()` has no error handling around `sendVerificationEmail` — user gets stuck

**File:** `src/lib/actions/auth.ts:79-99`
**Issue:** The user row and verification token are inserted unconditionally. `sendVerificationEmail()` is then called without any `try/catch`. If Resend returns an error or the network call fails, `sendVerificationEmail` throws, the Server Action propagates that unhandled exception to the Next.js runtime (which surfaces it as a 500 to the form), and the user is left in an unrecoverable state: their account exists with `emailVerified: null`, they cannot log in, and there is no "resend verification" endpoint in Phase 1 to recover.

Similarly, if `db.insert(users)` or `db.insert(verificationTokens)` throws for any reason after the user row was partially created, the DB state is left inconsistent (no transaction wrapping these two inserts).

**Fix:**
```ts
// Wrap in a try/catch to return a graceful error, and wrap the two inserts in a transaction:
try {
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ ... })
    await tx.insert(verificationTokens).values({ ... })
  })
  await sendVerificationEmail(email, token)
} catch (err) {
  // Roll back is automatic for the tx block; for email failures the user exists but
  // email wasn't sent — return a specific message so they know to contact support or retry.
  console.error("register: failed to send verification email", err)
  return { error: "Account created but verification email failed to send. Please try again or contact support." }
}
```
If a resend-verification endpoint is added in a future phase, the simpler fix is just catching the email error and returning a user-friendly message.

---

### WR-03: `encode()` throws an unhandled `Error` for any edge-case call without a user id

**File:** `src/lib/auth.ts:88-91`
**Issue:** `encode()` throws `new Error("auth: encode called without a user id on the token")` when neither `token?.id` nor `token?.sub` is set. The @auth/core `session.js` wraps the entire session-read path in a try/catch that cleans cookies on any thrown error, so this is not an open door. However, the throw bypasses `events.signOut` and returns a cleaned cookie without deleting the DB session row — a minor session row leak if this path is somehow triggered.

More importantly, the error message leaks an internal implementation string. If this is ever logged in a context that surfaces to the client (e.g. during a callback error), it provides implementation hints.

**Fix:** Return `null` instead of throwing, to match the expected encode-returns-null or decode-returns-null contract used by the rest of the session machinery:
```ts
if (!userId) {
  // No authenticated user — return empty string; Auth.js will clear the cookie.
  return ""
}
```
Or add a comment explaining why the throw is intentionally loud (dev-time assertion, never reachable in prod), to make the intent clear to future maintainers.

---

### WR-04: `login()` action detects redirect errors by `error.message === "NEXT_REDIRECT"` — fragile string comparison

**File:** `src/lib/actions/auth.ts:182-185`
**Issue:**
```ts
if (error instanceof Error && error.message === "NEXT_REDIRECT") {
  throw error
}
```
Next.js constructs redirect errors with `new Error(REDIRECT_ERROR_CODE)` where `REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'`, so this check works correctly today. However, the semantically correct identifier on a redirect error is `error.digest` (which contains `NEXT_REDIRECT;push;/url;307;`), not `error.message`. The public `isRedirectError()` utility from `next/dist/client/components/redirect-error` checks `error.digest`, not `error.message`.

If Next.js 16.x changes the `message` field (e.g., makes it more descriptive) while keeping `digest` stable, this check silently swallows the redirect and returns `undefined` from `login()`, leaving the user with no feedback and no redirect.

**Fix:**
```ts
import { isRedirectError } from "next/dist/client/components/redirect-error"

// In catch block:
if (isRedirectError(error)) {
  throw error
}
```
`isRedirectError` is not yet in the public `next/navigation` surface but is accessible from the internal path and is the canonical check used in the Next.js codebase itself.

---

### WR-05: Logout test does not exercise `events.signOut` — the actual DB cleanup path is untested

**File:** `tests/auth/logout.test.ts:71-76`
**Issue:** The test comment explicitly admits:
```
// In tests, signOut is mocked, so we manually delete the session to simulate what
// Auth.js does when signOut() is called...
```
Because `@/lib/auth` is fully mocked, the `events.signOut` handler in `src/lib/auth.ts` (which calls `adapter.deleteSession!()`) is never executed. The test only asserts that `signOut` was called with the right arguments and that a manually-deleted row disappears — it does not verify that the real signOut event handler actually removes the DB row.

This means a regression in `events.signOut` (e.g., losing the `sessionToken` from the decoded token) would not be caught by the test suite.

**Fix:** Add a session.test.ts-style integration test that calls the real `authConfig.events.signOut` directly with a known session token and asserts the DB row is deleted:
```ts
it("events.signOut deletes the DB session row (D-06 revocability)", async () => {
  const { authConfig } = await import("@/lib/auth")
  const db = await getDb()
  const { sessions } = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")

  const sessionToken = crypto.randomUUID()
  await db.insert(sessions).values({ sessionToken, userId, expires: new Date(Date.now() + 3600_000) })

  // Invoke the real handler
  await authConfig.events.signOut!({ token: { sessionToken } } as never)

  const row = await db.query.sessions.findFirst({ where: eq(sessions.sessionToken, sessionToken) })
  expect(row).toBeUndefined()
})
```

---

### WR-06: `verify-email/page.tsx` re-executes `verifyEmail()` on every page render — shows error on refresh

**File:** `src/app/(auth)/verify-email/page.tsx:35`
**Issue:** `verifyEmail(token, email)` is called directly in the Server Component render function. The first render succeeds and deletes the token. Any subsequent render (browser refresh, accidental re-navigation) calls `verifyEmail` again with the now-deleted token, which returns `{ error: "Invalid token" }` and shows the "Verification failed" error page — even though verification succeeded.

This is a UX defect that will confuse users who refresh the page after verifying. It also means there is no way to tell from the UI whether verification previously succeeded.

**Fix:** One approach: after successful verification, immediately redirect to `/account/login?verified=1` so the URL no longer contains the token:
```ts
import { redirect } from "next/navigation"
// ...
const result = await verifyEmail(token, email)
if ("success" in result) {
  redirect("/account/login?verified=1")
}
```
The login page can then render a "Email verified — you can now sign in" banner when `?verified=1` is present.

---

### WR-07: Seed script username collision handling is incomplete — can fail with DB unique-constraint error

**File:** `src/scripts/seed.ts:72-75`
**Issue:**
```ts
const existingUsername = await db.query.users.findFirst({ where: eq(users.username, username) })
const finalUsername = existingUsername ? `${username}_admin` : username
```
Only one fallback suffix (`_admin`) is tried. If a user with username `isaac_admin` already exists, the `db.insert(users)` at line 77 throws a unique-constraint violation, crashing the seed script with no clear error message.

This is a one-shot script used for repeatable admin provisioning. A crash mid-seed (especially in CI or production setup) leaves the environment in an undefined state.

**Fix:** Either loop through suffixes (`_admin`, `_admin2`, etc.) or use a timestamp suffix:
```ts
let finalUsername = username
let suffix = 0
while (true) {
  const taken = await db.query.users.findFirst({ where: eq(users.username, finalUsername) })
  if (!taken) break
  suffix++
  finalUsername = `${username}_admin${suffix > 1 ? suffix : ""}`
}
```

---

## Info

### IN-01: Seed script has a hardcoded personal email address as fallback default

**File:** `src/scripts/seed.ts:20`
**Issue:**
```ts
const raw = process.env.ADMIN_EMAILS ?? "isaac@leisurepay.io"
```
Any developer who runs `npm run seed` without setting `ADMIN_EMAILS` in their environment will promote `isaac@leisurepay.io` to admin in whatever database they are seeding. In a staging environment pointed at real customer data, this would create a live admin account for an unintended address.

**Fix:** Remove the hardcoded fallback. Require `ADMIN_EMAILS` to be explicitly set, or default to an obviously-placeholder value that would fail validation:
```ts
const raw = process.env.ADMIN_EMAILS
if (!raw) {
  console.error("SEED_ERROR: ADMIN_EMAILS env var is required. Set it in .env.local before running seed.")
  process.exit(1)
}
```

---

### IN-02: `generatePassword()` in seed script has a slight modulo bias

**File:** `src/scripts/seed.ts:105-109`
**Issue:**
```ts
const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
const randomValues = crypto.getRandomValues(new Uint8Array(16))
return Array.from(randomValues).map((b) => charset[b % charset.length]).join("")
```
`charset.length` is 70. `256 % 70 = 46`, so the first 46 characters of the charset are selected ~4/256 times while the remaining 24 characters are selected ~3/256 times — roughly a 1.3% bias. For a one-time admin seed password, the practical impact is negligible. The password is still cryptographically random enough for this use case.

**Fix (optional, low priority):** Rejection sampling to eliminate bias:
```ts
function generatePassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  const result: string[] = []
  while (result.length < length) {
    const [b] = crypto.getRandomValues(new Uint8Array(1))
    if (b < Math.floor(256 / charset.length) * charset.length) {
      result.push(charset[b % charset.length])
    }
  }
  return result.join("")
}
```

---

### IN-03: `callbackUrl` set in proxy redirect is never consumed — future open-redirect risk

**File:** `src/proxy.ts:32`
**Issue:**
```ts
loginUrl.searchParams.set("callbackUrl", path)
```
The `callbackUrl` parameter is appended to the login redirect URL but the `login()` action hardcodes `redirectTo: "/"` and never reads `callbackUrl`. This is harmless today but creates a future open-redirect risk: when a developer later wires `callbackUrl` into the post-login redirect (a natural next step), they may not sanitise the value, allowing `?callbackUrl=https://evil.com` to redirect users off-site.

`path` is always a server-derived pathname so the current value is safe. But the parameter should be documented as "for future use — must be sanitised to same-origin before consuming" or removed until it's actually needed.

**Fix:** Add a comment making the safety constraint explicit, or remove the parameter until Phase 3/4 when post-login redirect is implemented:
```ts
// callbackUrl is stored for future post-login redirect (Phase 3).
// MUST sanitise to same-origin before using: new URL(callbackUrl, origin).origin === origin
loginUrl.searchParams.set("callbackUrl", path)
```

---

### IN-04: TODO comment left in production email sender

**File:** `src/lib/email/send-verification.ts:23`
**Issue:**
```ts
// TODO: replace with verified domain before production (RESEARCH Open Question 1)
from: "Mandy Store <onboarding@resend.dev>",
```
Leaving a TODO comment in a production seam is appropriate only if it's tracked. The comment is accurate (the sender domain must be verified before launch), but a code comment is easily missed. This should be in a checklist item or issue.

**Fix:** No code change required for Phase 1. Ensure this appears in the Phase 4 production checklist / VALIDATION.md as an explicit "replace `onboarding@resend.dev` with verified sender" step before launch.

---

## Not Flagged (design decisions confirmed correct)

- **D-08 jwt.encode/decode session bridge:** Verified against `@auth/core` source (`callback/index.js` lines 247-277, `session.js` lines 21-64). On sign-in, encode receives a token with `id` set by the jwt callback and creates one DB row. On session-read, decode resolves the opaque token to the DB row, jwt callback receives the decoded payload (which carries `sessionToken`), and encode's `existing` guard correctly reuses the same token. No row leak. `signout.js` calls `decode()` then fires `events.signOut({ token })` — the handler correctly reads `message.token?.sessionToken` and calls `adapter.deleteSession`.

- **Redirect error detection in `login()`:** `error.message === "NEXT_REDIRECT"` works correctly in the installed Next.js version (confirmed: `getRedirectError` sets `new Error(REDIRECT_ERROR_CODE)` where the constant is `"NEXT_REDIRECT"`). Flagged as WR-04 for fragility, not broken behavior.

- **User enumeration at login:** `login()` returns a generic `"Invalid credentials"` message regardless of whether the user does not exist, the password is wrong, or the email is unverified. Correct.

- **`verifySession()` role source:** Role is read exclusively from `session.user.role` which is populated from the DB-backed session in `decode()` via the `user` row. No client-controllable input path. Correct.

- **`ADMIN_EMAILS` server-only:** Not prefixed with `NEXT_PUBLIC_`. Not accessible to client components. Only read in server actions and scripts. Correct.

- **`server-only` guard on DAL and email modules:** Both `src/lib/dal.ts` and `src/lib/email/send-verification.ts` have `import "server-only"` as their first statement. Correct.

- **`processedWebhookEvents` unique constraint:** Schema defines a named `unique()` constraint on `id`. The test in `tests/db/schema.test.ts` verifies both the constraint name and (integration) that a duplicate insert is rejected. Correct.

- **`orderStatusEnum` values:** All 8 canonical values present in the correct order as required by the ROADMAP. Correct.

- **Verification token security:** Token is `crypto.randomUUID()` (128 bits of entropy). Expiry is 24h. Token is deleted on both success and expiry rejection. Single-use enforced. Correct.

- **argon2id hashing:** `argon2.hash(password, { type: argon2.argon2id })` correctly specifies the argon2id variant. Never logs or returns the plaintext password. Correct.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
