---
phase: 04-checkout-payments
plan: "06"
subsystem: order/confirmation-page,order/components,ui/CopyButton
tags: [order-confirmation, bank-transfer, polling, guest-access, post-purchase, server-component, client-island]
dependency_graph:
  requires: [04-01, 04-02, 04-03, 04-04, 04-05]
  provides: [order-confirmation-page, order-confirmed-view, bank-transfer-view, payment-processing-view, order-summary-lines, shipping-address-block, post-purchase-account-offer, copy-button]
  affects: []
tech_stack:
  added: []
  patterns:
    - server-component-async-params
    - client-island-polling
    - server-env-props-passthrough
    - suspense-split
    - copy-button-clipboard-api
key_files:
  created:
    - src/app/order/[token]/page.tsx
    - src/components/order/OrderConfirmedView.tsx
    - src/components/order/BankTransferView.tsx
    - src/components/order/PaymentProcessingView.tsx
    - src/components/order/OrderSummaryLines.tsx
    - src/components/order/ShippingAddressBlock.tsx
    - src/components/order/PostPurchaseAccountOffer.tsx
    - src/components/ui/CopyButton.tsx
  modified: []
decisions:
  - OrderConfirmedView receives orderUrl as a prop from the Server Component page (built from NEXT_PUBLIC_APP_URL + guestToken) — allows the "View this order" CopyButton to function without window.location in a Server Component
  - PaymentProcessingView receives confirmedView (pre-built JSX from page) as a prop — option (a) from plan — so it can swap to the Server Component confirmed markup without needing to re-fetch or duplicate the layout
  - CopyButton accepts optional className prop to allow both default text-link style and full-button styled usage in different contexts
  - BankTransferView is a Server Component (not "use client") — CopyButton embedded inside it is the client island; BankTransferView itself needs no client interactivity
  - Cart /checkout link was already wired in Plan 05 (not Plan 06) — no change required; confirmed in git log
metrics:
  duration: "~35 minutes"
  completed: "2026-06-30T12:15:00Z"
  tasks_completed: 2
  files_changed: 8
---

# Phase 4 Plan 06: Order Confirmation / Status Page Summary

**One-liner:** Guest order confirmation/status page at `/order/[token]` with three states (payment_confirmed success, awaiting_bank_transfer bank details, pending_payment polling interstitial), bank env read server-side only and passed as props, post-purchase account offer, copyable order reference, and reusable CopyButton.

## What Was Built

### src/app/order/[token]/page.tsx (CHKT-05, D-12, D-10, D-06, D-07)

Server Component with `generateMetadata` + Suspense shell. Async `OrderContent` resolves the 64-char hex token via `getOrderByToken`. On miss: renders the §8 styled "Order not found" card (not Next.js `notFound()` — styled card per plan spec). On hit: branches by `order.status`:

- `payment_confirmed` → `<OrderConfirmedView>` + OrderSummaryLines + ShippingAddressBlock + optional PostPurchaseAccountOffer
- `awaiting_bank_transfer` → `<BankTransferView>` + summary + address + offer; BANK_NAME/BANK_ACCOUNT_NUMBER/BANK_ACCOUNT_NAME read HERE (server-side; D-10)
- `pending_payment` → `<PaymentProcessingView confirmedView={...} />` with pre-built confirmed JSX as prop
- `payment_failed` / other → minimal "Payment could not be processed" card with link to /checkout

No `'use cache'` directive — order status is always-fresh (D-06, D-07, RESEARCH Pitfall 2).

### src/components/ui/CopyButton.tsx

"use client" — generic clipboard copy button. `navigator.clipboard.writeText(value)` on click; `useState + setTimeout` 2s copied state. `aria-label` toggles between "Copy order reference" and "Order reference copied" (Accessibility Contract). Accepts optional `className` for different visual contexts.

### src/components/order/OrderSummaryLines.tsx

Server Component. Renders §7d read-only line items (photo placeholder icon since order snapshot has no imageUrl) + Subtotal/Shipping/Total via `formatNGN`. Props: `items[]`, `subtotalKobo`, `shippingKobo`, `totalKobo`.

### src/components/order/ShippingAddressBlock.tsx

Server Component. Renders §7e: name, phone, street, "city, state", optional landmark. Props: all order shipping fields.

### src/components/order/PostPurchaseAccountOffer.tsx

Server Component. Renders §7f offer card with `href={"/account/register?orderToken=" + token}` CTA. Only rendered when `order.userId === null` (guest). Phase 6 reads the `orderToken` param to link the order.

### src/components/order/OrderConfirmedView.tsx

Server Component. Renders §7a: CheckCircleIcon, "Order confirmed!" h1, "Payment received" green pill, body with first name + email, reference chip (font-mono), and CTAs. "Continue shopping" → `/products` (Link). "View this order" → CopyButton with `orderUrl` value and button styling.

### src/components/order/BankTransferView.tsx

Server Component (with embedded CopyButton client island). Renders §7b: BuildingLibraryIcon, "Complete your transfer" h1, amber "Awaiting bank transfer" pill, bank details card (bank name, account number font-mono, account name, transfer amount via `formatNGN`), reference row with `<CopyButton>` for narration copy. Bank details come from props — never from env inside this file (D-10, T-04-29).

### src/components/order/PaymentProcessingView.tsx

"use client". Renders §7c: ArrowPathIcon animate-spin, "Payment processing…" h1, indeterminate progress bar. `useEffect` with `setInterval` every 2000ms polling `/api/order/status/${token}`. On `payment_confirmed`: clears interval, sets opacity fade, renders `confirmedView` prop (pre-built Server Component JSX passed from page). On `payment_failed`: stops polling, renders error state. After 30s: shows fallback message with "Refresh this page" button. Cleans up interval+timeout on unmount. `aria-live="polite"` container for screen reader announcements.

## Commits

| Hash | Message |
|------|---------|
| `cb3466c` | feat(04-06): /order/[token] page + CopyButton + OrderSummaryLines + ShippingAddressBlock + PostPurchaseAccountOffer |
| `b89594e` | feat(04-06): OrderConfirmedView + BankTransferView + PaymentProcessingView (polling) |

## Verification Results

- `npx next build --webpack` exits 0 — `/order/[token]` (◐ Partial Prerender) appears in route table
- All acceptance criteria greps pass
- `grep -rl "BANK_ACCOUNT_NUMBER" src/components/order/` returns nothing (server-only gate confirmed)
- `npm test` — 203 tests pass; 7 failures are the pre-existing cross-file DB contamination issue (FK violations in `schema.test.ts` + `actions.test.ts` parallel runs), documented in Plans 04-02/03/04, not caused by Plan 06

## Deviations from Plan

### Implementation Choices

**1. [Plan Clarification] Cart /checkout CTA already wired — no change required**
- The plan specified rewiring the cart Checkout button from Phase-3 stub to `/checkout` as a task item
- STATE.md note confirmed: "Plan 04-05 complete: Fixed pre-existing build failures... Checkout CTA in cart upgraded stub → Link /checkout."
- The rewire was completed as part of Plan 05, not Plan 06. Confirmed by `grep -q '/checkout' src/app/cart/page.tsx` → exit 0 (line 104 has `href="/checkout"`)
- No action taken; task already done

**2. [Plan Design] CopyButton receives className prop for dual-context styling**
- Found during: Task 1 implementation
- The "View this order" CTA in OrderConfirmedView needs button-styled Copy behavior, while the reference copy in BankTransferView needs text-link styling
- Fix: Added optional `className` prop to CopyButton; default remains the text-link style
- Files modified: `src/components/ui/CopyButton.tsx`

**3. [Plan Design] BankTransferView kept as Server Component**
- The plan said `("use client" — needs CopyButton interactivity, or keep server and embed the client CopyButton)` — chose to keep Server with embedded CopyButton client island
- BankTransferView itself needs no client state; only the CopyButton child needs client interactivity
- This maintains the server-component-first pattern and avoids sending all the bank detail JSX over the wire as a client chunk

## Threat Model Compliance

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-04-28 (IDOR / order enumeration) | Mitigated | `getOrderByToken` — token-only lookup; unknown token → styled 404 card; no sequential ID in URL |
| T-04-29 (bank details exposure) | Mitigated | BANK_* env read only in `src/app/order/[token]/page.tsx`; `grep -rl "BANK_ACCOUNT_NUMBER" src/components/order/` returns nothing |
| T-04-30 (client marking paid) | Mitigated | Views are display-only; status comes from `getOrderByToken` and the status poll, both reflecting webhook-written values (D-06) |
| T-04-31 (account-link token reuse) | Accept | PostPurchaseAccountOffer passes orderToken as URL param; Phase 6 validates linkage. For Phase 4 the link is inert |

## Known Stubs

None — all components render live order data from the database via getOrderByToken.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced by this plan. The `/order/[token]` page uses the existing `getOrderByToken` query and `/api/order/status/[token]` endpoint (both created in Plans 02 and 04).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/app/order/[token]/page.tsx` exists | FOUND |
| `src/components/order/OrderConfirmedView.tsx` exists | FOUND |
| `src/components/order/BankTransferView.tsx` exists | FOUND |
| `src/components/order/PaymentProcessingView.tsx` exists | FOUND |
| `src/components/order/OrderSummaryLines.tsx` exists | FOUND |
| `src/components/order/ShippingAddressBlock.tsx` exists | FOUND |
| `src/components/order/PostPurchaseAccountOffer.tsx` exists | FOUND |
| `src/components/ui/CopyButton.tsx` exists | FOUND |
| `grep -q "getOrderByToken" src/app/order/[token]/page.tsx` | PASS |
| `grep -q "params: Promise" src/app/order/[token]/page.tsx` | PASS |
| `grep -q "process.env.BANK_ACCOUNT_NUMBER" src/app/order/[token]/page.tsx` | PASS |
| `grep -q "orderToken=" src/components/order/PostPurchaseAccountOffer.tsx` | PASS |
| `grep -q "navigator.clipboard.writeText" src/components/ui/CopyButton.tsx` | PASS |
| `grep -q "formatNGN" src/components/order/OrderSummaryLines.tsx` | PASS |
| `grep -q "/checkout" src/app/cart/page.tsx` | PASS |
| `grep -rl "BANK_ACCOUNT_NUMBER" src/components/order/` returns nothing | PASS |
| `grep -q "Order confirmed!" src/components/order/OrderConfirmedView.tsx` | PASS |
| `grep -q "Complete your transfer" src/components/order/BankTransferView.tsx` | PASS |
| `grep -q "CopyButton" src/components/order/BankTransferView.tsx` | PASS |
| `grep -q "formatNGN" src/components/order/BankTransferView.tsx` | PASS |
| `grep -q "/api/order/status/" src/components/order/PaymentProcessingView.tsx` | PASS |
| `grep -q "setInterval" src/components/order/PaymentProcessingView.tsx` | PASS |
| Commit `cb3466c` exists | FOUND |
| Commit `b89594e` exists | FOUND |
| `npx next build --webpack` exits 0 | PASSED |
| 203/210 tests pass (7 are pre-existing cross-file DB contamination) | PASSED |
