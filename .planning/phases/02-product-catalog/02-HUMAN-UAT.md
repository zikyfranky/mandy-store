---
status: partial
phase: 02-product-catalog
source: [02-VERIFICATION.md]
started: 2026-06-18T00:00:00.000Z
updated: 2026-06-18T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Category pages render correct products
expected: /electronics, /watches, and /phones each load and show only that category's seeded products in a grid
result: [pending]

### 2. Search returns matching results
expected: Submitting a query in the header search bar navigates to /search?q=… and shows products matching the term by name or description
result: [pending]

### 3. Brand filter + price sort (client interaction)
expected: Selecting a brand facet and a price sort updates the URL query params and re-orders/filters the visible products; mobile shows facets in a drawer
result: [pending]

### 4. Live variant selection on PDP
expected: On /products/<slug>, selecting option swatches/pills updates the price and tiered stock indicator ("In stock" / "Only N left" / "Out of stock") live; out-of-stock combinations are shown but disabled; the gallery main image swaps for variants that have their own image; the Add-to-cart button is present (no-op stub until Phase 3)
result: [pending]

### 5. Cache split — fresh stock/price, cached content (SC5)
expected: Editing a variant's stock directly in the DB and reloading the PDP reflects the new stock immediately (fresh block), while static product content is served from cache
result: [pending]

### 6. Canonical URL + Product JSON-LD (SC5)
expected: View-source / Rich Results Test on a PDP shows a `<link rel="canonical">` and an `application/ld+json` Product block
result: [pending]

### 7. Mobile Filters drawer
expected: Below 1024px the filter sidebar collapses into a "Filters" drawer/sheet that opens and closes correctly
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
