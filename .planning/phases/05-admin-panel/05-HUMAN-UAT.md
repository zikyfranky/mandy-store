---
status: partial
phase: 05-admin-panel
source: [05-VERIFICATION.md]
started: 2026-07-09
updated: 2026-07-09
---

## Current Test

[awaiting human testing — credential-gated go-live checks]

## Tests

### 1. Vercel Blob product-image upload round-trip
expected: With `BLOB_READ_WRITE_TOKEN` set, in `/admin/products/new` (or edit) upload a product image with non-empty alt text → the image persists to Vercel Blob, the returned URL is saved on `product_image`, and the image renders on the storefront PDP. Submitting with empty/whitespace alt text is rejected server-side (not just the UI).
result: [pending]

### 2. Live payment-toggle → checkout visibility
expected: In `/admin/settings`, toggle a method (e.g. bank transfer) OFF → it immediately disappears from `/checkout`, and calling its Server Action/route directly is rejected (`isPaymentMethodEnabled` returns false). Toggle back ON (with env credentials present) → it reappears. A method whose DB flag is ON but env credentials are absent shows the "credentials missing" note and stays unavailable.

result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

_None — both items are credential-gated go-live checks, not defects. All 5 ROADMAP success criteria are verified at the code level (12/12 must-haves; full suite 340/340 green). Run these once `BLOB_READ_WRITE_TOKEN` and a live dev session are available, then `/gsd-verify-work 5`._
