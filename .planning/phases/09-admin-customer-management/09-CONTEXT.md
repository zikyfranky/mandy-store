# Phase 9: Admin Customer Management - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning
**Source:** `/gsd-plan-phase 9 --chain --auto` — decisions auto-selected by Claude (sensible, secure defaults) because `--auto` suppresses interactive discussion. Grounded in a codebase reconnaissance pass (see Canonical References).

<domain>
## Phase Boundary

**Delivers:** A customer-administration surface inside the existing `/admin` panel:
1. **View all customers** — searchable, paginated list of every registered user.
2. **Reset a customer's password** — admin triggers a one-time, time-limited email link; the customer sets their own new password. The admin never sees or sets a plaintext password.
3. **Change a customer's role** — promote a customer to `admin` or revoke `admin` back to `customer`, with lockout guards.

**Does NOT deliver (out of scope this phase):**
- Public self-service "forgot password" link on the login page (the reset-consume page/email/token built here would make it a small follow-up, but it is not requested — see Deferred Ideas).
- Editing customer profile fields (name/email), deleting/disabling customers, impersonation, or a per-customer detail/orders drill-down page (list + row actions only).
- Any change to the customer-facing auth flows (register/login/logout/verify-email stay as-is).
</domain>

<decisions>
## Implementation Decisions

### D-01 — Add `users.createdAt` (schema change + [BLOCKING] push)
The `user` table has **no `createdAt`** column, so the list has no natural "customer since" value or default sort key. Add `createdAt: timestamp("created_at").defaultNow().notNull()` to the `users` table in `src/lib/db/schema.ts`. Existing rows backfill to push-time `now()` (acceptable for a dev store). This requires a **`[BLOCKING]` Drizzle schema push to both DBs** (dev `DATABASE_URL` + `TEST_DATABASE_URL`) before verification — mirror the direct-SQL push pattern used in Phases 5/7/8 (`drizzle-kit push`, or direct SQL via `@neondatabase/serverless` when a TTY prompt would block). Default customers-list sort: `createdAt DESC` (newest first).

### D-02 — `listCustomersForAdmin` query (new, server-only)
Add `listCustomersForAdmin({ q, page })` to `src/lib/catalog/admin-queries.ts`, mirroring `listOrdersForAdmin` exactly (build `where` + `Promise.all([baseQuery, countQuery])`, `ADMIN_PAGE_SIZE = 24`, `.limit().offset()`, return `{ rows, total, page, pageCount }`).
- **Search (`q`)**: parameterized `ilike` on `email` OR `name`.
- **Order count**: left-join a `GROUP BY orders.userId` COUNT subquery (mirror the `variantAggSq` subquery pattern already in `admin-queries.ts`). Guest orders (`userId IS NULL`) attribute to no customer — expected.
- **Sort**: `createdAt DESC`.
- Follows the file's existing contract: the query does **not** self-verify auth; the calling page/action must have called `verifyAdminSession()` first (documented convention in that file).
- Returns a **minimal DTO** — `{ id, name, email, role, emailVerified, createdAt, orderCount }`. **Never** selects or returns `passwordHash`, `verificationTokens`, or any secret (see D-06).

### D-03 — Admin-triggered password reset via one-time email link
Admin never handles plaintext. Reuse the existing `verificationTokens` table + Resend seam (no new table).
- **Action** `sendCustomerPasswordReset(userId)` (`src/lib/actions/admin-customers.ts`): `verifyAdminSession()` first → look up user → generate token → insert into `verificationTokens` (`identifier = user.email`) with a **1-hour** expiry (shorter than email-verify's 24h, since it's a privileged reset) → send email → return `{ success }` (never reveal token to the browser).
- **Token disambiguation**: `verificationTokens` has a compound PK `(identifier, token)` and **no `type` column**. To keep reset tokens from being interchangeable with email-verify tokens, **namespace the reset token value with a `pwreset_` prefix** (`pwreset_${crypto.randomUUID()}`). The reset-consume path only accepts tokens beginning with `pwreset_`; the existing `verifyEmail` path continues to accept bare-UUID tokens. This disambiguates purpose without a schema migration.
- **Email**: new `sendPasswordResetEmail(email, token)` in `src/lib/email/` + a `PasswordResetEmail` React component under `@/emails/`, mirroring `send-verification.ts` / `VerificationEmail`. Link → `${NEXT_PUBLIC_APP_URL}/reset-password?token=…&email=…`.
- **Consume page + action**: public route `/reset-password` (mirror the verify-email page) with a set-new-password form → action `resetPassword({ email, token, password })` that mirrors `verifyEmail`'s single-use consume (exact `(identifier, token)` match + expiry check + delete-on-use), enforces the `pwreset_` prefix, hashes the new password with **argon2id** (same options as register/seed), `db.update(users).set({ passwordHash })`, and deletes the token. Password validated with the same Zod password rules used at register.
- Resend key may be unset in dev (`getResendClient()` returns `null`, never throws) — the action still succeeds and logs; live email is a go-live human-verify item.

### D-03b — Admin can also SET a password directly (ADMN-11, added post-UAT at owner request)
Alongside the email-link reset (D-03), the admin can set a new password for any customer directly from `/admin/customers`. Action `adminSetCustomerPassword(userId, password)`: `verifyAdminSession()` first; zod min(8); argon2id hash → update `users.passwordHash`; **invalidate any outstanding `pwreset_` links** for that user (the admin-set password is authoritative); **revoke the target's live sessions** (force re-login) except never the acting admin's own session (so setting your own password doesn't self-logout mid-action). UI: a "Set password" button opening a password+confirm dialog in `CustomerRowActions`. The email flow remains the customer-self-service path; this is the support/override path. (The admin transiently handles the plaintext they type — inherent to the requested feature.)

### D-04 — `updateCustomerRole` action with lockout guards (new, server-only)
Add `updateCustomerRole(userId, newRole)` to `src/lib/actions/admin-customers.ts`. Supports **both** promote (`customer → admin`) and revoke (`admin → customer`) — a promote-only action with no undo is a footgun. Guards, all **fail-closed**, in order:
1. `verifyAdminSession()` as the literal first statement.
2. Zod-validate `newRole ∈ {"customer","admin"}`.
3. **No self-role-change**: reject if `userId === session.user.id` (prevents an admin locking themselves out).
4. **Last-admin protection**: when demoting to `customer`, `COUNT(*) WHERE role='admin'` must remain `≥ 1` after the change — reject if this is the last admin.
5. `db.update(users).set({ role })` → `revalidatePath('/admin/customers')` → return `{ success }` / `{ success:false, error }`.

### D-05 — Customers UI (`/admin/customers`)
New route `src/app/admin/customers/page.tsx`, mirroring `admin/products/page.tsx`: Suspense-wrapped async content, `searchParams: Promise<{ q?, page? }>` (await it), a GET search form, a `<table>`, and `<Pagination>` from `@/components/catalog/Pagination`.
- Columns: Name, Email, Role (badge — reuse the `OrderStatusBadge` styling approach for a `RoleBadge`), Verified (✓/—), Joined (`createdAt`), Orders (count), Actions.
- **Row-action client island** `CustomerRowActions.tsx` (mirror `ProductRowActions.tsx`): "Send password reset" button (calls `sendCustomerPasswordReset`, shows a toast/inline confirmation) and a role toggle ("Make admin" / "Revoke admin") behind a **confirm dialog**, calling `updateCustomerRole`. Disable the role toggle + show a hint for the current admin's own row and reflect the last-admin guard.
- Add a **"Customers"** entry to `AdminSidebar` `NAV_ITEMS`.
- Page enforces dual-auth: `/admin` proxy redirect (already covers this prefix) + the admin `layout.tsx` `verifyAdminSession()` (layer 2). The list query is called from the verified server component.

### D-06 — No PII/secret leakage
`passwordHash`, `verificationTokens`, and any secret column are **never** selected into the customers DTO or sent to the client. Client islands receive only `{ id, email, role }`-level fields needed to render actions. Reset tokens exist only server-side and in the emailed link.

### D-07 — Research-driven hardening (LOCKED; additive to D-03/D-04)
From 09-RESEARCH.md (OWASP Forgot-Password + verified source review). These do not contradict any earlier decision — they tighten them:
1. **Revoke sessions on reset.** `resetPassword` must `db.delete(sessions).where(eq(sessions.userId, userId))` after updating `passwordHash`. Sessions are DB rows here, so this is trivial and prevents a reset from leaving the target logged in (OWASP; ASVS V3).
2. **Only-latest reset link.** `sendCustomerPasswordReset` must delete any prior `pwreset_` token(s) for that email before inserting the new one (the compound PK allows many rows/email). Keeps exactly one live reset link.
3. **Cross-namespace token rejection.** `resetPassword` enforces the `pwreset_` prefix; additionally, `verifyEmail` must **reject** any token beginning with `pwreset_` so a reset token can't be consumed as an email-verify token (and vice-versa). This is a small, in-scope edit to the existing `verifyEmail` flow.
4. **Atomic last-admin guard.** Implement D-04's last-admin protection as a single conditional `UPDATE users SET role='customer' WHERE id=$1 AND (SELECT COUNT(*) FROM users WHERE role='admin') > 1` (check `rowCount`), NOT a separate COUNT-then-UPDATE — avoids the TOCTOU race, mirroring CLAUDE.md's atomic-stock-decrement doctrine.
5. **Role staleness is a non-issue (informational).** Auth.js here uses DB sessions and reads `role` live from the `user` row on every request (`adapter.getSessionAndUser()`), so a demoted admin loses `/admin` access on their next request — no forced logout or session rewrite needed for the role change itself. (Session revocation in item 1 is specifically for the *password* reset, not the role change.)
6. **No user enumeration on the public consume page.** `/reset-password` shows a single generic "invalid or expired link" message for unknown/expired/wrong-prefix tokens (OWASP; ASVS V7).

### Claude's Discretion (planner/executor decides)
- Exact plan/wave decomposition and file-by-file task breakdown.
- Whether `RoleBadge` is a new component or an inline style.
- Precise toast/confirmation UX for row actions (must be accessible — the Phase 5 admin UI conventions apply).
- Test file layout (unit tests for query + guards; DB-gated integration for the reset-token round-trip and role-change guards).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & data model
- `src/lib/db/schema.ts` — `users` table (name `"user"`, `text` id, `role` enum `["customer","admin"]` default `customer`, `passwordHash` nullable, `emailVerified` timestamp, **no `createdAt` yet — D-01 adds it**); `verificationTokens` (compound PK `(identifier, token)`, `token`, `expires` — reuse for D-03); `orders.userId` nullable FK + `order_user_idx` (aggregate for order count — D-02).

### Auth, roles & dual-auth (Phase 1 + Phase 5)
- `src/lib/dal.ts` — `verifySession()` and `verifyAdminSession()` (redirects non-admins) — the first statement of every admin action.
- `src/lib/auth.ts` — argon2id verify at login (`argon2.verify`, line ~165); `register()` token-generation pattern (`crypto.randomUUID()`, expiry, insert) and `verifyEmail()` single-use consume pattern (mirror for D-03).
- `src/lib/actions/auth.ts` — argon2id hash at register (`argon2.hash(password, { type: argon2.argon2id })`, line ~68); Zod password rules; `ADMIN_EMAILS` auto-promote.
- `src/proxy.ts` — `/admin` prefix protection (UX-only; redirects non-admins). Matcher excludes `api/`, `_next/*`.
- `src/app/admin/layout.tsx` — layer-2 `verifyAdminSession()` + `<AdminSidebar>`.
- `src/types/auth.ts` — `session.user.role` typing.
- `src/scripts/seed.ts` — how admins are created (argon2id, pre-verified).

### Admin list/query patterns to mirror (Phase 5)
- `src/lib/catalog/admin-queries.ts` — `listOrdersForAdmin` (cleanest single-table list template: `where` + `Promise.all` count, `ADMIN_PAGE_SIZE=24`, `ilike`, paging, return shape) and the `variantAggSq` subquery aggregate pattern (mirror for order-count — D-02).
- `src/app/admin/products/page.tsx` — list-page template (Suspense, awaited `searchParams`, GET search form, table, `<Pagination>`).
- `src/components/admin/ProductRowActions.tsx` — row-action client-island pattern (mirror for `CustomerRowActions` — D-05).
- `src/components/admin/AdminSidebar.tsx` — `NAV_ITEMS` (add "Customers" — D-05).
- `src/components/catalog/Pagination.tsx` — pagination component.
- `src/components/admin/OrderStatusBadge.tsx` — badge styling to mirror for `RoleBadge`.

### Email + token seam (Phase 1 / Phase 4)
- `src/lib/email/resend-client.ts` — `getResendClient()` (null-safe when key unset).
- `src/lib/email/send-verification.ts` + `@/emails/VerificationEmail` — sender + component template to mirror for `sendPasswordResetEmail` / `PasswordResetEmail` (D-03).
- `src/lib/orders/queries.ts` — `listOrdersForUser` (COUNT subquery reference for D-02).

### Project rules
- `CLAUDE.md` — Next.js 16 uses `proxy.ts` (not `middleware.ts`); proxy cannot protect Server Actions → re-verify auth in every admin/mutation action; schema pushes are `[BLOCKING]`; DB integration tests need `TEST_DATABASE_URL` (a separate branch) and TRUNCATE for isolation.
</canonical_refs>

<specifics>
## Specific Ideas
- Reset-link expiry: **1 hour** (privileged reset, shorter than the 24h email-verify token).
- Reset token value: `pwreset_${crypto.randomUUID()}` — the `pwreset_` prefix disambiguates purpose in the shared `verificationTokens` table (no `type` column, no migration).
- Customers list default sort: `createdAt DESC`; page size 24 (`ADMIN_PAGE_SIZE`).
- Role change is bidirectional (promote + revoke) with self-change and last-admin guards.
</specifics>

<deferred>
## Deferred Ideas
- **Public self-service "forgot password"** on the login page — the `/reset-password` consume page, email, and token infra built in D-03 make this a small follow-up, but it is not part of this phase's request. Candidate for backlog.
- **Per-customer detail page** (a customer's orders/address history) — list + row actions cover the phase requirements; a drill-down is a future enhancement.
- **Editing/disabling/deleting customers, admin impersonation** — out of scope.
</deferred>

---

*Phase: 09-admin-customer-management*
*Context gathered: 2026-07-12 via /gsd-plan-phase --auto (Claude-selected defaults, codebase-grounded)*
