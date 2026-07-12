# Phase 9: Admin Customer Management - Research

**Researched:** 2026-07-12
**Domain:** Admin user administration — secure admin-triggered password reset, privilege escalation safety, PII-safe customer listing (Next.js 16 App Router, Auth.js v5 beta.31, Drizzle/Neon, argon2id, Resend)
**Confidence:** HIGH (all mechanics verified against installed source; security guidance cross-checked with OWASP)

## Summary

This phase adds three admin operations over the existing `users` table. The codebase already contains every seam needed — the research question is not "what libraries" but "what are the correctness and security invariants that must hold." I verified all three by reading the installed code (`src/lib/auth.ts`, `dal.ts`, `actions/auth.ts`, `admin-queries.ts`, `db/schema.ts`, email seam, test helpers), so confidence is HIGH.

The single most important architectural finding: **this app's Auth.js session is a DB-backed opaque cookie, and `role` is re-read live from the `user` row on every request** (`jwt.decode()` → `adapter.getSessionAndUser()` in `src/lib/auth.ts:104-137`). This means a role promote/demote takes effect on the target user's **next request** — no re-login, no JWT staleness. This is the opposite of a plain-JWT app and materially simplifies ADMN-10 [VERIFIED: src/lib/auth.ts:104-137].

Two genuine gaps in the locked CONTEXT that the planner should address as hardening (neither contradicts a locked decision — both are additive):
1. **Password reset does not invalidate the target's existing sessions.** Changing `passwordHash` leaves `session` rows intact, so a person holding a live session keeps it after a reset. Since sessions are DB rows, add `db.delete(sessions).where(eq(sessions.userId, userId))` inside `resetPassword` [VERIFIED: session table is deletable-by-userId; OWASP recommends session invalidation on password change].
2. **Stale reset tokens accumulate.** Each trigger inserts a new `verificationTokens` row (compound PK allows many per identifier). Delete prior `pwreset_` tokens for that identifier before inserting a new one, so only the latest link is live.

**Primary recommendation:** Build the three operations exactly per CONTEXT D-01..D-06, and additionally (a) delete `sessions` rows for the user inside `resetPassword`, (b) delete prior reset tokens before issuing a new one, (c) make the last-admin demote an atomic conditional UPDATE rather than read-then-write, and (d) harden `verifyEmail`/`resetPassword` to reject each other's token namespace.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Customer list (search/paginate) | API/Backend (Server Component + server-only query) | Database | Read is admin-gated; runs in verified RSC calling `listCustomersForAdmin`. No client data fetch. |
| Trigger password reset | API/Backend (Server Action) | Email service (Resend) | Token generation + email must be server-only; plaintext/token never crosses to browser. |
| Consume reset link (set new password) | API/Backend (public Server Action) | Browser (form only) | Token validated + password hashed server-side; the public page only collects the new password. |
| Role promote/demote | API/Backend (Server Action) | Database (session re-derivation) | Privileged mutation; guards + write are server-only. Role takes effect via live DB read on next request. |
| Row action UI (buttons, confirm dialog) | Browser/Client island | — | `CustomerRowActions.tsx` receives only `{id,email,role}`-level props; calls actions. |

## Standard Stack

No new dependencies. Everything is already installed and used elsewhere in the app.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | 5.0.0-beta.31 | Session (`auth()`), DB-backed opaque cookie | Already the app's auth; `role` read live per request [VERIFIED: package.json] |
| drizzle-orm | installed | Queries, parameterized `ilike`, atomic conditional UPDATE | Used by every existing query/action [VERIFIED: admin-queries.ts] |
| argon2 | ^0.44.0 | `argon2.hash(pw, { type: argon2.argon2id })` on new password | Same call used at register/seed — reset MUST match options [VERIFIED: actions/auth.ts:68] |
| resend | ^6.12.4 | Password-reset email delivery | Existing seam; null-safe when key unset [VERIFIED: resend-client.ts] |
| zod | installed | Validate `newRole` enum + new-password rules | Mirrors register `z.string().min(8)` [VERIFIED: actions/auth.ts:20-25] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto.randomUUID()` | node builtin | Reset token value (`pwreset_${uuid}`) | 122 bits entropy — exceeds OWASP brute-force bar [VERIFIED: used for verify tokens] |
| `next/cache` `revalidatePath` | next 16.2.7 | Refresh `/admin/customers` after role change | Mirror admin-products pattern [VERIFIED: admin-products.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `verificationTokens` + `pwreset_` prefix | New `password_reset_tokens` table with `type` column | Cleaner separation, but adds a migration; CONTEXT D-03 locks the prefix approach — no new table. Accept the prefix, add namespace guards (see Pitfalls). |
| `crypto.randomUUID()` token | `crypto.randomBytes(32).toString('hex')` (256 bits) | Higher entropy, but UUID (122 bits) already exceeds OWASP's "sufficiently long" bar and matches the existing verify-token convention. Keep UUID. |

**Installation:** none — `nvm use 20` (or 22 per MEMORY) and build with `npx next build --webpack`.

**Version verification:** Confirmed against `package.json` in-repo (next 16.2.7, next-auth 5.0.0-beta.31, argon2 ^0.44.0, resend ^6.12.4). Not re-queried against npm registry — the installed versions are the authoritative target for this phase.

## Architecture Patterns

### System Architecture Diagram

```
ADMN-08  view list
  Browser GET /admin/customers?q=&page=
      │
      ▼
  proxy.ts (redirect non-admin from /admin/*)     ── layer 1 (UX only)
      │
      ▼
  admin/layout.tsx  verifyAdminSession()           ── layer 2 (real gate)
      │
      ▼
  page.tsx (RSC, awaits searchParams)
      │  calls (already inside verified context)
      ▼
  listCustomersForAdmin({q,page})  [server-only]
      │  parameterized ilike(email|name) + orderCount subquery
      ▼
  Postgres ──▶ minimal DTO {id,name,email,role,emailVerified,createdAt,orderCount}
                              (NEVER passwordHash / tokens)

ADMN-09  reset password
  CustomerRowActions (client) ──▶ sendCustomerPasswordReset(userId)  [Server Action]
      │ verifyAdminSession() FIRST
      │ lookup user → delete prior pwreset_ tokens for email
      │ insert verificationTokens(identifier=email, token=pwreset_<uuid>, expires=+1h)
      │ getResendClient() → send link (null-safe: dev logs, still {success})
      ▼ returns {success}  (token NEVER returned to browser)
  ── customer clicks email ──▶ /reset-password?token=&email=  (public page)
      │ resetPassword({email,token,password})  [Server Action]
      │ enforce pwreset_ prefix → exact (identifier,token) match → expiry check
      │ argon2id hash → UPDATE users.passwordHash
      │ DELETE token (single-use)  +  DELETE sessions WHERE userId  ◀── hardening
      ▼ {success}

ADMN-10  change role
  CustomerRowActions (client, confirm dialog) ──▶ updateCustomerRole(userId,newRole)
      │ 1 verifyAdminSession() FIRST
      │ 2 zod newRole ∈ {customer,admin}
      │ 3 reject userId === session.user.id        (self-lockout guard)
      │ 4 last-admin guard (atomic conditional UPDATE)
      │ 5 UPDATE users.role → revalidatePath('/admin/customers')
      ▼ target user's role re-derived from DB on their NEXT request (no re-login)
```

### Recommended Project Structure
```
src/
├── lib/
│   ├── catalog/admin-queries.ts      # + listCustomersForAdmin (D-02)
│   ├── actions/admin-customers.ts    # NEW: sendCustomerPasswordReset, resetPassword, updateCustomerRole
│   ├── email/send-password-reset.ts  # NEW: mirrors send-verification.ts
│   └── db/schema.ts                  # + users.createdAt (D-01, BLOCKING push)
├── emails/PasswordResetEmail.tsx     # NEW: mirrors VerificationEmail.tsx
├── app/
│   ├── admin/customers/page.tsx      # NEW: list page (mirror admin/products)
│   └── reset-password/page.tsx       # NEW: public consume page (mirror verify-email)
└── components/admin/
    ├── CustomerRowActions.tsx        # NEW client island (mirror ProductRowActions)
    └── RoleBadge.tsx (or inline)     # mirror OrderStatusBadge
```

### Pattern 1: Role re-derivation is automatic (no manual session refresh)
**What:** After `updateCustomerRole` writes `users.role`, nothing else is needed for the change to take effect.
**When to use:** Always — do NOT attempt to mutate the target's `session` row for role changes.
**Why:** `jwt.decode()` calls `adapter.getSessionAndUser(sessionToken)` on every read and returns `role` from the fresh user row [VERIFIED: src/lib/auth.ts:104-137, session callback :189-195]. A demoted admin's next request resolves `role: "customer"` and `verifyAdminSession()` redirects them off `/admin`.
```typescript
// Source: VERIFIED src/lib/auth.ts:104-137
async decode({ token: sessionToken }) {
  const result = await adapter.getSessionAndUser!(sessionToken as string)
  ...
  return { ...role: (user as { role?: string }).role ?? "customer", ... }
}
```

### Pattern 2: Single-use token consume (mirror verifyEmail exactly)
**What:** Exact `(identifier, token)` match → expiry check (delete-on-expire) → do work → delete token.
**When to use:** `resetPassword`.
**Example:**
```typescript
// Source: VERIFIED src/lib/actions/auth.ts:145-191 (verifyEmail) — mirror, plus prefix guard
if (!token.startsWith("pwreset_")) return { error: "Invalid or expired reset link" }
const row = await db.query.verificationTokens.findFirst({
  where: and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, token)),
})
if (!row) return { error: "Invalid or expired reset link" }        // generic (OWASP)
if (row.expires < new Date()) {
  await db.delete(verificationTokens).where(and(eq(...identifier), eq(...token)))
  return { error: "Invalid or expired reset link" }
}
const passwordHash = await argon2.hash(password, { type: argon2.argon2id }) // match register
await db.update(users).set({ passwordHash }).where(eq(users.email, email))
await db.delete(verificationTokens).where(and(eq(...identifier), eq(...token))) // single-use
await db.delete(sessions).where(eq(sessions.userId, /* user.id */))            // HARDENING
```

### Pattern 3: Atomic last-admin guard (avoid read-then-write TOCTOU)
**What:** Do the count check and the update in one conditional statement, echoing CLAUDE.md's atomic-stock-decrement rule.
**When to use:** Demote path of `updateCustomerRole`.
**Example:**
```typescript
// Conditional UPDATE returns the row only if >1 admin remains — no separate COUNT read.
const demoted = await db.update(users)
  .set({ role: "customer" })
  .where(and(
    eq(users.id, userId),
    sql`(SELECT COUNT(*) FROM "user" WHERE role = 'admin') > 1`,
  ))
  .returning({ id: users.id })
if (demoted.length === 0) return { success: false, error: "Cannot demote the last remaining admin" }
```

### Anti-Patterns to Avoid
- **Deleting/mutating the target's `session` row to "apply" a role change** — unnecessary and wrong; role is read live. Only delete sessions for the *password reset* (credential change).
- **Returning the reset token to the browser** — the action returns `{success}` only; the token lives solely in the DB and the emailed link (D-06).
- **Selecting `*` / whole Drizzle record into the DTO** — always project explicit columns; `passwordHash` must never appear in the select (D-06).
- **String-concatenating the search term into SQL** — use Drizzle `ilike(col, \`%${q}%\`)`, which binds the value as a parameter [VERIFIED: admin-queries.ts:94].
- **Read-then-write for last-admin / duplicate checks** — race-prone; use the conditional UPDATE above.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom PBKDF/salt loop | `argon2.hash(pw, { type: argon2.argon2id })` (existing) | Must match register/login options or verify fails [VERIFIED: actions/auth.ts:68] |
| Reset token store | New table + cron cleanup | `verificationTokens` + `pwreset_` prefix (D-03) | Reuses single-use consume + delete-on-use; no migration |
| Session revocation on reset | Custom token-version column | `db.delete(sessions).where(eq(sessions.userId,...))` | Sessions are real DB rows — one delete revokes all [VERIFIED: schema.ts:63-67] |
| Role freshness after demote | Manual session rewrite / forced logout | Nothing — live DB read handles it | `decode()` re-reads role every request [VERIFIED: auth.ts:104-137] |
| Pagination math | Custom offset UI | `ADMIN_PAGE_SIZE=24`, `<Pagination>` (existing) | Mirror `listOrdersForAdmin` exactly [VERIFIED: admin-queries.ts:20,200-209] |
| Email null-safety in dev | try/catch around `new Resend()` | `getResendClient()` returns null | Constructing with no key throws; factory is null-safe [VERIFIED: resend-client.ts] |

**Key insight:** The DB-backed-session design means the two hardest problems in admin user management — *making a role change stick immediately* and *revoking a compromised account's sessions* — are both one-liners here. Do not reinvent them.

## Common Pitfalls

### Pitfall 1: Password reset leaves the target logged in
**What goes wrong:** Customer's password is reset (possibly because the account is compromised), but their existing session cookie keeps working — the whole point of the reset is defeated.
**Why:** Changing `users.passwordHash` does not touch the `session` table; the opaque cookie still resolves via `getSessionAndUser`.
**How to avoid:** In `resetPassword`, after updating the hash, `db.delete(sessions).where(eq(sessions.userId, userId))`. (OWASP: invalidate sessions on password change.)
**Warning signs:** No `sessions` deletion in the reset action.

### Pitfall 2: Cross-namespace token reuse (verify ↔ reset)
**What goes wrong:** `verifyEmail` does a bare `(identifier, token)` match with no prefix check [VERIFIED: actions/auth.ts:150-155]. A `pwreset_`-prefixed token in the shared table for the same email could be consumed by `/verify-email` (marking email verified), and a bare verify token could be fed to `/reset-password` if the prefix guard is missing.
**Why:** One table, one identifier, no `type` column — the prefix is the only discriminator.
**How to avoid:** (a) `resetPassword` MUST reject tokens not starting with `pwreset_` (D-03 already requires this). (b) Harden `verifyEmail` to reject tokens that *do* start with `pwreset_`. Low severity (both require possessing a valid emailed token) but cheap to close.
**Warning signs:** Either consume path lacks an explicit prefix assertion.

### Pitfall 3: Stale/multiple live reset links
**What goes wrong:** Admin clicks "Send reset" three times → three valid `pwreset_` rows, all usable for an hour.
**Why:** Compound PK `(identifier, token)` permits many rows per email; nothing deletes old ones.
**How to avoid:** Before inserting, delete existing `pwreset_` tokens for that identifier (e.g. `delete ... where identifier = email AND token LIKE 'pwreset_%'`). Only the newest link stays live.
**Warning signs:** Multiple `verificationToken` rows for one email after repeated triggers.

### Pitfall 4: Last-admin TOCTOU race
**What goes wrong:** Two admins demoted "simultaneously" each read `count=2`, both proceed → 0 admins, store locked out.
**Why:** Separate COUNT read then UPDATE is not atomic.
**How to avoid:** Single conditional UPDATE with the subquery guard (Pattern 3). Negligible probability on a single-owner store, but the atomic form matches CLAUDE.md's stock-decrement doctrine and costs nothing.
**Warning signs:** A `db.select(count())` followed by a separate `db.update` on `role`.

### Pitfall 5: `createdAt` missing on the test DB → integration tests fail
**What goes wrong:** D-01 adds `users.createdAt`; if only the dev DB is pushed, `TEST_DATABASE_URL` lacks the column and every user insert in integration tests errors.
**Why:** Schema push is `[BLOCKING]` to **both** DBs (CLAUDE.md); mirror the Phase 5/7/8 dual-push scripts (`src/scripts/apply-*-schema-to-test-db.mjs`).
**How to avoid:** Push to `DATABASE_URL` and `TEST_DATABASE_URL` before verification; add a one-off apply script if a TTY prompt would block `drizzle-kit push`.
**Warning signs:** Integration tests throw `column "created_at" does not exist`.

### Pitfall 6: `searchParams` not awaited / bad page number
**What goes wrong:** Next.js 16 makes `searchParams` a Promise; reading `searchParams.q` without `await` yields undefined; `page=abc` or `page=-1` breaks the offset.
**How to avoid:** `const { q, page } = await searchParams`; coerce `Math.max(1, Number(page) || 1)`. Mirror `admin/products/page.tsx`.
**Warning signs:** Empty search results despite a query string; negative OFFSET errors.

### Pitfall 7: PII/secret leakage into the client island
**What goes wrong:** Passing the full row (incl. `passwordHash`, `emailVerified` internals, tokens) as props to `CustomerRowActions`, exposing it in the client bundle/HTML.
**How to avoid:** DTO projects only `{id,name,email,role,emailVerified(bool-ish),createdAt,orderCount}`; the client island receives only `{id,email,role}`-level fields it needs to render actions (D-06).
**Warning signs:** `passwordHash` or a token string anywhere in a `"use client"` component's props or the serialized RSC payload.

## Code Examples

### listCustomersForAdmin (mirror listOrdersForAdmin + order-count subquery)
```typescript
// Source: VERIFIED pattern from src/lib/catalog/admin-queries.ts:99-153 (variantAggSq) + :176-226
export type AdminCustomerRow = {
  id: string; name: string | null; email: string; role: "customer" | "admin"
  emailVerified: boolean; createdAt: Date; orderCount: number
}
export async function listCustomersForAdmin(opts: { q?: string; page?: number }) {
  const { q, page = 1 } = opts
  const where = q
    ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`))   // parameterized
    : undefined

  const orderAggSq = db.select({
      userId: orders.userId,
      orderCount: sql<number>`COUNT(*)`.as("order_count"),
    }).from(orders).where(isNotNull(orders.userId))
      .groupBy(orders.userId).as("order_agg_sq")

  const baseQuery = db.select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      emailVerified: users.emailVerified, createdAt: users.createdAt,   // D-01
      orderCount: orderAggSq.orderCount,                                // NEVER passwordHash
    }).from(users).leftJoin(orderAggSq, eq(users.id, orderAggSq.userId)).where(where)

  const countQuery = db.select({ total: count() }).from(users).where(where)
  const [rows, countResult] = await Promise.all([
    baseQuery.orderBy(desc(users.createdAt)).limit(ADMIN_PAGE_SIZE).offset((page-1)*ADMIN_PAGE_SIZE),
    countQuery,
  ])
  const total = countResult[0]?.total ?? 0
  return {
    rows: rows.map(r => ({ ...r, emailVerified: !!r.emailVerified, orderCount: Number(r.orderCount ?? 0) })),
    total, page, pageCount: Math.ceil(total / ADMIN_PAGE_SIZE),
  }
}
```

### updateCustomerRole guard order
```typescript
// Source: VERIFIED guard pattern from admin-products.ts (verifyAdminSession first) + Pattern 3
export async function updateCustomerRole(userId: string, newRole: string) {
  const admin = await verifyAdminSession()                              // 1 — literal first
  const parsed = z.enum(["customer","admin"]).safeParse(newRole)        // 2
  if (!parsed.success) return { success: false, error: "Invalid role" }
  if (userId === admin.id) return { success: false, error: "You cannot change your own role" } // 3
  if (parsed.data === "customer") {                                     // 4 — atomic last-admin
    const demoted = await db.update(users).set({ role: "customer" })
      .where(and(eq(users.id, userId), sql`(SELECT COUNT(*) FROM "user" WHERE role='admin') > 1`))
      .returning({ id: users.id })
    if (demoted.length === 0) return { success: false, error: "Cannot demote the last remaining admin" }
  } else {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId))
  }
  revalidatePath("/admin/customers")                                    // 5
  return { success: true }
}
```

### sendCustomerPasswordReset (null-safe email, single live link)
```typescript
// Source: VERIFIED seam from actions/auth.ts:107-125 (token) + send-verification.ts (null-safe)
export async function sendCustomerPasswordReset(userId: string) {
  await verifyAdminSession()
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) return { success: false, error: "User not found" }
  await db.delete(verificationTokens)                                   // clear stale reset links
    .where(and(eq(verificationTokens.identifier, user.email), like(verificationTokens.token, "pwreset_%")))
  const token = `pwreset_${crypto.randomUUID()}`
  await db.insert(verificationTokens).values({
    identifier: user.email, token, expires: new Date(Date.now() + 60*60*1000), // 1h (D-03)
  })
  try { await sendPasswordResetEmail(user.email, token) }               // null-safe in dev
  catch (err) { console.error("[admin] reset email failed (token still issued):", err) }
  return { success: true }                                              // token NEVER returned
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Role baked into a signed JWT (stale until re-login) | DB-backed opaque session; role read live per request | Auth.js v5 + this app's D-08 design | Role changes are immediate; no forced re-login needed |
| `middleware.ts` | `proxy.ts` (cannot protect Server Actions) | Next.js 16 | Re-verify auth in every action; proxy is UX-only [CITED: CLAUDE.md] |
| bcrypt | argon2id (OWASP 2025) | already adopted | Reset must reuse `argon2id` options [VERIFIED: actions/auth.ts:68] |

**Deprecated/outdated:** Any tutorial using `middleware.ts`, `getServerSession`, or `session.strategy:"database"` with Credentials (throws `UnsupportedStrategy` — see the extensive note in `src/lib/auth.ts:1-37`). Ignore them.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Deleting `sessions` rows by `userId` fully revokes a user's live sessions | Pitfall 1 / Pattern 2 | If any non-DB session path existed, revocation would be partial — but `decode()` resolves *only* via `getSessionAndUser`, so risk is negligible [strongly VERIFIED] |
| A2 | `admin/products/page.tsx` coerces `page`/awaits `searchParams` (mirror target) | Pitfall 6 | Not re-read this session; verify the exact coercion when planning the list page |
| A3 | New-password rules = register's `z.string().min(8)` | Standard Stack / Pattern 2 | CONTEXT D-03 says "same Zod password rules used at register"; register currently only enforces min 8 [VERIFIED: actions/auth.ts:24] |

**No other assumptions** — auth/session, token consume, argon2 options, email null-safety, query pattern, and test isolation were all read directly from installed source.

## Open Questions (RESOLVED)

1. **Should `verifyEmail` be hardened to reject `pwreset_` tokens as part of this phase?**
   - What we know: it currently accepts any exact `(identifier, token)` match with no prefix check (Pitfall 2).
   - What's unclear: whether touching `verifyEmail` is in-scope (CONTEXT says customer-facing auth flows "stay as-is").
   - Recommendation: add the one-line prefix rejection — it hardens an existing flow without changing its behavior for legitimate verify tokens. Flag to the planner as a small, low-risk addition.
   - **RESOLVED:** LOCKED as CONTEXT D-07.3; implemented by 09-02 Task 3 (in-scope, low-risk hardening of the existing flow).

2. **From-address / live email deliverability.**
   - What we know: sender still uses `onboarding@resend.dev` and `RESEND_API_KEY` may be unset in dev [VERIFIED: send-verification.ts:27].
   - Recommendation: live reset-email round-trip is a go-live human-verify item (same posture as email verification), not a blocker for this phase.
   - **RESOLVED:** go-live human-verify item in 09-05 (09-HUMAN-UAT.md); not a phase blocker.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/test | ✓ | v20+ (use nvm; shell default 18 breaks vitest — `nvm use 22`) | — |
| Neon dev DB (`DATABASE_URL`) | D-01 push, dev list | ✓ (assumed configured) | — | — |
| Neon test branch (`TEST_DATABASE_URL`) | integration tests | ✗ unless set | — | Tests skip; dev DB protected. MUST set + push `createdAt` before Phase 9 verification |
| Resend (`RESEND_API_KEY`) | reset email delivery | ✗ likely unset in dev | — | `getResendClient()` null → action logs + returns `{success}`; live send is go-live human-verify |
| argon2 native binding | password hashing | ✓ | ^0.44.0 | — |

**Missing dependencies with no fallback:** none block code work. **With fallback:** Resend (null-safe), test DB (skip-gated) — but set `TEST_DATABASE_URL` to actually exercise the integration suite below.

## Validation Architecture

Test framework: **Vitest** (`vitest.config.ts`; `npm test` → `vitest run`). Integration tests are DB-gated via `hasDatabase = !!process.env.TEST_DATABASE_URL` and self-skip with `it.skipIf(!hasDatabase)`; they TRUNCATE via `tests/helpers/db.ts` (`truncateAuthTables` deletes sessions→accounts→verificationTokens→processedWebhookEvents→users). Admin actions are unit-tested by mocking `@/lib/dal` (`vi.mock("@/lib/dal", () => ({ verifyAdminSession: vi.fn() }))`) — mock the DAL, not `@/lib/auth` [VERIFIED: tests/admin/products.test.ts:25-56, tests/auth/verify-email.test.ts].

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (node env, `fileParallelism:false`, 30s timeout) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/admin/customers.test.ts tests/actions/admin-customers.test.ts` |
| Full suite command | `npm test` (set `TEST_DATABASE_URL` first to run DB-gated tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMN-08 | `listCustomersForAdmin` returns minimal DTO, no `passwordHash`/token keys | unit (assert object keys) | `npx vitest run tests/admin/customers.test.ts` | ❌ Wave 0 |
| ADMN-08 | Search `ilike` matches email OR name; pagination limit/offset + total/pageCount correct | integration | `npx vitest run tests/admin/customers.test.ts` | ❌ Wave 0 |
| ADMN-08 | Order count = COUNT(orders.userId); guest orders (userId NULL) excluded | integration | same | ❌ Wave 0 |
| ADMN-09 | Reset token issued with `pwreset_` prefix + ~1h expiry; token NOT in action return | unit + integration | `npx vitest run tests/actions/admin-customers.test.ts` | ❌ Wave 0 |
| ADMN-09 | `resetPassword` round-trip: valid token → hash updated (argon2.verify passes) → token deleted (single-use) | integration | same | ❌ Wave 0 |
| ADMN-09 | Expired reset token rejected + deleted; bare-UUID (non-`pwreset_`) token rejected | integration | same | ❌ Wave 0 |
| ADMN-09 | Re-issuing reset deletes prior `pwreset_` token(s) for the email (only latest live) | integration | same | ❌ Wave 0 |
| ADMN-09 | (hardening) `resetPassword` deletes `sessions` rows for the user | integration | same | ❌ Wave 0 |
| ADMN-09 | Resend unset → action still returns `{success}` (email seam mocked/null) | unit | same | ❌ Wave 0 |
| ADMN-10 | Promote customer→admin persists `role='admin'` | integration | `npx vitest run tests/actions/admin-customers.test.ts` | ❌ Wave 0 |
| ADMN-10 | Self role change rejected (`userId === session.user.id`) | unit (mock verifyAdminSession → self id) | same | ❌ Wave 0 |
| ADMN-10 | Last-admin demote rejected (only 1 admin → `{success:false}`, role unchanged) | integration | same | ❌ Wave 0 |
| ADMN-10 | Demote succeeds when ≥2 admins remain | integration | same | ❌ Wave 0 |
| ADMN-10 | `newRole` outside `{customer,admin}` rejected by zod | unit | same | ❌ Wave 0 |
| ADMN-08/09/10 | Non-admin caller → `verifyAdminSession` redirect thrown (guard is first statement) | unit (mock throws) | same | ❌ Wave 0 |

**Manual / human-verify (go-live):** live Resend reset email deliverability + click-through of `/reset-password` in a browser; visual check of `/admin/customers` list, confirm dialog, and disabled self-row toggle. These mirror the existing 05/08 go-live human-verify posture and are not automatable in CI.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/admin/customers.test.ts tests/actions/admin-customers.test.ts`
- **Per wave merge:** `npm test` (with `TEST_DATABASE_URL` set so DB-gated tests actually run)
- **Phase gate:** full suite green + `npx next build --webpack` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/admin/customers.test.ts` — covers ADMN-08 (DTO no-PII, ilike search, pagination, order count)
- [ ] `tests/actions/admin-customers.test.ts` — covers ADMN-09 (reset token round-trip, single-use, expiry, prefix, session revocation, Resend-null) + ADMN-10 (promote/demote, self-guard, last-admin, zod, admin-gate)
- [ ] `[BLOCKING]` push `users.createdAt` to BOTH `DATABASE_URL` and `TEST_DATABASE_URL` (D-01) — integration tests fail without it on the test branch (Pitfall 5)
- [ ] Set `TEST_DATABASE_URL` to a separate Neon branch (CLAUDE.md) so DB-gated tests run during verification
- [ ] Mock `@/lib/email/send-password-reset` (like `verify-email.test.ts` mocks `send-verification`) and `@/lib/dal` `verifyAdminSession` in the action tests

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication (incl. credential recovery) | yes | Single-use, time-limited (1h) `pwreset_` token; argon2id re-hash; generic consume errors [VERIFIED: seam] |
| V3 Session Management | yes | DB-backed revocable sessions; delete `sessions` by userId on password reset (hardening) [VERIFIED: schema.ts:63-67, auth.ts:197-208] |
| V4 Access Control | yes | `verifyAdminSession()` first statement in every action/page; role read live from DB; self + last-admin guards [VERIFIED: dal.ts] |
| V5 Input Validation | yes | Zod on `newRole` enum + new password; parameterized `ilike` (no injection) [VERIFIED: admin-queries.ts:94] |
| V6 Cryptography | yes | `crypto.randomUUID()` token (122-bit); argon2id — never hand-rolled [VERIFIED] |
| V7 Error/Logging | partial | Generic reset-consume errors (no enumeration); server-side `console.error` on email failure [VERIFIED] |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via search `q` | Tampering | Drizzle `ilike` binds value as parameter — never concatenate [VERIFIED: admin-queries.ts:94] |
| Privilege escalation / self-lockout | Elevation of Privilege | Self-role-change reject + atomic last-admin guard (D-04) |
| Reset link replay | Spoofing | Single-use delete-on-consume; expiry check; only-latest-link (delete stale) |
| Cross-namespace token misuse (verify↔reset) | Spoofing | `pwreset_` prefix enforced in `resetPassword`; reject prefix in `verifyEmail` (Pitfall 2) |
| Session survives credential reset | Elevation of Privilege | Delete `sessions` for userId in `resetPassword` (Pitfall 1) |
| PII/hash leakage to client | Information Disclosure | Explicit-column DTO; `server-only` on query module; client island gets `{id,email,role}` only (D-06) |
| Reset-trigger flooding | Denial of Service | Admin-gated (limited surface); delete-prior-token bounds live links. Per-account rate-limit is optional given the small admin surface [CITED: OWASP Forgot Password Cheat Sheet] |
| User enumeration on consume page | Information Disclosure | Single generic "invalid or expired" message for unknown/expired/wrong-prefix [CITED: OWASP] |

## Sources

### Primary (HIGH confidence)
- Installed source (VERIFIED): `src/lib/auth.ts` (session decode/role live-read, events.signOut), `src/lib/dal.ts` (verifyAdminSession), `src/lib/actions/auth.ts` (register/verifyEmail/argon2id), `src/lib/catalog/admin-queries.ts` (list/ilike/subquery pattern), `src/lib/db/schema.ts` (users, verificationTokens, sessions), `src/lib/email/*` (Resend null-safe seam), `tests/helpers/db.ts` + `tests/auth/verify-email.test.ts` + `tests/admin/products.test.ts` (test/isolation/mock patterns), `vitest.config.ts`, `package.json`, `.planning/config.json`.
- `CLAUDE.md` (CITED): Next.js 16 `proxy.ts`, re-verify auth in every action, `[BLOCKING]` schema push, `TEST_DATABASE_URL` isolation, atomic-decrement doctrine.

### Secondary (MEDIUM confidence)
- OWASP Forgot Password Cheat Sheet (CITED: cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — single-use + expiring tokens, session invalidation on password change, consistent (non-enumerating) responses, per-account rate limiting. No specific numeric length/expiry mandated; 122-bit UUID and 1h expiry comfortably satisfy the qualitative bar.

### Tertiary (LOW confidence)
- None — no unverified web-only claims relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps installed and read in-repo.
- Architecture / session behavior: HIGH — read directly from installed `auth.ts`.
- Security guidance: HIGH — codebase-verified mechanics + OWASP cross-check.
- Pitfalls: HIGH — derived from actual code gaps, not speculation.

**Research date:** 2026-07-12
**Valid until:** 2026-08-11 (stable; re-verify only if `src/lib/auth.ts` session strategy or the `verificationTokens` schema changes)
