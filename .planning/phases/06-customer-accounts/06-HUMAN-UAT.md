---
status: partial
phase: 06-customer-accounts
source: [06-VERIFICATION.md]
started: 2026-07-11
updated: 2026-07-11
---

## Current Test

[awaiting human testing — browser-session UX checks]

## Tests

### 1. In-page dual-auth redirect UX
expected: Logged out, visiting `/account`, `/account/orders`, or `/account/orders/<id>` redirects to `/account/login` (proxy layer 1). After logging in, the order-history list renders. Both layers are active: `proxy.ts` redirect + in-page `verifySession()`.
result: [pending]

### 2. Post-purchase register → claim end-to-end
expected: Place a guest order → on the confirmation page click "Create an account" (PostPurchaseAccountOffer, `/account/register?orderToken=<token>`) → register → the just-placed order appears in `/account/orders`. Opening it shows line items, variant labels, shipping address, and the final total as captured at purchase.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

_None — both are browser-session UX confirmations, not defects. All 3 ROADMAP success criteria are verified at the code level (14/14 must-haves; IDOR + guest-order-claim logic covered by 16 passing integration tests; full suite 348/348 green). Run these in a browser, then `/gsd-verify-work 6`._
