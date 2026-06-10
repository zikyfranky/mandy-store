# Phase 1: Foundation - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the bedrock every later phase depends on:

1. **Data model** — Drizzle schema with the cross-phase constraints locked in now: the canonical `order_status` enum (`pending_payment`, `awaiting_bank_transfer`, `payment_confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `payment_failed`) and a `processed_webhook_events` table with a unique constraint on event ID. Auth-related tables are built. Product/cart/order *business* tables are **deferred** to their own phases.
2. **Authentication** — email/password registration, login (session persists across refresh), and logout from any page (AUTH-01/02/03), with email verification required before login.
3. **Route protection** — `src/proxy.ts` (Next.js 16, NOT `middleware.ts`) redirects unauthenticated requests to `/admin/*` and `/account/*` to login, AND every protected Server Action independently re-verifies the session via `verifySession()`.

Delivering a working dev environment (Node 20+, Neon Postgres, Drizzle, Auth.js v5, Resend) where these three pillars are committed up front.

</domain>

<decisions>
## Implementation Decisions

### Authentication Methods & Registration
- **D-01:** Email/password only for v1. No social/OAuth login this phase. (Architect with Auth.js v5 so a provider can be added later without rework.)
- **D-02:** Email verification is **required** before a user can log in. Registration creates the account but login is blocked until the email is confirmed via a verification link.
- **D-03:** Registration collects: **email, password, name, and username.**
- **D-04:** Username is **unique**. Users can log in with **either username or email** + password. (Login form accepts one "username or email" identifier field; resolve to a user by matching either column.)

### Email Infrastructure
- **D-05:** Wire up **Resend** for real transactional email **in this phase** (not deferred to Phase 4) so the verification link actually sends end-to-end. Requires `RESEND_API_KEY`. This sender is reused for all later order/notification emails. **Scope note:** this pulls email infra forward from Phase 4 into Phase 1.

### Session Strategy
- **D-06:** **Database-backed sessions** via the Auth.js v5 Drizzle adapter (sessions stored in Postgres), chosen for server-side revocability ("log out everywhere", lock out a banned user/admin) — appropriate for a store with an admin panel and payments.
- **D-07:** Session lifetime: **30 days, sliding** (refreshes on activity).
- **D-08 (research flag):** Auth.js v5's **Credentials provider defaults to the JWT session strategy** and does not natively persist DB sessions. The plan MUST resolve how to get database-backed sessions with credentials auth (e.g. custom session callbacks writing to the sessions table, or a documented adapter pattern). Do not assume the adapter "just works" with Credentials.

### Admin Role & First Admin
- **D-09:** A `role` enum on the users table: `customer` | `admin`, defaulting to `customer`. proxy.ts + `verifySession()` check `role === 'admin'` for `/admin/*`.
- **D-10:** First admin provisioned by **two complementary mechanisms**: (a) an `ADMIN_EMAILS` server-only env allowlist that auto-promotes a matching email to `admin` at registration, AND (b) a seed script for explicit/repeatable admin provisioning per environment.

### Schema Breadth (this phase)
- **D-11:** Define **only**: auth tables (users, sessions, accounts, verification tokens) + the `order_status` enum + the `processed_webhook_events` table. **Defer** products, categories, variants, cart, and orders/order_items tables to their respective phases, where their requirements are discussed first. Avoids locking schema for features that haven't been designed yet.

### Route Protection
- **D-12:** Protected route prefixes: `/admin/*` (admin role required) and `/account/*` (any authenticated user). Both enforced by `src/proxy.ts` redirect to login AND `verifySession()` inside every protected Server Action — proxy alone is never sufficient (Next.js 16 proxy cannot protect Server Actions).

### Claude's Discretion
- Password complexity rules, verification-link/token expiry duration, login rate-limiting, and post-login/post-logout redirect targets were not specified — planner picks sensible, secure defaults (these can surface in a follow-up discussion if needed).
- Drizzle migration workflow (generate vs push), schema file organization, and Neon connection driver choice are implementation details for the planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope & Requirements
- `.planning/ROADMAP.md` §"Phase 1: Foundation" — goal, dependencies, and the 5 success criteria (incl. exact order_status enum values and processed_webhook_events unique constraint)
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-03 (the requirements this phase delivers)
- `.planning/PROJECT.md` — scope boundaries, out-of-scope list, key decisions

### Cross-Phase Constraints (MUST honor)
- `CLAUDE.md` §"Critical Constraints" — proxy.ts vs middleware.ts, never-trust-client-prices, webhook idempotency, atomic stock decrement, server-side payment-method toggles
- `.planning/STATE.md` §"Accumulated Context" — locked decisions and carried-forward pitfalls (double-auth, order status machine + webhook table designed in Phase 1, server-only feature flags)

### Research (stack & pitfalls)
- `.planning/research/STACK.md` — recommended stack (Neon + Drizzle, Auth.js v5, Resend, Vercel Blob) and version notes
- `.planning/research/PITFALLS.md` — known landmines to design around
- `.planning/research/ARCHITECTURE.md` — architectural recommendations
- `.planning/research/SUMMARY.md` — research synthesis

### Codebase Maps
- `.planning/codebase/STACK.md` — current scaffold (Next.js 16.2.7, React 19, TS, Tailwind v4; Node 18.17.0 local — must upgrade to ≥20.9.0)
- `.planning/codebase/STRUCTURE.md` — `src/` layout, where new code goes (`src/lib/`, `src/components/`, `src/app/api/`), `@/*` path alias

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Fresh Next.js 16 scaffold only — no business logic, auth, or DB code exists yet. Everything in this phase is net-new.
- `src/app/layout.tsx` (root layout, fonts/metadata) and `src/app/globals.css` (Tailwind v4 + CSS vars, dark mode) are present and will wrap any auth UI.
- `@/*` → `./src/*` path alias is configured (tsconfig.json).

### Established Patterns
- App Router, `src/` layout. New routes = `src/app/[route]/page.tsx`; API routes = `src/app/api/[name]/route.ts`; utilities = `src/lib/`; types = `src/types/`.
- TypeScript strict mode on. ESLint flat config (next/core-web-vitals + TS).
- No `.env` files yet — env vars (`DATABASE_URL`, `RESEND_API_KEY`, `ADMIN_EMAILS`, Auth.js secret) must be added; `.env*` is gitignored.

### Integration Points
- Route protection file MUST be `src/proxy.ts` (Next.js 16 renamed `middleware.ts`).
- `verifySession()` helper (to build in `src/lib/`) is the re-verification seam used by this phase's protected actions and reused in Phases 5 and 6.
- The Resend email sender built here is the shared seam reused by all Phase 4/5 order emails.

### Environment Blocker
- Local Node is **v18.17.0**; Next.js 16 requires **≥20.9.0**. Upgrade (recommend Node 22 LTS via `nvm use 20`+) before `npm install`. Production build uses `npx next build --webpack` (Turbopack native bindings unavailable on this machine — see CLAUDE.md).

</code_context>

<specifics>
## Specific Ideas

- "Login with username OR email" — single identifier field on the login form that resolves against either the unique `username` or `email` column.
- Email verification gating login is a deliberate choice despite added friction (accepted the tradeoff of pulling Resend into Phase 1).

</specifics>

<deferred>
## Deferred Ideas

- **Social / Google sign-in** — out of scope for v1 auth; revisit post-v1. Architect Auth.js so it can be added without rework.
- **Product / category / variant tables** — Phase 2 (Product Catalog).
- **Cart table/cookie schema** — Phase 3 (Cart). (Cart cookie stores only `{ variantId, quantity }`; totals recalculated server-side — design intent already recorded in STATE.md.)
- **Orders / order_items / addresses tables, atomic stock decrement, webhook idempotency *enforcement*** — Phase 4 (Checkout & Payments). Only the `order_status` enum and `processed_webhook_events` table *shells* are created in Phase 1.
- **Password complexity policy, login rate-limiting, account recovery/password reset flow** — not raised as Phase 1 requirements; can be a follow-up discussion or later hardening phase.

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-06-10*
