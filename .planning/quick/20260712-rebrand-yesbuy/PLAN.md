---
slug: rebrand-yesbuy
created: 2026-07-12
type: quick
---

# Quick Task: Rebrand "Mandy Store" → "YesBuy" (domain yesbuy.store)

Replace the customer-facing brand name "Mandy Store" with **YesBuy** across all source
strings so the brand matches the `yesbuy.store` domain. Wordmark rendered two-tone as
`Yes` + accent `Buy` (mirrors the old `Mandy`+accent`Store` treatment and the domain root).

## Scope
- Metadata `<title>`/description strings (home, layout, products, product detail, category,
  search, cart, checkout, order confirmation).
- Transactional email `Preview` / `from` / body copy (verification, order confirmation,
  bank transfer, password reset, order status change).
- Payment-panel display titles (Flutterwave checkout panel + gateway config).
- Storefront + admin wordmarks (SiteHeader, AdminSidebar).
- Cart cookie comment (cookie key `ms_cart` left unchanged — renaming it would drop
  existing guest carts).

## Out of scope (flagged, not changed)
- `package.json` `name: "mandy_store"`, the repo directory name, and historical `.planning/`
  docs — technical/internal identifiers, not customer-facing. Change on request.
