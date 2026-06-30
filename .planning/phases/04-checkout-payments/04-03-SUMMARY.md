---
phase: 04-checkout-payments
plan: "03"
subsystem: actions/checkout
tags: [checkout, server-actions, stripe, bank-transfer, orders, tdd, security]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [createBankTransferOrder, createStripePaymentIntent, CheckoutInput, checkout-server-actions]
  affects: [04-04, 04-05, 04-06]
tech_stack:
  added: []
  patterns:
    - server-action-use-server-directive
    - zod-safeParse-guard
    - db-batch-atomic-insert
    - server-side-total-recompute
    - payment-method-toggle-gate
    - tdd-red-green
key_files:
  created:
    - src/lib/actions/checkout.ts
    - tests/checkout/actions.test.ts (rewritten for correct vi.mock top-level + vi.mocked override pattern)
decisions:
  - buildOrderContext helper extracts shared logic (validation, session, cart recompute, ID gen) used by both actions
  - db.batch used for order + order_items atomic insert (neon-http; db.transaction not available)
  - Test mock for getCart is top-level vi.mock + vi.mocked(getCart).mockResolvedValue per test (vi.doMock inside test body does not work with cached modules)
  - DB tests seed unique slugs/emails per test using random UUID slices to avoid duplicate key errors across afterEach truncation boundaries
  - truncateAuthTables not called in afterEach — users table cleaned via direct db.delete to avoid cascade side effects
  - TypeScript: buildOrderContext return type explicitly declared as Promise<{error:string}|OrderContext> to satisfy discriminated union narrowing
metrics:
  duration: "~22 minutes"
  completed: "2026-06-30T08:20:41Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 4 Plan 03: Checkout Server Actions Summary

**One-liner:** Two Server Actions — `createBankTransferOrder` (awaiting_bank_transfer, bank instructions email) and `createStripePaymentIntent` (pending_payment, Stripe PI in kobo NGN) — with server-side total recompute, Zod NG address validation, payment toggle enforcement, and 15 passing tests.

## What Was Built

### src/lib/actions/checkout.ts

`"use server"` + `import "server-only"` at top. Security contract block mirrors `cart.ts` pattern.

**Zod schemas:**
- `NG_STATES` constant tuple of 36 states + FCT (Abuja) — closed enum prevents injection (T-04-14)
- `AddressSchema`: fullName, phone (min 7), street, city, state (enum), optional landmark
- `CheckoutSchema`: email + address
- Exported types: `CheckoutInput`, `BankTransferResult`, `StripeIntentResult`

**Private `buildOrderContext(input)` helper:**
1. `CheckoutSchema.safeParse` → `{ error }` on failure (T-04-14)
2. `const session = await auth()` → `userId = session?.user?.id ?? null` (CHKT-01); `customerEmail = session?.user?.email ?? parsed.data.email` (D-02)
3. `const cart = await getCart()` → empty cart or OOS check → `{ error }` (server-side, never client)
4. `computeOrderTotal({ subtotalKobo: cart.subtotalKobo })` (CHKT-03/04 — T-04-10, never client amount)
5. `crypto.randomUUID()`, `generateGuestToken()`, `await generateUniqueOrderRef()`
6. Maps `cart.items` to order_item snapshot rows (price, productName, variantLabel, lineTotalKobo — all from DB hydrated cart)

**`createBankTransferOrder`:**
- First statement: `isPaymentMethodEnabled("bank_transfer")` → `{ error }` if off (PAY-04, D-13, T-04-11)
- `db.batch([insert orders, insert orderItems])` — status hardcoded `"awaiting_bank_transfer"` (D-11, Pitfall 8, T-04-13)
- NO variant.stock modification (D-09)
- `await sendBankTransferInstructionsEmail(...)` — synchronous; propagates on failure (ORD-02)
- `revalidatePath("/", "layout")`
- Returns `{ guestToken }`

**`createStripePaymentIntent`:**
- First statement: `isPaymentMethodEnabled("stripe")` → `{ error }` if off (PAY-04, T-04-11)
- `db.batch([insert orders, insert orderItems])` — status `"pending_payment"`
- NO variant.stock modification (D-09)
- `stripe.paymentIntents.create({ amount: totals.totalKobo, currency: "ngn", automatic_payment_methods: { enabled: true }, metadata: { orderId, reference } })` — amount is server-computed kobo total (T-04-10, A1)
- Updates order with `stripePaymentIntentId` via `db.update`
- `revalidatePath("/", "layout")`
- Returns `{ clientSecret: paymentIntent.client_secret!, guestToken }`

### tests/checkout/actions.test.ts

15 tests total: 10 pure unit tests (always run without DB) + 5 DB-gated integration tests.

**Top-level vi.mock setup (Pattern 14):** `server-only`, `next/headers`, `next/cache`, `@/lib/auth`, `@/lib/email/send-bank-transfer-instructions`, `@/lib/payments/stripe`, `@/lib/cart/queries`.

**Per-test override:** `vi.mocked(getCart).mockResolvedValue(...)` and `vi.mocked(auth).mockResolvedValue(...)` override defaults set in `beforeEach`.

**Pure unit tests:** toggle disabled → `{ error }`; missing credentials → `{ error }`; invalid state "Narnia" → `{ error }`; malformed email → `{ error }`; empty cart → `{ error }`; OOS cart → `{ error }`.

**DB integration tests:**
- `createBankTransferOrder`: verifies `status === "awaiting_bank_transfer"`, `userId === null`, `customerEmail` from form, `totalKobo = subtotal + 200_000`, order_items snapshot, email called once, variant.stock unchanged
- Session test: `userId === session.user.id`, `customerEmail === session.user.email` (D-02)
- Toggle off: zero order rows in DB
- Invalid address: zero order rows in DB
- `createStripePaymentIntent`: `status === "pending_payment"`, `stripePaymentIntentId === "pi_test_123"`, Stripe called with `amount: 10_200_000, currency: "ngn"`, stock unchanged

## Commits

| Hash | Message |
|------|---------|
| `72e0315` | test(04-03): add failing tests for createBankTransferOrder + createStripePaymentIntent |
| `d5a9e2f` | feat(04-03): implement createBankTransferOrder + createStripePaymentIntent Server Actions |

## Test Results

- `tests/checkout/actions.test.ts` — 15/15 passing (10 pure unit, 5 DB-gated)
- Full suite: 202/204 pass (2 failing in `tests/auth/session.test.ts` are a pre-existing parallel-run DB state issue — pass in isolation; not caused by this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript discriminated union narrowing on buildOrderContext return type**
- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** TypeScript couldn't narrow `{ error: string } | OrderContext` because the helper's return type was inferred as a wide union. The callers' `if ("error" in ctx) return ctx` narrowing failed.
- **Fix:** Explicitly typed `buildOrderContext` as `Promise<{ error: string } | OrderContext>` with a named `OrderContext` type alias.
- **Files modified:** `src/lib/actions/checkout.ts`
- **Commit:** `d5a9e2f`

**2. [Rule 1 - Bug] vi.doMock inside test body doesn't work with cached modules**
- **Found during:** Task 2 (first test run with DB — FK violation on order_item insert)
- **Issue:** Using `vi.doMock("@/lib/cart/queries", ...)` inside DB integration tests had no effect because the module was already cached by earlier imports. The production `getCart()` tried to read a real cookie, returned empty items, causing the cart empty error — not the seeded variant ID.
- **Fix:** Moved `vi.mock("@/lib/cart/queries", ...)` to top-level (hoisted before imports), then override per test via `vi.mocked(getCart).mockResolvedValue(...)` in `beforeEach`/per-test.
- **Files modified:** `tests/checkout/actions.test.ts`
- **Commit:** `d5a9e2f`

**3. [Rule 1 - Bug] Duplicate user email on second DB test run**
- **Found during:** Task 2 (second DB test — "session user" test)
- **Issue:** `truncateOrderTables()` and `truncateCatalogTables()` don't truncate `user` table; the second test re-inserted `session@example.com` which already existed from the first run.
- **Fix:** Added `db.delete(schema.users)` in `afterEach` cleanup; also made test user emails unique using a UUID slice suffix so they can't collide across parallel afterEach cycles.
- **Files modified:** `tests/checkout/actions.test.ts`
- **Commit:** `d5a9e2f`

## Threat Model Compliance

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-04-10 (PaymentIntent amount tampering) | Mitigated | `amount: totals.totalKobo` where totals = `computeOrderTotal(getCart().subtotalKobo)` — no client value used |
| T-04-11 (disabled method bypass) | Mitigated | `isPaymentMethodEnabled(...)` is the literal first statement of each action; returns `{ error }` before any DB work |
| T-04-12 (order IDOR/spoofing) | Mitigated | `userId = session?.user?.id ?? null` — auth() session only; `guestToken` is 64-char hex random |
| T-04-13 (bank order not marked paid) | Mitigated | `status: "awaiting_bank_transfer"` hardcoded; stock not touched (D-09) |
| T-04-14 (input injection) | Mitigated | `CheckoutSchema.safeParse(input)` validates email + NG state enum + all required fields before any DB write |

## Known Stubs

None — this plan creates server-side business logic with no UI surface.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/lib/actions/checkout.ts` exists | FOUND |
| `tests/checkout/actions.test.ts` exists | FOUND |
| `grep createBankTransferOrder src/lib/actions/checkout.ts` | FOUND |
| `grep createStripePaymentIntent src/lib/actions/checkout.ts` | FOUND |
| `grep "awaiting_bank_transfer" src/lib/actions/checkout.ts` | FOUND |
| `grep "pending_payment" src/lib/actions/checkout.ts` | FOUND |
| `grep 'currency: "ngn"' src/lib/actions/checkout.ts` | FOUND |
| `grep "isPaymentMethodEnabled" count >= 2` | 4 occurrences |
| `grep "stock = stock" src/lib/actions/checkout.ts` returns 0 | CONFIRMED (no stock decrement) |
| Commit `72e0315` exists | FOUND |
| Commit `d5a9e2f` exists | FOUND |
| 15 tests pass | PASSED |
| `npx tsc --noEmit` exits 0 | PASSED |
