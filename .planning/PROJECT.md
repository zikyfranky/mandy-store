# Mandy Store

## What This Is

Mandy Store is a single-vendor ecommerce storefront selling electronics, watches, and phones. Customers can browse the catalog, select product variants, add items to a cart, and complete purchases via Stripe, PayPal, or local bank transfer. The store owner manages products, inventory, and orders through a built-in admin panel.

## Core Value

Customers can find a product, pick their variant, and complete a purchase using their preferred payment method — without friction.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Product catalog with categories (electronics, watches, phones)
- [ ] Product detail pages with variant selection (color, storage, etc.)
- [ ] Shopping cart — add, remove, update quantity
- [ ] Guest checkout with optional account creation
- [ ] Multiple payment methods: Stripe, PayPal, bank transfer — each individually toggleable
- [ ] Order confirmation on purchase (summary page + email)
- [ ] Physical shipping address collection at checkout
- [ ] Admin panel: add, edit, delete products and manage variants/stock levels
- [ ] Admin panel: view orders and update fulfillment status

### Out of Scope

- Multi-vendor / marketplace — single seller only
- Discount codes and promotions — v2
- Product reviews and ratings — v2
- Wishlists / saved items — v2
- Subscription or recurring billing — not applicable
- Advanced sales analytics — v2

## Context

- Codebase is a freshly scaffolded Next.js 16 app with TypeScript, Tailwind v4, and App Router (src/ layout). No business logic exists yet — the map in `.planning/codebase/` captures the starting state.
- Payment methods need to be individually toggleable via config or environment flags — the store owner may not have all payment providers set up at launch.
- Product variants (e.g. iPhone 15 in 128GB Black vs 256GB White) must each carry their own price and stock level.
- Physical shipping: customers enter a delivery address at checkout; no in-store pickup for v1.

## Constraints

- **Tech stack**: Next.js 16 (App Router), TypeScript, Tailwind v4 — already scaffolded, do not replace
- **Scope**: Single-vendor only — no multi-seller architecture needed
- **Payments**: Stripe, PayPal, and bank transfer must be independently enable/disable-able via config

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js 16 App Router | Scaffolded at project start, modern server-component model suits ecommerce | — Pending |
| Payment method feature flags | Owner may not have all providers ready at launch; avoid hard-coding | — Pending |
| Guest + optional account checkout | Reduces friction for first-time buyers while enabling order history for repeat customers | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-05 after initialization*
