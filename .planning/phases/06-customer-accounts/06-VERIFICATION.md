---
phase: 06-customer-accounts
verified: 2026-07-11T20:15:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
human_verification:
  - test: "In-page dual-auth redirect UX: log out, visit /account/orders directly, confirm redirect to /account/login?callbackUrl=/account/orders; log back in, confirm the history page then renders."
    expected: "Unauthenticated visit redirects to login (proxy.ts layer 1); after login, the original page is reachable and lists orders."
    why_human: "Requires a live browser session with real cookies/redirect chain — not verifiable via grep/unit tests, though the underlying verifySession()/proxy logic is unit- and pattern-verified."
  - test: "Post-purchase register-to-claim end-to-end: place a guest order, use the post-purchase 'create an account' offer (orderToken in URL), register, then check /account/orders shows the just-placed order."
    expected: "The guest order appears in the new account's order history immediately after registration."
    why_human: "Requires a live checkout + browser session to exercise the full order→register→claim→list round trip; the claim logic itself (guarded UPDATE, IDOR-safe queries) is covered by 16 passing integration tests against a real Postgres branch."
---

# Phase 6: Customer Accounts Verification Report

**Phase Goal:** Repeat buyers get value from an account — viewing their past orders — without accounts ever being on the critical path to a first sale.
**Verified:** 2026-07-11T20:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `listOrdersForUser(userId)` returns only that user's orders, newest first, with item counts | VERIFIED | `src/lib/orders/queries.ts:95-129` — `where(eq(orders.userId, userId))`, `orderBy(desc(orders.createdAt))`, itemCount via grouped subquery. Live-run test `tests/orders/user-queries.test.ts` (5 cases) passed. |
| 2 | `listOrdersForUser` returns `[]` for a user with no orders (D-02 empty state) | VERIFIED | Same file; empty-state test passed; `src/app/account/orders/page.tsx` renders `EmptyOrdersState` when `orders.length === 0` with "No orders yet" + "Browse products" link to `/`. |
| 3 | `getOrderForUser` returns the full order (with items) only when owned by caller | VERIFIED | `queries.ts:79-86` — `and(eq(orders.id, orderId), eq(orders.userId, userId))` in SQL WHERE, `with: { items: true }`. |
| 4 | `getOrderForUser` returns `null` for an order owned by a DIFFERENT user (IDOR — D-04) | VERIFIED | Ownership filter lives in SQL WHERE (never post-fetch check). Test `"IDOR: returns null for an order owned by a DIFFERENT user"` in `tests/orders/user-queries.test.ts:123` passed live. |
| 5 | `getOrderForUser` returns `null` for a nonexistent id (same path as wrong-owner) | VERIFIED | `return order ?? null` — single return path, no branching on existence vs ownership. Nonexistent-id test passed live. |
| 6 | `register()` with a valid unclaimed orderToken links that order to the new user | VERIFIED | `src/lib/actions/auth.ts:95-105` — guarded `UPDATE ... WHERE guestToken = ? AND userId IS NULL`. Test `"claims the guest order..."` (`tests/auth/register.test.ts:270`) passed live. |
| 7 | `register()` with an already-claimed orderToken does NOT reassign and still succeeds | VERIFIED | `isNull(orders.userId)` guard prevents 0-row-affecting reassignment. Test `"does not reassign..."` (`register.test.ts:298`) passed live. |
| 8 | `register()` with a missing/garbage orderToken still returns `{ success: true }` | VERIFIED | try/catch around the UPDATE, never rethrows; 0-row update is silent no-op. Test `"still succeeds when the orderToken is missing/garbage..."` (`register.test.ts:330`) passed live. |
| 9 (SC1) | Logged-in customer sees list of past orders, newest first, with status/date/items/total | VERIFIED | `src/app/account/orders/page.tsx` + `OrderHistoryCard.tsx` render reference, absolute date, `OrderStatusBadge`, item count, `formatNGN(totalKobo)` for each row from `listOrdersForUser(session.id)`. |
| 10 (SC2) | Order detail shows line items, variant labels, shipping address, and final total as captured at purchase — never recomputed | VERIFIED | `src/app/account/orders/[id]/page.tsx` renders `OrderSummaryLines`/`ShippingAddressBlock` directly from `order.items`/`order.subtotalKobo`/`order.shippingKobo`/`order.totalKobo` (the DB snapshot) — no arithmetic/recompute anywhere in the page or the two shared components (both read-only, pure display, `formatNGN` only). |
| 11 | `/account/orders/[id]` renders an IDENTICAL styled "Order not found" card for missing OR not-owned | VERIFIED | Single `if (!order) return <OrderNotFound />` branch — one code path for both cases (grep confirms zero active `notFound(` calls; the page never distinguishes the two null causes). |
| 12 (SC3) | Order-history surface protected by proxy.ts redirect AND in-page verifySession() | VERIFIED | `src/proxy.ts:24-27` — `isAccountRoute` matches `/account` (exact), `/account/orders*`, `/account/settings*`, redirects unauthenticated users to login. All three account pages (`page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx`) call `verifySession()` as the first statement inside their Suspense-wrapped async content — independent, in-page check. |
| 13 | `/account` shows signed-in email, Sign out, link to history (D-07) | VERIFIED | `src/app/account/page.tsx` — `session.email` rendered, `<form action={logout}>` Sign out button, `<Link href="/account/orders">`. |
| 14 (AUTH-04) | Requirement AUTH-04 delivered by real, tested code | VERIFIED (code) / traceability doc stale | Fully implemented per truths 1-13 above. `.planning/REQUIREMENTS.md:15,112` still shows AUTH-04 as `- [ ] Pending` — traceability table was not updated per CLAUDE.md's "mark requirements complete" instruction. Flagged in Anti-Patterns/Notes below (process gap, not a functional gap). |

**Score:** 14/14 truths verified (13 fully clean; 1 flags a stale doc-tracking issue, not a code gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/orders/queries.ts` | `getOrderForUser` + `listOrdersForUser`, IDOR-scoped | VERIFIED | Both exported; ownership in SQL WHERE; read and confirmed line-by-line. |
| `src/lib/actions/auth.ts` | `register()` guest-order claim | VERIFIED | `isNull(orders.userId)` guard present; signature unchanged (`register(formData: FormData)`); no pre-check read. |
| `src/components/auth/RegisterForm.tsx` | optional `orderToken` prop → hidden field | VERIFIED | `orderToken?: string` prop; `{orderToken && <input type="hidden" name="orderToken" ...>}`. |
| `src/app/(auth)/account/register/page.tsx` | async searchParams → orderToken thread-through | VERIFIED | `await searchParams` inside Suspense-wrapped `RegisterContent`; threads to `RegisterForm`. |
| `tests/orders/user-queries.test.ts` | 5 query cases incl. IDOR + nonexistent | VERIFIED | File exists, 6 `it.skipIf` gates, `IDOR` case present, all pass live (ran this session). |
| `tests/auth/register.test.ts` | 3 new claim cases + truncateOrderTables wiring | VERIFIED | All 3 named cases present + `truncateOrderTables` imported/called; all pass live. |
| `src/app/account/page.tsx` | Minimal landing (email + logout + history link) | VERIFIED | Matches spec exactly. |
| `src/app/account/orders/page.tsx` | Order-history list + empty state | VERIFIED | `listOrdersForUser(session.id)`, empty-state card, verifySession-first-inside-Suspense preserved. |
| `src/app/account/orders/[id]/page.tsx` | IDOR-safe detail page | VERIFIED | `getOrderForUser(session.id, id)`, identical 404 card, verbatim reuse of shared components. |
| `src/components/order/OrderHistoryCard.tsx` | Whole-card link row | VERIFIED | Exported, whole-card `<Link href="/account/orders/${order.id}">`, absolute date, `formatNGN`, `OrderStatusBadge`. |
| `src/proxy.ts` | `isAccountRoute` covers bare `/account` | VERIFIED | `path === "/account"` exact-match added alongside the `startsWith` variants for `/orders`/`/settings`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `queries.ts getOrderForUser` | orders table | `and(eq(orders.id,...), eq(orders.userId,...))` in WHERE | WIRED | Confirmed in source; test-verified via IDOR + nonexistent cases. |
| `auth.ts register()` | orders table | guarded UPDATE `WHERE guestToken=? AND userId IS NULL` | WIRED | Confirmed in source; test-verified via claim/no-reassign/garbage-token cases. |
| `account/orders/page.tsx` | `listOrdersForUser(session.id)` | verifySession() then user-scoped query inside Suspense | WIRED | `session.id` passed straight through in the same async scope, no caching. |
| `account/orders/[id]/page.tsx` | `getOrderForUser(session.id, id)` | verifySession() + await params, null → styled 404 | WIRED | Confirmed; single branch handles both null causes identically. |
| `OrderHistoryCard.tsx` | `/account/orders/[id]` | whole-card `<Link href="/account/orders/${order.id}">` | WIRED | Confirmed. |
| `proxy.ts` | all `/account*` pages | `isAccountRoute` redirect | WIRED | Exact-match `/account` + `startsWith` for sub-routes; auth routes (`/account/login`, `/account/register`) explicitly excluded. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `account/orders/page.tsx` | `orders` | `listOrdersForUser(session.id)` → real Drizzle query against `orders`/`orderItems` tables, no static fallback | Yes | FLOWING |
| `account/orders/[id]/page.tsx` | `order` | `getOrderForUser(session.id, id)` → real Drizzle `findFirst` with `items` relation | Yes | FLOWING |
| `OrderSummaryLines`/`ShippingAddressBlock` (reused) | props | Passed directly from `order.*` (DB snapshot fields: `subtotalKobo`, `shippingKobo`, `totalKobo`, `items[].lineTotalKobo`) | Yes, no recompute | FLOWING |
| `account/page.tsx` | `session.email` | `verifySession()` → real Auth.js session | Yes | FLOWING |

No hardcoded-empty props or static JSON fallbacks found in any of the four pages/components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| user-queries + register claim tests run live against TEST_DATABASE_URL | `npx vitest run tests/orders/user-queries.test.ts tests/auth/register.test.ts` | 2 files, 16/16 tests passed (80s) | PASS |
| TypeScript compiles clean across all touched files | `npx tsc --noEmit` | No output (clean) | PASS |
| No stray TODO/FIXME/placeholder in phase files | grep across all 7 phase-modified/created files | No matches | PASS |
| Git commits referenced in SUMMARYs exist and match described content | `git show --stat` on 5 commit hashes | All 5 present, messages match SUMMARY claims | PASS |

Full ~10-min suite (34 files / 348 tests) was already confirmed green earlier this session per the task brief; not re-run in full here (targeted re-run above is sufficient corroboration and shows no regression in the two files this phase touched for tests).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AUTH-04 | 06-01, 06-02 | Logged-in user can view their order history | SATISFIED (code) | All artifacts/truths above. NOTE: `.planning/REQUIREMENTS.md` traceability table (line 15, 112) still reads `- [ ] Pending` — this is a documentation bookkeeping gap, not a functional one. Recommend updating REQUIREMENTS.md to mark AUTH-04 complete before closing the phase, per CLAUDE.md's explicit instruction ("Mark requirements complete in REQUIREMENTS.md traceability as phases finish"). |

No orphaned requirements found for Phase 6 in REQUIREMENTS.md beyond AUTH-04.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 15, 112 | AUTH-04 still marked `- [ ] Pending` / "Pending" despite code being complete and tested | Info | Documentation-only; does not affect the running application. Should be updated before the phase is considered administratively closed. |

No blocker or warning-level code anti-patterns found. No TODO/FIXME/placeholder/stub markers in any of the 7 phase-touched source files. No hardcoded-empty data flowing to render paths.

### Human Verification Required

### 1. In-page dual-auth redirect UX

**Test:** Log out, then directly navigate to `/account/orders` (and `/account`, `/account/orders/<some-id>`) in a browser.
**Expected:** Each redirects to `/account/login?callbackUrl=<path>` (proxy.ts layer 1); after logging back in, the originally requested page renders correctly.
**Why human:** Requires a live browser session with real cookies and the Next.js redirect chain — grep/unit tests confirm the logic (`isAccountRoute` matching, `verifySession()` placement) but not the end-to-end browser round trip.

### 2. Post-purchase register-to-claim end-to-end

**Test:** Place a guest order through checkout, use the post-purchase "create an account" offer link (which carries `?orderToken=...`), complete registration, then visit `/account/orders`.
**Expected:** The just-placed guest order appears in the new account's order history immediately.
**Why human:** Requires a full live checkout + registration browser flow. The claim logic itself (guarded UPDATE, ownership guard, best-effort try/catch) is fully covered by 16 passing integration tests against a real Postgres test branch, but the end-to-end user journey through the actual checkout UI has not been exercised in this verification pass.

### Gaps Summary

No functional gaps found. All 3 ROADMAP success criteria and all 14 derived must-have truths are backed by real, tested, wired code — verified by direct source reading (not SUMMARY claims) and a live re-run of the 16 phase-specific tests (all passing against `TEST_DATABASE_URL`). The IDOR security core (T-06-01/T-06-05) is genuinely enforced in the SQL WHERE clause, not a post-fetch check, and is test-covered for both the "different owner" and "nonexistent id" cases with an identical `null` return and an identical styled 404 card at the UI layer. The guest-order claim (D-06) is guarded, best-effort, and does not alter `register()`'s signature.

Two items require a live browser session and are routed to human verification rather than treated as gaps, since the underlying logic backing them is independently unit/integration-tested. One minor documentation-tracking issue (REQUIREMENTS.md AUTH-04 still marked pending) is noted — recommend a one-line update before considering the phase fully closed, but it does not block progression since it is a bookkeeping artifact, not a code deficiency.

---

*Verified: 2026-07-11T20:15:00Z*
*Verifier: Claude (gsd-verifier)*
