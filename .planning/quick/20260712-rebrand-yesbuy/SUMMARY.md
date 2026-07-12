---
slug: rebrand-yesbuy
status: complete
completed: 2026-07-12
---

# Summary: Rebrand → YesBuy

Replaced the customer-facing brand "Mandy Store" with **YesBuy** across 20 source files.

## Changes
- **Bulk** `"Mandy Store"` → `"YesBuy"` in all metadata titles/descriptions, all 5 transactional
  email templates (`Preview`/body) + 5 email senders (`from:` display name), and the 2
  payment-panel titles (`FlutterwavePaymentPanel.tsx`, `flutterwave.ts`).
- **Wordmarks** re-split two-tone to match the domain root: `Yes` + accent `Buy`
  (`SiteHeader.tsx` → "YesBuy"; `AdminSidebar.tsx` → "YesBuy Admin").
- **Cart comment** reworded (cookie key `ms_cart` intentionally kept — renaming drops carts).

## Verification
- `grep -rniI mandy src` → 0 matches (excluding the `mandy_store` working-dir path).
- `tsc --noEmit` clean; `next build --webpack` compiled successfully.

## Not changed (flagged for user)
- `package.json` `name: "mandy_store"`, repo directory name, `.planning/` history, `CLAUDE.md`
  project title — internal identifiers, not customer-facing.

## Self-Check: PASSED
