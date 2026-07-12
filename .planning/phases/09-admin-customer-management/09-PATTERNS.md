# Phase 9: Admin Customer Management — Pattern Map

**Mapped:** 2026-07-12
**Purpose:** For each file this phase creates/modifies, the closest existing analog to copy, with exact paths. Grounded in a codebase reconnaissance pass.

## New / modified files → closest analog

| New/modified file | Role | Closest analog to copy | Notes |
|---|---|---|---|
| `src/lib/db/schema.ts` (modify) | Add `users.createdAt` | existing `users` table + other `timestamp(...).defaultNow().notNull()` cols in same file | D-01. Then `[BLOCKING]` `drizzle-kit push` to both DBs. |
| `src/lib/catalog/admin-queries.ts` (modify) | `listCustomersForAdmin({q,page})` | `listOrdersForAdmin` (same file — cleanest single-table list) + `variantAggSq` subquery (same file) for the order-count aggregate | D-02. `ADMIN_PAGE_SIZE=24`; `where`+`Promise.all` count; parameterized `ilike`; return `{rows,total,page,pageCount}`; DTO excludes `passwordHash`. Query does NOT self-verify (caller does). |
| `src/lib/actions/admin-customers.ts` (new) | `sendCustomerPasswordReset`, `updateCustomerRole` | `src/lib/actions/admin-orders.ts` (`verifyAdminSession()` first statement, `"use server"`+`server-only`, minimal DTO return) | D-03/D-04. Token gen mirrors `register()` in `auth.ts`; guards fail-closed. |
| `src/lib/actions/auth.ts` (reference) | reset-consume `resetPassword({email,token,password})` — may live here or in admin-customers | `verifyEmail()` in `src/lib/auth.ts` (single-use consume: exact `(identifier,token)` match + expiry + delete) and `register()` argon2id hash | D-03. Enforce `pwreset_` prefix; reuse Zod password rules. |
| `src/lib/email/send-password-reset.ts` (new) | `sendPasswordResetEmail(email,token)` | `src/lib/email/send-verification.ts` | D-03. `getResendClient()` null-safe; link `${NEXT_PUBLIC_APP_URL}/reset-password?token=…&email=…`. |
| `src/emails/PasswordResetEmail.tsx` (new) | reset email React component | `src/emails/VerificationEmail` | D-03. |
| `src/app/reset-password/page.tsx` (new) | public set-new-password page | `src/app/verify-email/` page (verify-email consume page) | D-03. Reads `token`+`email` from searchParams; posts to `resetPassword` action. |
| `src/app/admin/customers/page.tsx` (new) | customers list page | `src/app/admin/products/page.tsx` | D-05. Suspense async content; awaited `searchParams:{q?,page?}`; GET search form; `<table>`; `<Pagination>`. |
| `src/components/admin/CustomerRowActions.tsx` (new) | row-action client island | `src/components/admin/ProductRowActions.tsx` | D-05. "Send reset" + role toggle w/ confirm; disable on own row / last-admin. |
| `src/components/admin/AdminSidebar.tsx` (modify) | add "Customers" nav | existing `NAV_ITEMS` array | D-05. |
| `src/components/admin/RoleBadge.tsx` (new, optional) | role badge | `src/components/admin/OrderStatusBadge.tsx` | D-05. Could be inline instead. |

## Auth / dual-auth pattern (mandatory in every action & admin page)
- `verifyAdminSession()` from `src/lib/dal.ts` is the **literal first statement** of every admin Server Action (see `admin-orders.ts`, `admin-products.ts`).
- `/admin` is proxy-guarded (`src/proxy.ts`, UX-only) + re-verified in `src/app/admin/layout.tsx` (layer 2). Server Actions re-verify independently (proxy cannot protect actions — CLAUDE.md).
- Session role typing: `src/types/auth.ts`; role populated via callbacks in `src/lib/auth.ts`.

## Token infra (reuse — no new table)
- `verificationTokens` in `src/lib/db/schema.ts`: compound PK `(identifier, token)`, `expires`. **No `type` column** → namespace reset tokens `pwreset_${crypto.randomUUID()}` (D-03).
- Generate/consume patterns: `register()` (generate) and `verifyEmail()` (single-use consume + expiry) in `src/lib/auth.ts`.

## Hashing
- argon2id via `argon2` pkg: `argon2.hash(password,{type:argon2.argon2id})` (register/seed), `argon2.verify(hash,password)` (login). Reuse identical options for reset.

## Order-count aggregate
- `orders.userId` nullable FK + `order_user_idx` (`schema.ts`). Guest orders (`userId IS NULL`) attribute to nobody — expected. Mirror `variantAggSq` GROUP-BY subquery in `admin-queries.ts`; `listOrdersForUser` in `src/lib/orders/queries.ts` shows the COUNT-subquery shape.

## Known gaps this phase closes
- No `users.createdAt` (D-01 adds it).
- No all-customers query / cross-user order-count aggregate (D-02 adds it).
- No password-reset route/action/email (D-03 adds them; token table already exists).
- No last-admin / self-role-change guard (D-04 adds them).

---
*Pattern map for Phase 9 — mirror these analogs to stay consistent with Phases 1/5.*
