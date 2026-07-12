---
status: pending
phase: 08-admin-managed-payment-credentials
source: [08-09-PLAN.md]
started: 2026-07-12
updated: 2026-07-12
---

## Current Test

[awaiting human testing — live browser round-trip of the write-only credential UI, Task 3
of 08-09-PLAN.md's checkpoint. All code is implemented, tsc/build/full-suite green; this is
the one step that requires a real admin browser session and cannot be automated by the
executor.]

## Tests

### 1. Existing "Payment methods" card unchanged
expected: Log in as an admin, visit `/admin/settings`. The existing "Payment methods" toggle
card (Stripe/PayPal/Bank transfer) still renders unchanged above the new "Gateway credentials"
card, with the same toggle behavior as before.
result: [pending]

### 2. Write-only secret round-trip (Paystack `secret_key`)
expected: Expand the Paystack card. Enter a test secret key (a real Paystack TEST secret key,
or any string if just checking the write-only mechanic) into the `secret_key` field and click
"Save Paystack credentials". The button shows "Saving…" then briefly "Saved". Reload the page
and re-expand the Paystack card — `secret_key` now shows "Configured ••••" + a
"Last updated just now by {your email}" caption, NOT the value you typed.
result: [pending]

### 3. DevTools no-leak check
expected: With DevTools open (Network / Elements panels), search the page HTML and any RSC
payload for any substring of the secret key entered in Test 2 — it does NOT appear anywhere
in the response.
result: [pending]

### 4. Replace / Cancel flow preserves the stored value
expected: Click "Replace" on the masked `secret_key` field — it becomes an empty, focused
password input with a "Cancel" link. Click Cancel — it reverts to the masked display without
submitting anything. Reload and confirm the "Last updated" timestamp on `secret_key` is
unchanged (nothing was submitted).
result: [pending]

### 5. Test connection (Stripe / Paystack / Flutterwave only)
expected: If a real Paystack TEST secret key is available, click "Test connection" on the
Paystack card — it shows "Testing…" then either a green "Connected" badge or a red
"Test failed" badge, and the Save button remains usable regardless of the test result.
result: [pending]

### 6. Test-connection applicability per gateway
expected: Expand the Interswitch card — it shows a static "Saved — not verifiable" pill
instead of a Test connection button. Expand the PayPal card — neither a Test button nor a
"not verifiable" pill appears in its footer.
result: [pending]

### 7. Empty-submit preserves untouched secret (D-04)
expected: On the Paystack card, leave `secret_key` masked (do not click Replace), but change
and save a different (public) field on the same card. Reload and confirm `secret_key` is
STILL "Configured" with the ORIGINAL "Last updated" timestamp unchanged — proving an
untouched masked field is never overwritten with an empty value.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

_None — all 7 items are the live-browser go-live checks documented in 08-09-PLAN.md's
`checkpoint:human-verify` task, which cannot be automated by the executor (real admin
session + DevTools inspection required). All code-level acceptance criteria for Plan 08-09
are verified: `npx tsc --noEmit` clean, `npx next build --webpack` clean (`/admin/settings`
in the route list), and the full test suite green. Run these 7 checks once a live dev/admin
session is available, then mark this file's status `complete` and re-run `/gsd-verify-work 8`._
