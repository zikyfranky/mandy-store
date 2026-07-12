# Phase 9 — Human UAT (Admin Customer Management)

**Status:** PENDING owner verification
**Bar:** credential/browser-gated go-live items only — the full automated suite + production build already pass in CI. Mirrors `05-HUMAN-UAT.md` / `08-HUMAN-UAT.md`.

Requirements covered: **ADMN-08** (view all customers), **ADMN-09** (admin-triggered password reset), **ADMN-10** (role promote/revoke).

---

## 1. Live password-reset email round-trip (ADMN-09) — requires `RESEND_API_KEY`

**Why manual:** needs a live Resend API key + a real inbox; not exercisable in CI (the seam is mocked in tests).

Steps:
1. Ensure `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL` are set in the environment.
2. Sign in as an admin and open **`/admin/customers`**.
3. For a **test customer** (not your own account), click **"Send password reset"**. Confirm the inline "Reset link sent" status appears.
4. Open the customer's inbox → the "Reset your password" email. Click **"Set new password"** (the link is `…/reset-password?token=pwreset_…&email=…`).
5. On **`/reset-password`**, enter a new password (≥ 8 chars) twice and submit. Confirm the "Password updated" panel with a **Sign in** link.
6. Sign in as that customer with the **new** password → succeeds.
7. Confirm the **old** password no longer works.
8. (Security spot-check) Click the same reset link again → it must be rejected ("Invalid or expired reset link"); the token is single-use.

**Expected:** exactly one live reset link per customer; admin never sees/sets the plaintext; the customer's other sessions are revoked on reset.

---

## 1b. Admin-set password (ADMN-11)

**Why manual:** browser interaction.

Steps:
1. On `/admin/customers`, click **"Set password"** for a test customer → a dialog appears.
2. Enter a new password (≥ 8 chars) twice → **Set password**. Confirm the "Password set" status.
3. Sign in as that customer with the admin-set password → succeeds; the old password no longer works.
4. Confirm any previously-issued reset link for that customer is now rejected (invalidated).

**Expected:** password set immediately, admin-gated (server-verified); target's sessions revoked (they must re-login), outstanding reset links invalidated.

---

## 2. Admin customers UI — visual + interaction (ADMN-08, ADMN-10)

**Why manual:** browser visual/interaction; not exercisable in CI.

Steps:
1. Open **`/admin/customers`**. Confirm the table shows **Name, Email, Role badge, Verified (✓/—), Joined date, Orders count, Actions** for each registered user, newest first.
2. Use the **search** box (name or email substring) → results filter; clear search restores the full list.
3. If > 24 customers exist, confirm **pagination** works (page 2, etc.).
4. Confirm the **Customers** entry appears in the admin sidebar (between Orders and Settings).
5. On a **test customer** row, click **"Make admin"** → a confirm dialog appears. Confirm → the row's role badge flips to **Admin**.
6. On that now-admin row, click **"Revoke admin"** → confirm → badge flips back to **Customer**.
7. On **your own** row, confirm the role toggle is **disabled** (hint: "You can't change your own role").
8. (Guard spot-check) With only one admin in the system, attempt to revoke that admin → the action is refused with "Cannot demote the last remaining admin".

**Expected:** list renders accurately; role changes persist and reflect immediately; self-lockout and last-admin guards hold (they are also enforced server-side and unit/integration-tested).

---

## Sign-off

- [ ] Item 1 — live reset email round-trip verified *(owner: "Resend can happen" — will verify with live key)*
- [ ] Item 1b — admin-set password verified (ADMN-11)
- [x] Item 2 — admin customers UI verified *(APPROVED by owner 2026-07-12)*

Reply **"approved"** once both are confirmed, or describe any issues found.
