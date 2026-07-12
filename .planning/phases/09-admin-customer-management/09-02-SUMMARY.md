# 09-02 Summary — Server core (ADMN-09, ADMN-10)

**Status:** COMPLETE — 2026-07-12 (executed inline)

## What was built
- **`src/emails/PasswordResetEmail.tsx`** — mirrors `VerificationEmail`; `{resetUrl}` prop, "Set new password" button, 1h-expiry footer.
- **`src/lib/email/send-password-reset.ts`** — `sendPasswordResetEmail(email, token)`, `import "server-only"`, null-safe `getResendClient()`, links to `/reset-password?token=…&email=…`.
- **`src/lib/actions/admin-customers.ts`** — three actions, all fail-closed:
  - `sendCustomerPasswordReset(userId)` — admin-gated (`verifyAdminSession()` first); deletes prior `pwreset_%` tokens (D-07.2); inserts `pwreset_${uuid}` @ +1h; best-effort email; returns `{success:true}` with **no token** (D-06).
  - `resetPassword({email,token,password})` — **public**; zod min(8); `pwreset_` prefix required (D-07.3); exact `(identifier,token)` match; expired→delete+generic error; argon2id rehash → update `passwordHash` → delete token (single-use) → **delete sessions by userId** (D-07.1). All failures share one generic message (D-07.6).
  - `updateCustomerRole(userId,newRole)` — admin-gated; zod enum; self-lockout guard (`userId===admin.id`); **atomic** last-admin demote guard (`… AND (SELECT COUNT(*) FROM "user" WHERE role='admin') > 1`, D-07.4); promote via plain update; `revalidatePath('/admin/customers')`.
- **`src/lib/actions/auth.ts`** — `verifyEmail` rejects `pwreset_`-prefixed tokens as its first statement (D-07.3); bare-UUID verify tokens unaffected.

## Verification
- `npx vitest run tests/actions/admin-customers.test.ts` → **15/15 pass** (was RED in 09-01).
- `npx vitest run tests/auth/verify-email.test.ts` → 6/6 pass (no regression).
- `npx next build --webpack` → Compiled successfully.

## Requirements
- ADMN-09 (secure admin-triggered reset) and ADMN-10 (guarded role change) server logic delivered. UI: 09-03 (admin) + 09-04 (public reset page).
