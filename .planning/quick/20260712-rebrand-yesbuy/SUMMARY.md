---
slug: rebrand-yesbuy
status: complete
completed: 2026-07-12
---

# Summary: Rebrand → Yesbuy Store

Replaced the customer-facing brand "Mandy Store" with **Yesbuy Store** across 20 source files.

## Changes
- **Bulk** `"Mandy Store"` → `"Yesbuy Store"` in all metadata titles/descriptions, all 5 transactional
  email templates (`Preview`/body) + 5 email senders (`from:` display name), and the 2
  payment-panel titles (`FlutterwavePaymentPanel.tsx`, `flutterwave.ts`).
- **Wordmarks** two-tone `Yesbuy` + accent `Store` (mirrors the original Mandy+Store
  treatment): `SiteHeader.tsx` → "Yesbuy Store"; `AdminSidebar.tsx` → "Yesbuy Store Admin".
- **Casing:** owner chose the two-word "Yesbuy Store" (not camel "YesBuy").
- **Cart comment** reworded (cookie key `ms_cart` intentionally kept — renaming drops carts).

## Verification
- `grep -rniI mandy src` → 0 matches (excluding the `mandy_store` working-dir path).
- `tsc --noEmit` clean; `next build --webpack` compiled successfully.

## Not changed (flagged for user)
- `package.json` `name: "mandy_store"`, repo directory name, `.planning/` history, `CLAUDE.md`
  project title — internal identifiers, not customer-facing.

## Self-Check: PASSED
