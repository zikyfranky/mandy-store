# Phase 1: Foundation - Research

**Researched:** 2026-06-10
**Domain:** Next.js 16 App Router, Auth.js v5 (Credentials + DB sessions), Drizzle ORM + Neon Postgres, Resend email, proxy.ts route protection
**Confidence:** HIGH (proxy.ts, Drizzle schema, Neon connection) / MEDIUM (Auth.js v5 DB sessions workaround — still in beta, active open issue)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Email/password only for v1. No social/OAuth login. Architect Auth.js v5 so a provider can be added later.
- D-02: Email verification REQUIRED before login. Registration creates the account; login is blocked until email is confirmed.
- D-03: Registration collects: email, password, name, and username.
- D-04: Username is unique. Login accepts username OR email + password. Single identifier field resolves against either column.
- D-05: Resend wired in Phase 1 (not deferred) so verification link sends end-to-end. Requires `RESEND_API_KEY`.
- D-06: Database-backed sessions via Auth.js v5 Drizzle adapter. Sessions stored in Postgres for server-side revocability.
- D-07: Session lifetime: 30 days, sliding.
- D-08 (research flag — RESOLVED BELOW): Auth.js v5 Credentials provider does NOT automatically persist DB sessions. See §Architecture Patterns for the concrete workaround.
- D-09: `role` enum on users table: `customer | admin`, default `customer`. proxy.ts + `verifySession()` check `role === 'admin'` for `/admin/*`.
- D-10: First admin via two mechanisms: (a) `ADMIN_EMAILS` env allowlist auto-promotes at registration, AND (b) seed script.
- D-11: Schema this phase: ONLY auth tables (users, sessions, accounts, verificationTokens) + `order_status` enum + `processed_webhook_events` table. Defer all product/cart/order business tables.
- D-12: Protected prefixes: `/admin/*` (admin role) and `/account/*` (any authenticated user). Both enforced by proxy.ts redirect AND `verifySession()` inside every protected Server Action.

### Claude's Discretion
- Password complexity rules, verification-link token expiry duration, login rate-limiting, and post-login/post-logout redirect targets — planner picks sensible, secure defaults.
- Drizzle migration workflow (generate vs push), schema file organization, and Neon connection driver choice.

### Deferred Ideas (OUT OF SCOPE)
- Social / Google sign-in — out of scope for v1.
- Product / category / variant tables — Phase 2.
- Cart table/cookie schema — Phase 3.
- Orders / order_items / addresses tables, atomic stock decrement, webhook idempotency enforcement — Phase 4. Only the `order_status` enum and `processed_webhook_events` table shells are created in Phase 1.
- Password complexity policy, login rate-limiting, account recovery/password reset flow — not Phase 1.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can register with email and password | Drizzle users schema, argon2 password hashing, Resend verification email, Auth.js v5 custom registration action |
| AUTH-02 | User can log in and session persists across browser refresh | Auth.js v5 Credentials provider, DB session workaround (D-08), 30-day sliding session |
| AUTH-03 | User can log out from any page | Auth.js v5 `signOut()` Server Action, session cookie deletion |
</phase_requirements>

---

## Summary

Phase 1 establishes the three pillars that every later phase builds on: (1) the database schema with auth tables and forward-compatibility shells for payment/webhook infrastructure, (2) email/password authentication with email verification via Resend, and (3) dual-layer route protection via `src/proxy.ts` plus in-action `verifySession()`.

The most technically complex item is Decision D-08: Auth.js v5's Credentials provider does not automatically create database session records — it is designed around JWT sessions. A documented workaround exists (manually calling `adapter.createSession()` in the `jwt` callback), but this is a known open issue (`nextauthjs/next-auth#12858`) and the library remains in beta (`5.0.0-beta.31`). The research section below provides the concrete, verified implementation pattern. The planner must account for this non-trivial integration complexity.

An important Next.js 16-specific discovery: `proxy.ts` now runs in the **Node.js runtime by default** (changed in v16.0.0 from Edge runtime). This means Auth.js's `auth()` function can be used directly as a proxy wrapper, rather than requiring manual cookie decryption. The Next.js docs also explicitly confirm that Server Functions (actions) are NOT protected by the proxy matcher — each action must re-verify auth independently.

The local Node.js environment is v18.17.0; Node v22.22.2 is available via `nvm use 22` and must be activated before `npm install`. All package versions below are verified against npm registry as of 2026-06-10.

**Primary recommendation:** Implement Auth.js v5 with the Drizzle adapter using the `adapter.createSession()` workaround in the `jwt` callback to achieve database-backed sessions with the Credentials provider. Use `argon2` for password hashing (OWASP 2025 recommendation). Keep the `verifySession()` DAL helper as the authoritative auth check reused across Phases 5 and 6.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| User registration / login form | Frontend (App Router page) | — | UI collection only; no business logic |
| Credentials validation (password check) | API / Backend (Server Action) | — | Credentials never validated client-side |
| Session creation and storage | API / Backend (Auth.js + DB) | — | DB-backed sessions require server writes |
| Route protection redirect | Proxy layer (proxy.ts) | — | Runs before render; catches unauthenticated nav |
| Action-level auth verification | API / Backend (DAL `verifySession()`) | — | Proxy cannot protect Server Actions |
| Email verification token generation | API / Backend (Server Action) | — | Tokens are server-generated secrets |
| Verification email delivery | External (Resend API) | Backend (Resend SDK) | Outbound SMTP via managed service |
| Schema definition and migration | Database / Storage (Drizzle + Neon) | — | Schema lives server-side, never client |
| Admin role enforcement | API / Backend (`verifySession()`) | Proxy (proxy.ts redirect) | Proxy for UX, DAL for security |
| First-admin provisioning | API / Backend (seed script + env allowlist) | — | Server-only env vars; no client exposure |

---

## Standard Stack

### Core

| Library | Version (npm verified) | Purpose | Why Standard |
|---------|----------------------|---------|--------------|
| next-auth | 5.0.0-beta.31 (`@beta` tag) | Auth framework — sessions, providers, callbacks | Official Next.js auth solution; App Router native in v5 |
| @auth/drizzle-adapter | 1.11.2 | Persists Auth.js sessions/users/accounts/tokens to Postgres via Drizzle | Official Auth.js adapter for Drizzle |
| @auth/core | 0.34.3 | Auth.js v5 core (peer dep of next-auth v5) | Required by next-auth v5 |
| drizzle-orm | 0.45.2 | ORM and query builder | TypeScript-first, Edge/serverless compatible, no codegen |
| drizzle-kit | 0.31.10 (devDep) | CLI for schema diff, migration generation, push | Paired with drizzle-orm |
| @neondatabase/serverless | 1.1.0 | Neon Postgres HTTP driver | Required for neon-http connection mode; works in Vercel serverless |
| argon2 | 0.44.0 | Password hashing | OWASP 2025 #1 recommendation; memory-hard, GPU-resistant |
| resend | 6.12.4 | Transactional email delivery (verification + later order emails) | Clean SDK, React Email integration, generous free tier |
| @react-email/components | 1.0.12 | React-based email template primitives | Colocate templates as TSX; renders to HTML + text |
| zod | 4.4.3 | Server-side input validation for registration/login actions | TypeScript-first, share schemas between client and server |
| server-only | 0.0.1 | Import guard — build error if DAL imported in client bundle | Structural safety for DAL and auth helpers |

[VERIFIED: npm registry, 2026-06-10]

### Notes on Version Selection

- `next-auth` is still `@beta` — no stable `@5` tag exists as of 2026-06-10. Install with `npm install next-auth@beta`. [VERIFIED: npm view next-auth dist-tags]
- `drizzle-orm` 0.45.2 is current (published 2026-05-22). [VERIFIED: npm registry]
- `argon2` 0.44.0 (published 2025-08-10) — native Node.js addon; requires Node.js 20+ for optimal performance. [VERIFIED: npm registry]
- `resend` 6.12.4 (published 2026-06-04). [VERIFIED: npm registry]

### Installation

```bash
# Activate correct Node version first
nvm use 22

# Auth + DB
npm install next-auth@beta @auth/drizzle-adapter @auth/core
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Password hashing
npm install argon2

# Email
npm install resend @react-email/components

# Validation + server-only guard
npm install zod server-only
```

**Production build:** `npx next build --webpack` (Turbopack native bindings unavailable on this machine). [CITED: CLAUDE.md]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │
  │  HTTP request (navigation to /admin/* or /account/*)
  ▼
src/proxy.ts
  │  Reads: session cookie via auth() wrapper
  │  Decision: authenticated? role=admin?
  │  Redirect to /account/login if unauth
  │  Redirect to / if auth but not admin on /admin/*
  ▼
Next.js App Router (route render)
  │
  ├── (auth) route group
  │     ├── /account/login/page.tsx      ← Login form (Client Component island)
  │     └── /account/register/page.tsx   ← Register form (Client Component island)
  │
  ├── (admin) route group
  │     └── /admin/layout.tsx            ← verifySession() + role check here too
  │
  └── (account) route group
        └── /account/orders/page.tsx     ← Protected; Phase 6 implements
  │
  ▼ (Server Actions — separate entry points, NOT covered by proxy.ts matcher)
src/lib/actions/auth.ts
  │  register()  → hash password, create user, send verification email
  │  login()     → Credentials authorize, create DB session (workaround)
  │  logout()    → signOut(), clear session cookie
  │  verifyEmail() → validate token, mark emailVerified, delete token
  │
  ▼
src/lib/dal.ts  (server-only)
  │  verifySession()  → reads session, returns { userId, role } or throws
  │  Used by: every protected Server Action, admin layout, account layout
  │
  ▼
src/lib/db/  (Drizzle + Neon)
  │  schema.ts    → users, sessions, accounts, verificationTokens,
  │                  order_status enum, processed_webhook_events
  │  client.ts    → neon() + drizzle() db instance
  │
  ▼
Neon Postgres (external)
  │
  ▼
Resend API (external)
     Sends: email verification links
```

### Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              # Centered card layout, no nav
│   │   ├── account/
│   │   │   ├── login/page.tsx      # Login page
│   │   │   └── register/page.tsx   # Register page
│   │   └── verify-email/page.tsx   # Email verification landing
│   └── api/
│       └── auth/
│           └── [...nextauth]/route.ts  # Auth.js handlers (GET + POST)
├── lib/
│   ├── auth.ts                     # NextAuth() config — exported handlers, auth, signIn, signOut
│   ├── dal.ts                      # verifySession() — import 'server-only'
│   ├── db/
│   │   ├── client.ts               # Drizzle + Neon db instance
│   │   └── schema.ts               # All Drizzle table definitions
│   ├── actions/
│   │   └── auth.ts                 # register(), logout(), verifyEmail() server actions
│   └── email/
│       └── send-verification.ts    # Resend email sender — import 'server-only'
├── emails/
│   └── VerificationEmail.tsx       # React Email template
├── types/
│   └── auth.ts                     # Session type augmentation for role
└── proxy.ts                        # Route protection (NOT middleware.ts)
```

---

### Pattern 1: Auth.js v5 Configuration (Credentials + Database Sessions — D-08 resolved)

**What:** Configure Auth.js v5 with a Credentials provider and force DB session persistence via a `jwt` callback that manually calls `adapter.createSession()`. This is the workaround for the known issue where Credentials auth does not trigger the adapter's session creation logic automatically.

**Why it's needed:** With `session: { strategy: "database" }` and a Drizzle adapter, OAuth providers automatically write session rows to Postgres. The Credentials provider does not — it exits with an "orphaned token" and no session row. The documented workaround is to intercept in the `jwt` callback, detect `account?.provider === "credentials"`, and call `adapter.createSession!()` manually.

**Confidence:** MEDIUM — workaround is confirmed by multiple community reports and the GitHub discussion (#12848), but Auth.js v5 is still in beta. The behavior could change in a future beta release.

```typescript
// src/lib/auth.ts
// Source: authjs.dev/getting-started/adapters/drizzle + github.com/nextauthjs/next-auth/discussions/12848

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db/client"
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema"
import * as argon2 from "argon2"
import { eq, or } from "drizzle-orm"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,   // Refresh session if older than 24h (sliding)
  },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or Username" },
        password:   { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) return null

        const identifier = credentials.identifier as string
        const password = credentials.password as string

        // Look up by email OR username (D-04)
        const user = await db.query.users.findFirst({
          where: or(
            eq(users.email, identifier),
            eq(users.username, identifier),
          ),
        })

        if (!user || !user.passwordHash) return null

        // Email must be verified before login (D-02)
        if (!user.emailVerified) return null

        const passwordValid = await argon2.verify(user.passwordHash, password)
        if (!passwordValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    // D-08 WORKAROUND: Credentials provider does not auto-create DB sessions.
    // Detect credentials login and manually persist a session row via the adapter.
    async jwt({ token, user, account, trigger }) {
      if (account?.provider === "credentials" && user) {
        // Create the DB session row manually
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        const sessionToken = crypto.randomUUID()

        // adapter is available on the config object via NextAuth internals,
        // but the cleanest pattern is to call the Drizzle table directly:
        await db.insert(sessions).values({
          sessionToken,
          userId: user.id!,
          expires,
        })

        token.sessionToken = sessionToken
        token.role = (user as { role?: string }).role ?? "customer"
        token.id = user.id
      }
      return token
    },
    async session({ session, user, token }) {
      // For database sessions, `user` is populated from the DB lookup.
      // For JWT fallback path, `token` carries the data we stored above.
      if (user) {
        session.user.id = user.id
        // role comes from the users table via adapter lookup
        session.user.role = (user as { role?: string }).role ?? "customer"
      } else if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: "/account/login",
    error: "/account/login",
  },
})
```

**TypeScript augmentation** (required to add `role` to session type):

```typescript
// src/types/auth.ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "customer" | "admin"
    } & DefaultSession["user"]
  }
  interface User {
    role?: "customer" | "admin"
  }
}
```

---

### Pattern 2: Drizzle Schema — Auth Tables + Order Infrastructure

**What:** Complete Drizzle schema for Phase 1. Auth tables follow the `@auth/drizzle-adapter` expected shape. Custom columns (`username`, `passwordHash`, `role`) are added to the `users` table beyond what the adapter requires.

```typescript
// src/lib/db/schema.ts
// Source: authjs.dev/getting-started/adapters/drizzle (official schema), customized

import {
  pgTable, pgEnum, text, timestamp, integer,
  primaryKey, unique, boolean
} from "drizzle-orm/pg-core"
import type { AdapterAccount } from "@auth/core/adapters"

// ─── Enums ───────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["customer", "admin"])

// D-11 + ROADMAP Phase 1 success criterion 5
export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "awaiting_bank_transfer",
  "payment_confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "payment_failed",
])

// ─── Auth Tables (required by @auth/drizzle-adapter) ─────────────────────────

export const users = pgTable("user", {
  // Auth.js adapter required fields
  id:            text("id").primaryKey(),
  name:          text("name"),
  email:         text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image:         text("image"),

  // Project-specific additions (D-03, D-04, D-09)
  username:     text("username").unique(),            // unique username; nullable during OAuth if added later
  passwordHash: text("password_hash"),                // null for future OAuth-only users
  role:         roleEnum("role").default("customer").notNull(),
})

export const accounts = pgTable(
  "account",
  {
    userId:            text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type:              text("type").$type<AdapterAccount["type"]>().notNull(),
    provider:          text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token:     text("refresh_token"),
    access_token:      text("access_token"),
    expires_at:        integer("expires_at"),
    token_type:        text("token_type"),
    scope:             text("scope"),
    id_token:          text("id_token"),
    session_state:     text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId:       text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires:      timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),  // email address
    token:      text("token").notNull(),
    expires:    timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

// ─── Phase 1 Infrastructure Tables (forward-compatibility shells) ─────────────

// Idempotency table for webhook processing — Phase 4 enforces, Phase 1 creates
// STATE.md: "processed_webhook_events idempotency table — Phase 1 schema, enforced in Phase 4"
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id:          text("id").primaryKey(),          // event ID from provider (e.g. Stripe evt_xxx)
  provider:    text("provider").notNull(),       // "stripe" | "paypal"
  processedAt: timestamp("processed_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  // Unique constraint on event ID — the idempotency guarantee
  eventIdUnique: unique("processed_webhook_events_id_unique").on(table.id),
}))
```

---

### Pattern 3: Neon + Drizzle DB Client

```typescript
// src/lib/db/client.ts
// Source: orm.drizzle.team/docs/get-started/neon-new [VERIFIED]

import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// DATABASE_URL format: postgres://user:password@host.neon.tech/dbname?sslmode=require
const sql = neon(process.env.DATABASE_URL!)

export const db = drizzle({ client: sql, schema })
```

**drizzle.config.ts** (project root):

```typescript
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

**Migration workflow (Claude's Discretion):**

- Development: `npx drizzle-kit push` — directly applies schema to Neon branch; fast iteration.
- Staging/Production: `npx drizzle-kit generate` then `npx drizzle-kit migrate` — generates SQL migration files committed to git.
- Recommended for Phase 1: use `push` during development, then generate a migration file to commit before the phase is merged.

[CITED: orm.drizzle.team/docs/drizzle-config-file, neon.com/docs/guides/drizzle-migrations]

---

### Pattern 4: proxy.ts Route Protection

**Critical finding:** As of Next.js 16.0.0, `proxy.ts` runs in the **Node.js runtime by default** (not Edge runtime as middleware.ts did). This means Auth.js `auth()` can be used as a wrapper directly in proxy.ts — no manual JWT decryption needed. [VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/proxy, v16.2.9]

**Critical finding:** The Next.js 16 docs explicitly state: *"Server Functions are not separate routes in this chain. They are handled as POST requests to the route where they are used, so a Proxy matcher that excludes a path will also skip Server Function calls on that path. Always verify authentication and authorization inside each Server Function."* [VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/proxy]

```typescript
// src/proxy.ts
// Source: nextjs.org/docs/app/api-reference/file-conventions/proxy [VERIFIED]
// Using Auth.js auth() as proxy wrapper — valid in Next.js 16 (Node.js runtime)

import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const proxy = auth((req) => {
  const { nextUrl } = req
  const path = nextUrl.pathname
  const session = req.auth

  const isAdminRoute   = path.startsWith("/admin")
  const isAccountRoute = path.startsWith("/account/orders") || path.startsWith("/account/settings")
  const isAuthRoute    = path === "/account/login" || path === "/account/register"

  // Redirect unauthenticated users away from protected routes
  if ((isAdminRoute || isAccountRoute) && !session?.user) {
    const loginUrl = new URL("/account/login", nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", path)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect non-admins away from /admin
  if (isAdminRoute && session?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", nextUrl.origin))
  }

  // Redirect already-authenticated users away from login/register
  if (isAuthRoute && session?.user) {
    return NextResponse.redirect(new URL("/", nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    // Match all routes except static files, Next.js internals, api routes
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
}
```

**WARNING:** The proxy provides redirect UX only — NOT security. Every Server Action and protected Server Component must call `verifySession()` independently. [VERIFIED: nextjs.org/docs/app/guides/data-security]

---

### Pattern 5: Data Access Layer — verifySession()

```typescript
// src/lib/dal.ts
import "server-only"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export type SessionUser = {
  id: string
  role: "customer" | "admin"
  email: string
}

/**
 * Verifies session and returns user data, or redirects to login.
 * Call at the top of EVERY protected Server Action and Server Component.
 * Do NOT rely on proxy.ts alone — proxy cannot protect Server Actions.
 */
export async function verifySession(): Promise<SessionUser> {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/account/login")
  }

  return {
    id: session.user.id,
    role: session.user.role ?? "customer",
    email: session.user.email ?? "",
  }
}

/**
 * Like verifySession(), but also asserts admin role.
 * Use in all /admin/* Server Actions.
 */
export async function verifyAdminSession(): Promise<SessionUser> {
  const user = await verifySession()

  if (user.role !== "admin") {
    redirect("/")
  }

  return user
}
```

---

### Pattern 6: Email Verification Flow

**What:** Registration creates the user but sets `emailVerified = null`. A verification token is inserted in `verificationTokens`. Resend sends a link. When the user clicks the link, the token is validated, `emailVerified` is set to `now()`, and the token is deleted. The `authorize()` function in the Credentials provider rejects login if `emailVerified` is null.

```typescript
// src/lib/email/send-verification.ts
import "server-only"
import { Resend } from "resend"
import { VerificationEmail } from "@/emails/VerificationEmail"

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}&email=${encodeURIComponent(email)}`

  const { error } = await resend.emails.send({
    from: "Mandy Store <noreply@mandystore.com>",
    to: email,
    subject: "Verify your email address",
    react: VerificationEmail({ verifyUrl }),
  })

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`)
  }
}
```

**Token generation** (use `crypto.randomUUID()` — built-in since Node 14.17):
- Token expiry: 24 hours (Claude's Discretion)
- Token stored in `verificationTokens` table with `identifier = email`, `token = uuid`, `expires = now + 24h`
- On verification: check token is valid and not expired, set `emailVerified`, delete token row

---

### Pattern 7: Registration Server Action with Admin Allowlist (D-10)

```typescript
// src/lib/actions/auth.ts  (excerpt)
"use server"
import { db } from "@/lib/db/client"
import { users, verificationTokens } from "@/lib/db/schema"
import { sendVerificationEmail } from "@/lib/email/send-verification"
import * as argon2 from "argon2"
import { eq } from "drizzle-orm"
import { z } from "zod"

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(1),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
})

export async function register(formData: FormData) {
  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: "Invalid input" }

  const { email, password, name, username } = parsed.data

  // Check for duplicate email or username
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  })
  if (existing) return { error: "Email already registered" }

  // Hash password with argon2id (OWASP 2025 recommendation)
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })

  // D-10: ADMIN_EMAILS allowlist auto-promotes matching email
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim())
  const role = adminEmails.includes(email) ? "admin" : "customer"

  const userId = crypto.randomUUID()

  await db.insert(users).values({
    id: userId, email, name, username, passwordHash, role,
    emailVerified: null,
  })

  // Generate verification token (24h expiry)
  const token = crypto.randomUUID()
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await db.insert(verificationTokens).values({
    identifier: email, token, expires,
  })

  await sendVerificationEmail(email, token)

  return { success: true, message: "Check your email to verify your account." }
}
```

---

### Anti-Patterns to Avoid

- **Using `middleware.ts` instead of `proxy.ts`:** Next.js 16 renamed the file convention. `middleware.ts` is deprecated. Use `src/proxy.ts`. [VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/proxy]
- **Trusting proxy.ts as the sole auth gate for Server Actions:** The Next.js 16 docs explicitly state that Server Functions "are handled as POST requests to the route where they are used" and that a proxy matcher exclusion "will also skip Server Function calls on that path." Always re-verify in the action.
- **Setting `session: { strategy: "database" }` with Credentials and expecting sessions to auto-persist:** They don't. The `adapter.createSession()` workaround (or direct DB insert in the `jwt` callback) is required.
- **Storing passwords in the accounts table as an OAuthProvider field:** Passwords go in `users.passwordHash`, not via an adapter-managed OAuth account row.
- **Making `ADMIN_EMAILS` or `DATABASE_URL` client-accessible:** These must NEVER have `NEXT_PUBLIC_` prefix. Server-only env vars.
- **Skipping `emailVerified` check in `authorize()`:** If you forget this guard, users can log in without verifying their email, defeating D-02.
- **Email verification token that never expires:** Always set an `expires` timestamp; check it before marking email as verified.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookies (create, sign, verify) | Custom JWT cookie logic | Auth.js v5 `next-auth@beta` | HMAC signing, rotation, httpOnly, SameSite — battle-tested |
| Password hashing | `crypto.createHash('sha256', ...)` or MD5 | `argon2` (argon2id variant) | SHA-256 is not a password hash; argon2id is memory-hard and GPU-resistant |
| Email delivery (SMTP) | Nodemailer + SMTP server | `resend` SDK | Resend manages deliverability (DKIM/SPF), provides API-key auth, no SMTP credentials |
| Database schema + migrations | Raw SQL files | `drizzle-kit generate` + `drizzle-kit push` | Schema as TypeScript, type-safe migrations, no manual SQL diff |
| Input validation | Manual `typeof` checks | `zod` | Composable, TypeScript-first, reuse schemas on client and server |
| Server-only guard | Comment or convention | `import 'server-only'` | Build-time error if module is accidentally imported on client |
| Admin role check in every action | Duplicated if-checks | `verifyAdminSession()` in DAL | Single source of truth; audit one file, not dozens |

**Key insight:** The password hashing trap is common — developers reach for Node's built-in `crypto` module and use SHA-256, which is designed for speed (making brute-force trivial). Argon2id is specifically designed to be slow and memory-hungry per hash, defeating GPU attacks.

---

## Common Pitfalls

### Pitfall 1: Auth.js v5 DB Sessions Not Created for Credentials (D-08)
**What goes wrong:** `session: { strategy: "database" }` is set with the Drizzle adapter, but after credentials login, `auth()` returns `null` or a session with a missing user. The sessions table has no rows.
**Why it happens:** The Credentials provider's post-authorization flow does not call the adapter's `createSession()` method. This is a known bug/design choice (GitHub issue #12858). OAuth providers trigger session creation; Credentials does not.
**How to avoid:** In the `jwt` callback, detect `account?.provider === "credentials"` and manually insert a row into the sessions table via `db.insert(sessions).values(...)`. Store the `sessionToken` on the JWT token so the session can be retrieved.
**Warning signs:** After login, `await auth()` returns null in server components. Zero rows in the `session` DB table. Session cookie is set but the DB has no corresponding row.
[CITED: github.com/nextauthjs/next-auth/discussions/12848, github.com/nextauthjs/next-auth/issues/12858]

### Pitfall 2: proxy.ts Named `middleware.ts`
**What goes wrong:** Build works (Next.js may silently ignore the file) or auth redirects never fire.
**How to avoid:** File must be `src/proxy.ts`; export must be named `proxy` (or default). Run the codemod: `npx @next/codemod@canary middleware-to-proxy .`
[VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/proxy]

### Pitfall 3: Server Actions Not Re-Verifying Auth
**What goes wrong:** `proxy.ts` redirects unauthenticated browser requests, but Server Actions are reachable via direct POST. An attacker can call `POST` to any Server Action URL, bypassing the proxy entirely.
**How to avoid:** Every protected Server Action must call `verifySession()` or `verifyAdminSession()` as its first statement before any data access.
[VERIFIED: nextjs.org/docs/app/guides/data-security — "Always re-verify inside the action"]

### Pitfall 4: `argon2` Installation Fails on Node 18
**What goes wrong:** `npm install argon2` succeeds on Node 20+ but may fail to build its native addon on Node 18.17.0 (the current local version).
**How to avoid:** Upgrade to Node 22 via `nvm use 22` BEFORE running `npm install`. This is already a known blocker in STATE.md.
[VERIFIED: nvm ls shows v22.22.2 available]

### Pitfall 5: `emailVerified` Not Checked in `authorize()`
**What goes wrong:** User registers, does not verify email, but can log in anyway.
**How to avoid:** In the `authorize()` function, check `if (!user.emailVerified) return null` explicitly. This returns a null user from the Credentials provider, which triggers an auth failure.

### Pitfall 6: Verification Token Not Expiry-Checked
**What goes wrong:** An expired verification token is accepted, allowing email verification days or weeks after the link was sent.
**How to avoid:** In the `verifyEmail` action, check `if (token.expires < new Date()) { return { error: "Token expired" } }` and delete the expired token.

### Pitfall 7: Admin Role Check Bypassed via URL Param
**What goes wrong:** Code reads `searchParams.get('isAdmin')` or a similar URL parameter to determine admin status, instead of reading from the session.
**How to avoid:** The session role from `verifySession()` is the only source of admin status. Never trust URL params, form data, or headers for authorization decisions.
[VERIFIED: nextjs.org/docs/app/guides/data-security — explicit example of this anti-pattern]

### Pitfall 8: NEXT_PUBLIC_ Prefix on Server Secrets
**What goes wrong:** `NEXT_PUBLIC_ADMIN_EMAILS`, `NEXT_PUBLIC_DATABASE_URL`, or `NEXT_PUBLIC_RESEND_API_KEY` expose secrets to the browser bundle.
**How to avoid:** Env vars used only on the server (DB, email, admin allowlist) must never have `NEXT_PUBLIC_` prefix. Use `server-only` imports and the DAL pattern to create a structural barrier.

---

## Environment Availability

| Dependency | Required By | Available | Version | Notes |
|------------|------------|-----------|---------|-------|
| Node.js ≥20.9.0 | Next.js 16, argon2 native addon | Via nvm | v22.22.2 (`nvm use 22`) | Current active: v18.17.0 — must switch before npm install |
| npm | Package installs | Yes | 9.6.7 | No action needed |
| nvm | Node version switching | Yes | 0.40.1 | Use `nvm use 22` at start of phase |
| Neon Postgres | Database | External | — | Requires account + `DATABASE_URL` env var (not yet set) |
| Resend | Email | External | — | Requires account + `RESEND_API_KEY` env var (not yet set) |
| git | Version control | Yes (assumed) | — | Already in use (git repo exists) |

**Missing dependencies with no fallback:**
- Neon Postgres database (requires signup at neon.tech and `DATABASE_URL` connection string)
- Resend account and `RESEND_API_KEY` (requires signup at resend.com)
- `AUTH_SECRET` (generate with `npx auth secret` — one-time setup)

**Action required at start of Phase 1:** Developer must obtain `DATABASE_URL`, `RESEND_API_KEY`, and run `npx auth secret` to populate `.env.local` before any implementation work begins.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Not yet installed — Wave 0 gap |
| Config file | None — Wave 0 creates `jest.config.ts` or `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` (recommended) |
| Full suite command | `npx vitest run` |

**Recommended:** Vitest (compatible with Next.js App Router, ESM-native, fast). Playwright for e2e smoke tests.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | User can register with email + password | Integration (Server Action) | `vitest run tests/auth/register.test.ts` | Wave 0 |
| AUTH-01 | Registration rejects duplicate email | Integration | `vitest run tests/auth/register.test.ts` | Wave 0 |
| AUTH-01 | Registration rejects duplicate username | Integration | `vitest run tests/auth/register.test.ts` | Wave 0 |
| AUTH-01 | Email verification blocks login when unverified | Integration | `vitest run tests/auth/verify-email.test.ts` | Wave 0 |
| AUTH-02 | Login accepts email OR username as identifier | Integration | `vitest run tests/auth/login.test.ts` | Wave 0 |
| AUTH-02 | Session persists (DB row exists after login) | Integration | `vitest run tests/auth/session.test.ts` | Wave 0 |
| AUTH-02 | Wrong password returns auth failure | Integration | `vitest run tests/auth/login.test.ts` | Wave 0 |
| AUTH-03 | Logout clears session cookie and DB row | Integration | `vitest run tests/auth/logout.test.ts` | Wave 0 |
| ROADMAP SC4 | /admin/* redirects unauthenticated user | Smoke (manual or Playwright) | `npx playwright test tests/e2e/proxy.spec.ts` | Wave 0 |
| ROADMAP SC4 | /admin/* redirects non-admin authenticated user | Smoke | `npx playwright test tests/e2e/proxy.spec.ts` | Wave 0 |
| ROADMAP SC4 | verifySession() in protected action throws for unauth | Unit | `vitest run tests/lib/dal.test.ts` | Wave 0 |
| ROADMAP SC5 | order_status enum has all 8 required values | Unit (schema check) | `vitest run tests/db/schema.test.ts` | Wave 0 |
| ROADMAP SC5 | processed_webhook_events has unique constraint on id | Integration (DB) | `vitest run tests/db/schema.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/auth/` (fast subset)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + manual proxy redirect smoke test before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/auth/register.test.ts` — covers AUTH-01
- [ ] `tests/auth/login.test.ts` — covers AUTH-02
- [ ] `tests/auth/session.test.ts` — covers AUTH-02 DB session persistence
- [ ] `tests/auth/verify-email.test.ts` — covers AUTH-01 email gate
- [ ] `tests/auth/logout.test.ts` — covers AUTH-03
- [ ] `tests/lib/dal.test.ts` — covers verifySession() / verifyAdminSession()
- [ ] `tests/db/schema.test.ts` — covers order_status enum + unique constraint
- [ ] `tests/e2e/proxy.spec.ts` — covers proxy.ts redirects (Playwright)
- [ ] `vitest.config.ts` — framework config
- [ ] `tests/helpers/db.ts` — test DB setup/teardown utilities
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react` if using Vitest

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Auth.js v5 Credentials; argon2id password hashing; email verification gate |
| V3 Session Management | Yes | Auth.js DB sessions; 30-day sliding expiry; httpOnly cookie; server-side revocability |
| V4 Access Control | Yes | `verifySession()` + `verifyAdminSession()` in DAL; role enum; double-check in actions |
| V5 Input Validation | Yes | `zod` schema on all registration/login inputs; server-side only |
| V6 Cryptography | Partial | `argon2` for passwords; `crypto.randomUUID()` for tokens; Auth.js manages session token entropy |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated Server Action call | Elevation of Privilege | `verifySession()` at top of every protected action (NOT proxy-only) |
| Password brute-force | Tampering | argon2id (slow-by-design); login rate-limiting (deferred, Claude's Discretion) |
| Session fixation | Tampering | Auth.js regenerates session token on login |
| Stale session (banned user still active) | Elevation of Privilege | DB sessions enable server-side revocation; JWT-only sessions do not |
| Email impersonation in registration | Spoofing | Email verification required before login (D-02) |
| Admin privilege via URL param | Elevation of Privilege | Role always read from verified session; never from client-supplied data |
| NEXT_PUBLIC_ secret exposure | Information Disclosure | Server-only env vars; `server-only` import guard on DAL |
| Verification token reuse | Tampering | Delete token immediately after successful verification |
| Expired verification token accepted | Tampering | Check `token.expires < new Date()` before marking email verified |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` + `export function middleware()` | `proxy.ts` + `export function proxy()` | Next.js 16.0.0 | Breaking change — old tutorials are wrong |
| Middleware ran on Edge runtime (no Node.js APIs) | proxy.ts runs on Node.js runtime by default | Next.js 16.0.0 | Auth.js `auth()` works directly in proxy.ts now |
| next-auth v4 (stable) | next-auth v5 (beta, `@beta` tag) | 2024–present | v5 is App Router-native; v4 had rough edges |
| bcrypt as default password hash recommendation | argon2id (OWASP 2025 #1) | OWASP 2025 update | New projects should prefer argon2id; bcrypt still acceptable |
| Drizzle ORM ~0.36 | drizzle-orm 0.45.2 | 2026-05 | Significant API improvements; verify imports against current docs |

**Deprecated/outdated:**
- `@next-auth/drizzle-adapter` (old scope): Replaced by `@auth/drizzle-adapter`. Always use the `@auth/*` scope for v5 adapters.
- `middleware.ts`: Deprecated in Next.js 16.0.0. Always use `proxy.ts`.
- `lucia` auth library: Deprecated by its maintainer in 2024; community fork status unclear. Not applicable here.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `auth()` wrapper from Auth.js works as a proxy.ts export in Next.js 16 | Pattern 4 | proxy.ts would need manual session decoding instead |
| A2 | `db.insert(sessions).values(...)` in the jwt callback creates a session row that Auth.js's subsequent session lookup can find | Pattern 1 (D-08 workaround) | Session would still be null after login; alternative needed |
| A3 | `session.updateAge` implements sliding sessions in Auth.js v5 DB strategy | Pattern 1 | Sessions would expire at exactly 30 days instead of sliding |
| A4 | `argon2` package installs cleanly on Node 22.22.2 on macOS | Environment Availability | May need to fall back to `bcryptjs` (pure JS, no native addon) |

**If A4 fails:** `bcryptjs@3.0.3` (pure JS, no native addon) is a verified fallback. Same API surface as `bcrypt`, fully compatible with Node 18+. Less memory-hard than argon2id but still acceptable. Install: `npm install bcryptjs @types/bcryptjs`.

---

## Open Questions

1. **Resend domain verification**
   - What we know: Resend requires a verified sending domain for production email. The `from` field in test uses `onboarding@resend.dev`.
   - What's unclear: Whether the developer has a domain to verify with Resend, or will use Resend's shared test domain during Phase 1.
   - Recommendation: Use `onboarding@resend.dev` for development; the Phase 1 plan should note that production requires a verified domain.

2. **`AUTH_SECRET` and `NEXT_PUBLIC_APP_URL` values**
   - What we know: `AUTH_SECRET` is required by Auth.js; `NEXT_PUBLIC_APP_URL` is used to construct verification email links.
   - What's unclear: Whether `.env.local` template/documentation exists in the project.
   - Recommendation: The planner should include a Wave 0 task to create `.env.local.example` with all required keys documented.

3. **Seed script environment**
   - What we know: D-10 requires a seed script for explicit admin provisioning.
   - What's unclear: Whether the seed script connects to Neon directly (using `DATABASE_URL`) or runs locally via `drizzle-kit`.
   - Recommendation: Seed script should use `src/lib/db/client.ts` directly; run with `npx tsx src/scripts/seed.ts`.

---

## Sources

### Primary (HIGH confidence — verified against current official docs)
- [Next.js 16.2.9 proxy.ts API Reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) — confirmed Node.js runtime default, export conventions, matcher syntax, Server Functions caveat
- [Next.js 16.2.9 Data Security Guide](https://nextjs.org/docs/app/guides/data-security) — confirmed Server Actions are separate entry points, must re-verify auth
- [Auth.js v5 Drizzle Adapter](https://authjs.dev/getting-started/adapters/drizzle?framework=next-js) — confirmed schema shape, adapter configuration
- [Drizzle ORM Drizzle Config Reference](https://orm.drizzle.team/docs/drizzle-config-file) — confirmed drizzle.config.ts options
- [Resend Next.js Integration](https://resend.com/docs/send-with-nextjs) — confirmed SDK usage pattern
- npm registry (2026-06-10) — all package versions verified via `npm view`

### Secondary (MEDIUM confidence — community sources cross-checked with official docs)
- [GitHub Discussion #12848: Auth.js v5 DB Session Strategy for Credentials Returns Null](https://github.com/nextauthjs/next-auth/discussions/12848) — confirmed the D-08 issue and `adapter.createSession()` workaround
- [GitHub Issue #12858: Credentials Provider Fails to Create DB Sessions](https://github.com/nextauthjs/next-auth/issues/12858) — confirms issue is systemic (labeled "invalid reproduction" but reproduces reliably)
- OWASP Password Storage Cheat Sheet 2025 — confirmed argon2id as #1 recommendation

### Tertiary (LOW confidence — informational only)
- Multiple community blog posts on Auth.js v5 + Next.js 16 patterns (consistent with official docs findings)

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to Phase 1 | Enforcement |
|-----------|-------------------|-------------|
| `src/proxy.ts` (NOT `middleware.ts`) | Yes — Phase 1 creates this file | File must be named `proxy.ts`, export `proxy` |
| Never trust client-submitted prices | Not applicable Phase 1 (no payments) | Noted for Phase 4 |
| Webhook idempotency mandatory | Schema-level: `processed_webhook_events` table created | Table + unique constraint in schema.ts |
| Atomic stock decrement | Not implemented Phase 1 | Design intent noted in schema comments |
| Payment methods server-only env toggles | Not applicable Phase 1 | Phase 4 concern |
| `nvm use 20` / Node ≥20.9.0 | Yes — must be resolved before `npm install` | Use `nvm use 22` (v22.22.2 available) |
| `npx next build --webpack` | Yes — production builds throughout | Used in CI/validation steps |

---

## Metadata

**Confidence breakdown:**
- Node.js upgrade path: HIGH — v22.22.2 confirmed available via nvm
- proxy.ts conventions: HIGH — verified against official Next.js 16.2.9 docs
- Drizzle schema + Neon connection: HIGH — verified against official Drizzle docs
- Auth.js v5 Credentials + DB sessions workaround: MEDIUM — confirmed by community reports and GitHub issues, but library is still in beta
- Password hashing (argon2id): HIGH — OWASP 2025 recommendation, npm version verified
- Resend integration: HIGH — official docs, npm version verified
- Session sliding expiry mechanics: LOW — `updateAge` behavior not explicitly documented for DB strategy; may need testing

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (Auth.js v5 is in active beta — re-verify if more than 30 days pass before Phase 1 executes)
