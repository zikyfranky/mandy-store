---
phase: 3
slug: cart
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 03-RESEARCH.md §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (already configured) |
| **Config file** | `vitest.config.ts` — loads `.env.local`, `fileParallelism: false` (shared Neon) |
| **Quick run command** | `npx vitest run tests/cart/cart-logic.test.ts` (pure, no DB) |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | pure unit < 2s; full suite ~30s+ |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/cart/cart-logic.test.ts` (pure cart math — fast)
- **After every plan wave:** `npx vitest run tests/cart/` then `npx vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~2s for pure unit; ~30s full

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-* | 01 | 1 | CART-01/03, D-09 | cart/cart_item tables pushed; cart stores only variantId+qty (no price); Wave-0 cart tests + truncate helper | integration | `npm run db:push && npx vitest run tests/cart/` | ❌ W0 | ⬜ pending |
| 3-02-* | 02 | 2 | CART-01/02/03, D-06/10/11/12 | pure cart logic: parse/merge/hydrate/clamp/subtotal; server actions clamp to stock, recompute totals server-side | unit + integration | `npx vitest run tests/cart/cart-logic.test.ts && npx vitest run tests/cart/` | ❌ W0 | ⬜ pending |
| 3-03-* | 03 | 3 | CART-01/02, D-01..D-05/D-07/D-13/D-14 | drawer + /cart UI, header badge wired, Add-to-cart wired (indigo), stepper, remove, empty state | manual + build | `npx tsc --noEmit && npx next build --webpack` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/cart/logic.ts` — pure helpers (parseCartCookie, mergeCartItems, hydrateCart, clampToStock, subtotal) — prerequisite for unit tests
- [ ] `tests/cart/cart-logic.test.ts` — pure-function unit tests (CART-01/02/03, D-10/11/12, subtotal); no DB/cookies
- [ ] `tests/cart/cart-cookie.test.ts` — guest cookie round-trip integration (CART-03; httpOnly, 30d)
- [ ] `tests/cart/cart-db.test.ts` — DB cart integration (CART-01, D-09, D-10 merge)
- [ ] `tests/helpers/db.ts` — add `truncateCartTables()` (FK-safe: cart_item → cart)

> **FK-safe truncation order:** `cart_item` → `cart`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Add-to-cart opens drawer + count bumps live | CART-01, D-01/D-13 | Client interactivity | On a PDP, click Add to cart → drawer slides in with the item, header badge increments without reload |
| Stepper / remove in drawer & /cart | CART-02, D-04/D-05/D-07 | Rendered interaction | Change qty with − n +, trash icon removes, qty below 1 removes |
| Guest cart persists across refresh | CART-03 | Browser session | Add items as guest, hard-refresh and revisit → cart intact |
| Merge guest cart on login | D-10 | Auth flow | Add as guest, log in → guest items merged into account cart |
| OOS/low-stock cart behavior | D-06/D-11/D-12 | Stock state change | Drop variant stock in DB → cart clamps qty / marks OOS + blocks checkout |
| Empty cart state | D-14 | Rendered | Empty the cart → friendly empty state + Start shopping CTA |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
