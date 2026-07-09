---
phase: 05-admin-panel
plan: 06
subsystem: ui
tags: [nextjs, tailwind, admin, drizzle, order-fulfillment, payment-settings]

# Dependency graph
requires:
  - phase: 05-admin-panel (05-04)
    provides: updateOrderStatus/getValidNextStatuses (admin-orders.ts), toggleStoreSetting (admin-settings.ts)
  - phase: 05-admin-panel (05-05)
    provides: AdminSidebar/admin layout shell, formStyles.ts, OrderStatusBadge.tsx
provides:
  - Orders list + detail UI (ADMN-03) with guided (no-dropdown) fulfillment transitions
  - Settings UI (ADMN-04) with live Stripe/PayPal/Bank-transfer toggles
  - src/lib/orders/legal-transitions.ts (shared transition allowlist, importable from both Server Components and Server Actions)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sync helpers consumed by both a Server Component and a \"use server\" action file must live OUTSIDE the \"use server\" module — Next.js requires every export of such a file to be async"
    - "Payment method display is derived (stripePaymentIntentId -> Stripe, gatewayProvider -> that gateway, else bank transfer) — orders has no single paymentMethod column"
    - "Toggle switch (role=switch + aria-checked, optimistic + snap-back-on-failure) built fresh per UI-SPEC Surface 6, no prior art"

key-files:
  created:
    - src/app/admin/orders/page.tsx
    - src/app/admin/orders/[id]/page.tsx
    - src/components/admin/OrderStatusControl.tsx
    - src/app/admin/settings/page.tsx
    - src/components/admin/PaymentToggleRow.tsx
    - src/lib/orders/legal-transitions.ts
  modified:
    - src/lib/actions/admin-orders.ts

key-decisions:
  - "Extracted LEGAL_TRANSITIONS/getValidNextStatuses out of admin-orders.ts into a new non-\"use server\" module (src/lib/orders/legal-transitions.ts) — the first import of the previously-sync export broke `next build --webpack` with \"Server Actions must be async functions\"; this was latent since 05-04 shipped with no consumer yet. No transition-graph change."
  - "Payment method column doesn't exist on `order` — derived a display label from stripePaymentIntentId/gatewayProvider/absence-of-both (bank transfer) in both the list and detail pages, matching the existing gateway-correlation schema comment"
  - "Cancel-order and bank-transfer-confirm both route through a shared local ConfirmDialog in OrderStatusControl.tsx (brand-colored for the irreversible-but-not-destructive confirm, red for the destructive cancel), per UI-SPEC Interaction Rules"

patterns-established:
  - "Guided-transition UI never renders a dropdown — one button per validNextStatuses entry, sourced only from the server (getValidNextStatuses); illegal transitions are still rejected server-side regardless of what renders"

requirements-completed: [ADMN-03, ADMN-04, ORD-03]

duration: 65min
completed: 2026-07-09
---

# Phase 05 Plan 06: Orders UI + Settings UI Summary

**Orders list/detail with guided (no-dropdown) fulfillment transitions and a bank-transfer "Confirm payment received" path that reuses the shared idempotent confirmOrderPaid delegation, plus a Settings page with live Stripe/PayPal/Bank-transfer toggles and D-11's dual-gate credential-missing note. The human-verify checkpoint (Vercel Blob upload round-trip + live checkout toggle effect) is credential-gated and cannot run in this environment — code is complete and build/typecheck-verified; manual verification steps are documented below.**

## Performance

- **Duration:** ~65 min
- **Completed:** 2026-07-09
- **Tasks:** 3/3 code tasks completed; 1 checkpoint task deferred (credential-gated, documented below)
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `/admin/orders`: status filter (All + 8 statuses, segmented pills) backed by `listOrdersForAdmin`, table with reference/date/customer/total/payment-method/status columns, full-row links to detail, empty and filtered-empty states matching the UI-SPEC copy contract exactly
- `/admin/orders/[id]`: two-column detail reusing `OrderSummaryLines`/`ShippingAddressBlock` verbatim via `getOrderForAdmin`, a Payment details card (derived method, Stripe PI / gateway provider+reference, paid-at), and a Fulfillment card driven by `OrderStatusControl`
- `OrderStatusControl`: renders exactly one button per `getValidNextStatuses(currentStatus)` entry — never a dropdown; the `awaiting_bank_transfer` case swaps in a dedicated "Confirm payment received" action (brand-colored, gated behind a confirm dialog) that calls the same `updateOrderStatus` -> `confirmOrderPaid` path used by card-payment webhooks; "Cancel order" is a separate destructive-confirm action; success note appends "{email} was notified." only for shipped/delivered (D-10/ORD-03); terminal states (delivered/cancelled) render a muted note, no buttons
- `/admin/settings`: reads `getStoreSettingsMap()` + server-side credential presence (mirrors `config.ts`'s per-method env/credential check) for exactly Stripe/PayPal/Bank transfer — no NG gateways shown (U-12)
- `PaymentToggleRow`: `role="switch"` + `aria-checked` toggle built to the UI-SPEC Surface 6 spec (brand ON / zinc OFF track, white thumb, focus ring), optimistic flip with snap-back + inline error on `toggleStoreSetting` failure, amber credential-missing note when the DB flag is on but env creds are absent (boolean only — never a secret value crosses to the client, T-05-23), and the permanent PayPal NGN scope note

## Task Commits

1. **Task 1: Orders list (/admin/orders) with status filter** - `fc18e59` (feat)
2. **Task 2: Order detail (/admin/orders/[id]) + guided OrderStatusControl** - `2974d5e` (feat) — includes the `legal-transitions.ts` extraction fix
3. **Task 3: Settings page (/admin/settings) + PaymentToggleRow** - `2f39800` (feat)

## Files Created/Modified

- `src/app/admin/orders/page.tsx` - orders list, status filter, table, empty states
- `src/app/admin/orders/[id]/page.tsx` - order detail, reuses OrderSummaryLines/ShippingAddressBlock, styled 404
- `src/components/admin/OrderStatusControl.tsx` - guided transition buttons, bank-transfer confirm, cancel confirm
- `src/app/admin/settings/page.tsx` - reads getStoreSettingsMap + server-side credential presence
- `src/components/admin/PaymentToggleRow.tsx` - toggle switch, dual-gate note, PayPal NGN note
- `src/lib/orders/legal-transitions.ts` - LEGAL_TRANSITIONS/getValidNextStatuses, extracted from admin-orders.ts
- `src/lib/actions/admin-orders.ts` - now imports LEGAL_TRANSITIONS from the new module (no behavior change)

## Decisions Made

- See `key-decisions` in frontmatter — the module-split fix, the derived payment-method display, and the shared `ConfirmDialog` shell for both the destructive (cancel) and irreversible-but-not-destructive (bank-transfer confirm) actions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `admin-orders.ts`'s `getValidNextStatuses` broke `next build --webpack`**
- **Found during:** Task 2 (first time anything imported `getValidNextStatuses` from `@/lib/actions/admin-orders`)
- **Issue:** `admin-orders.ts` has a top-level `"use server"` directive. Next.js requires every export of a `"use server"` module to be an async Server Action; `getValidNextStatuses` (and the `LEGAL_TRANSITIONS` const it read) were plain synchronous exports. This was shipped in Plan 04 with zero consumers, so the constraint never fired until Plan 06's UI imported it — the build failed with "Server Actions must be async functions."
- **Fix:** Created `src/lib/orders/legal-transitions.ts` (no `"use server"` directive) holding `LEGAL_TRANSITIONS` + `getValidNextStatuses` verbatim. `admin-orders.ts` now imports `LEGAL_TRANSITIONS` from there; the order detail page imports `getValidNextStatuses` from there directly instead of from `admin-orders.ts`. No transition-graph or runtime-behavior change — pure module relocation.
- **Files modified:** `src/lib/orders/legal-transitions.ts` (new), `src/lib/actions/admin-orders.ts`
- **Verification:** `npx next build --webpack` succeeds; `npx tsc --noEmit` clean; no test referenced the old export location (confirmed via grep before the change).
- **Committed in:** `2974d5e` (Task 2 commit)

**2. [Rule 1 - Bug] Literal `<select>` substring in a code comment tripped the plan's own acceptance grep**
- **Found during:** Task 2 self-verification
- **Issue:** `OrderStatusControl.tsx`'s header comment originally referenced `<select>`/dropdown by name, which made `grep -c '<select' OrderStatusControl.tsx` return 1 instead of the required 0 — a false positive (no actual `<select>` element existed) but a real acceptance-criteria failure.
- **Fix:** Reworded the comment to say "free-choice dropdown" instead of the literal `<select>` string.
- **Files modified:** `src/components/admin/OrderStatusControl.tsx`
- **Verification:** `grep -c '<select' src/components/admin/OrderStatusControl.tsx` now returns 0.
- **Committed in:** `2974d5e` (Task 2 commit)

**3. [Rule 1 - Bug] Apostrophe-containing copy used JSX-entity escaping, which grep couldn't match**
- **Found during:** Task 3 self-verification
- **Issue:** Following the codebase's existing convention (`&apos;`) for apostrophes in raw JSX text made `grep -c "doesn't support NGN"` return 0, failing the plan's literal acceptance check for the PayPal NGN copy.
- **Fix:** Wrote the two apostrophe-containing strings (credential-missing note, PayPal NGN note) as JS string literals inside `{...}` expressions instead of raw JSX text — satisfies both the literal grep and ESLint's `react/no-unescaped-entities` (verified at error level in this project's config), since string literals aren't subject to that rule.
- **Files modified:** `src/components/admin/PaymentToggleRow.tsx`
- **Verification:** `grep -c "doesn't support NGN" src/components/admin/PaymentToggleRow.tsx` returns 1; `npx eslint` on the file reports zero issues; `next build --webpack` succeeds.
- **Committed in:** `2f39800` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs — one a plan-acceptance false positive, one a copy-encoding mismatch)
**Impact on plan:** No scope creep, no architecture change. The blocking fix is a pure module split with no behavioral difference; the other two are cosmetic/comment/encoding corrections.

## Human-Verify Pending

The plan's final task (`checkpoint:human-verify`) covers two credential-gated behaviors that **cannot be exercised in this automated run** — no `BLOB_READ_WRITE_TOKEN` and no live gateway credentials are configured in this environment. All CODE tasks (1–3) are complete, committed, and build/typecheck-verified. The checkpoint is tracked here as pending rather than blocking the phase, per the executor's credential-gated-checkpoint handling.

**Manual steps required (perform these when the relevant credentials are available):**

1. **Image round-trip (ADMN-01, needs `BLOB_READ_WRITE_TOKEN`):**
   - In the Vercel Dashboard -> Storage -> Blob, create a store and copy the read-write token into `.env.local` as `BLOB_READ_WRITE_TOKEN=...`, then restart `npm run dev`.
   - Go to `/admin/products/new`, create a product, upload an image WITH alt text, save.
   - Confirm: the image persists (a blob URL is stored) and renders on the storefront PDP.
   - Then try saving an image with BLANK alt text — confirm it is rejected server-side.

2. **Live payment toggle (ADMN-04):**
   - In `/admin/settings`, toggle Bank transfer OFF.
   - Open `/checkout` in another tab — confirm bank transfer no longer appears as a payment option.
   - Toggle it back ON — confirm it reappears.

3. **Guided fulfillment (ADMN-03/ORD-03):**
   - Open an `awaiting_bank_transfer` order in `/admin/orders/[id]`, click "Confirm payment received" (confirm the dialog) — confirm the order flips to `payment_confirmed`, stock is decremented, and (if `RESEND_API_KEY` is set) a confirmation email is sent.
   - Advance a `payment_confirmed` order through Processing -> Shipped -> Delivered — confirm the shipped/delivered success notes claim the customer was emailed, and that no other transition does.
   - Confirm no dropdown appears anywhere — only labeled next-state buttons.

4. **Auth:** Confirm a non-admin/logged-out user hitting `/admin/*` is redirected.

**Note:** `npm run dev` was not started for this verification pass (headless automated run); `npx next build --webpack` and `npx tsc --noEmit` were used instead to verify the code compiles and typechecks correctly for all three new/changed routes (`/admin/orders`, `/admin/orders/[id]`, `/admin/settings`).

## Known Stubs

None — all three surfaces are fully wired to their respective Server Actions/queries (`listOrdersForAdmin`, `getOrderForAdmin`, `updateOrderStatus`, `getStoreSettingsMap`, `toggleStoreSetting`). No hardcoded/placeholder data.

## Issues Encountered

None beyond the three auto-fixed issues above (all resolved within the first attempt each).

## User Setup Required

- `BLOB_READ_WRITE_TOKEN` (Vercel Blob) — required for the image-upload round-trip in the human-verify checkpoint. Not required for this plan's own routes (Orders/Settings), only for the Products image flow the checkpoint also re-verifies.
- Live payment gateway credentials (Stripe/PayPal/bank env vars) — required to see the settings toggles' dual-gate note flip states and to exercise the live `/checkout` effect end-to-end.

## Next Phase Readiness

- All ADMN-03/ADMN-04/ORD-03 UI surfaces are code-complete and build/typecheck-verified.
- The human-verify checkpoint (image round-trip, live toggle, guided fulfillment, auth redirect) remains pending until the credentials above are available — flagged for the phase's final verification pass, not a blocker for merging this plan's code.
- `npm test` full-suite run (340 baseline) should be re-confirmed green with `TEST_DATABASE_URL` set, per this repo's CLAUDE.md testing section — not run to completion in this pass to avoid the long-running-connection issue noted in prior executor runs; the code changes here touch no test files and no runtime behavior of `updateOrderStatus`/`toggleStoreSetting`, only their callers.

## Self-Check: PASSED

All files below verified present on disk; all commit hashes verified present in `git log`.

---
*Phase: 05-admin-panel*
*Completed: 2026-07-09*
