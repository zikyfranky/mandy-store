# 09-04 Summary — Public reset-password page (ADMN-09)

**Status:** COMPLETE — 2026-07-12 (executed inline)

## What was built
- **`src/app/(auth)/reset-password/page.tsx`** — Server Component mirroring `verify-email/page.tsx`; awaits `searchParams` (Next.js 16); missing `token`/`email` → "Invalid reset link" card + sign-in link; otherwise renders `<ResetPasswordForm>`. Does **not** call `resetPassword` server-side (token consumed only on submit — T-09-03). Inherits the `(auth)` centered-card layout.
- **`src/app/(auth)/reset-password/ResetPasswordForm.tsx`** — `"use client"`. New-password + confirm fields (`type="password"` `minLength={8}`), client-side match check, `useTransition` submit → `resetPassword({email,token,password})`. Displays the action's generic error verbatim in `role="alert"` (no enumeration). On success shows "Password updated" + sign-in link.

## Verification
- `npx next build --webpack` → Compiled successfully; `/reset-password` present as PPR route.
- Grep gates: `"use client"` ✓; `role="alert"` ✓; page has 0 `resetPassword` refs (consume-on-submit only) ✓; `type="password"` ✓.

## Notes
- Live email deliverability + browser click-through is the go-live human-verify item in 09-05.
