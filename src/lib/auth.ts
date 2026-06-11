// src/lib/auth.ts
// Auth.js v5 configuration — Credentials provider WITH database-backed, server-side
// revocable sessions (D-06), 30-day sliding expiry (D-07), email/username login (D-04),
// email-verified gate (D-02).
//
// D-08 — THE REAL FIX (supersedes the original RESEARCH Pattern 1 / Assumption A2):
// Auth.js v5's @auth/core forbids `session.strategy: "database"` together with a
// Credentials provider — `assertConfig` throws `UnsupportedStrategy: Signing in with
// credentials only supported if JWT strategy is enabled` BEFORE authorize() runs,
// returning HTTP 500 on /api/auth/callback/credentials. The previous config set
// strategy "database" and tried to insert a session row inside the `jwt` callback —
// but that callback never runs under the database strategy, so it was dead code and
// login could never succeed.
//
// The working pattern (community discussion #12848, verified against the installed
// @auth/core jwt.encode/decode + callback/session/signout action source for
// next-auth@5.0.0-beta.31) is:
//   1. Use strategy: "jwt" so the Credentials provider is permitted (passes assertConfig).
//   2. Override jwt.encode: when a credentials sign-in mints a token, create a REAL DB
//      session row via adapter.createSession() and return that row's opaque sessionToken
//      (a UUID) as the cookie value — NOT a signed JWT.
//   3. Override jwt.decode: resolve the opaque cookie value back to the DB session via
//      adapter.getSessionAndUser(). Enforce expiry (revocability — D-06), slide the
//      expiry forward (D-07), and return a token payload carrying id/role/email/expiry.
//      If the row is gone or expired, return null → no session (server-side revocable).
//   4. session callback: populate session.user.{id,role} from that token payload.
//   5. events.signOut: delete the DB session row (jwt-strategy signOut only clears the
//      cookie; the adapter is NOT auto-called) so logout is truly revocable.
//
// Net effect: credentials login produces a persisted, server-side-revocable Postgres
// session row — satisfying D-06 — while the Credentials provider is allowed to run.
//
// Sources:
//   - github.com/nextauthjs/next-auth/discussions/12848
//   - github.com/nextauthjs/next-auth/issues/12858
//   - authjs.dev (jwt encode/decode advanced option)
//   - installed @auth/core source (assert.js, actions/callback, actions/session, actions/signout)

import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/lib/db/client"
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema"
import * as argon2 from "argon2"
import { eq, or } from "drizzle-orm"

// Ensure the type augmentation is picked up
import "@/types/auth"

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60 // D-07: 30 days
const SLIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // refresh the row at most once/24h

// The Drizzle adapter — also used directly inside encode/decode to read/write
// the sessions table (createSession / getSessionAndUser / deleteSession).
const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
})

// Exported as a standalone object so tests can assert on the contradictory-config
// guard (session.strategy MUST be "jwt" for Credentials) and exercise the
// encode/decode session-bridge directly against the DB. See tests/auth/session.test.ts.
export const authConfig = {
  adapter,
  // D-08: Credentials REQUIRES "jwt" strategy or @auth/core throws UnsupportedStrategy.
  // The encode/decode overrides below back this "jwt" cookie with a real DB session row.
  session: {
    strategy: "jwt",
    maxAge: THIRTY_DAYS_SECONDS,
    updateAge: 24 * 60 * 60, // sliding refresh cadence (D-07)
  },
  // D-08 core of the fix: make the session cookie an opaque DB session token.
  jwt: {
    // Called BOTH at credentials sign-in (mint a new session) AND on every session
    // read, where the session action re-encodes to slide the cookie expiry. We must
    // distinguish the two: if the token already carries a sessionToken (set by decode()
    // on a read), REUSE it — never create a second row. Only mint a new row at sign-in.
    async encode({ token }) {
      const existing = token?.sessionToken as string | undefined
      if (existing) {
        // Read-refresh path: keep the same opaque cookie value. The DB row's expiry
        // was already slid in decode(); do not create another session row.
        return existing
      }

      const userId = (token?.id ?? token?.sub) as string | undefined
      if (!userId) {
        // No authenticated user → no session.
        throw new Error("auth: encode called without a user id on the token")
      }
      const sessionToken = crypto.randomUUID()
      const expires = new Date(Date.now() + THIRTY_DAYS_SECONDS * 1000)

      // D-06: persist a real, server-side-revocable session row (sign-in only).
      await adapter.createSession!({ sessionToken, userId, expires })

      // The cookie value IS the opaque DB session token (not a JWT).
      return sessionToken
    },
    // Called by the session-read and sign-out actions with the cookie value.
    // Resolve the opaque token back to the DB session; enforce + slide expiry.
    async decode({ token: sessionToken }) {
      if (!sessionToken) return null

      const result = await adapter.getSessionAndUser!(sessionToken as string)
      if (!result) return null // revoked/unknown → no session (D-06 revocability)

      const { session, user } = result

      // Expired → clean up and reject.
      if (session.expires.valueOf() < Date.now()) {
        await adapter.deleteSession!(sessionToken as string)
        return null
      }

      // D-07: sliding expiry — extend the row at most once per SLIDE_THRESHOLD_MS.
      const remaining = session.expires.valueOf() - Date.now()
      if (remaining < THIRTY_DAYS_SECONDS * 1000 - SLIDE_THRESHOLD_MS) {
        await adapter.updateSession!({
          sessionToken: sessionToken as string,
          expires: new Date(Date.now() + THIRTY_DAYS_SECONDS * 1000),
        })
      }

      // Return a token payload the session callback can read. Carry the opaque
      // sessionToken so encode-on-refresh and events.signOut can act on the row.
      return {
        sessionToken: sessionToken as string,
        id: user.id,
        sub: user.id,
        role: (user as { role?: string }).role ?? "customer",
        name: user.name,
        email: user.email,
        picture: (user as { image?: string | null }).image ?? null,
      }
    },
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
        const password   = credentials.password as string

        // Look up user by email OR username (D-04)
        const user = await db.query.users.findFirst({
          where: or(
            eq(users.email, identifier),
            eq(users.username, identifier),
          ),
        })

        if (!user || !user.passwordHash) return null

        // Email must be verified before login is allowed (D-02, RESEARCH Pitfall 5)
        if (!user.emailVerified) return null

        const passwordValid = await argon2.verify(user.passwordHash, password)
        if (!passwordValid) return null

        return {
          id:    user.id,
          email: user.email,
          name:  user.name,
          role:  user.role,
        }
      },
    }),
  ],
  callbacks: {
    // Runs on sign-in (with `user`) and on every session read (with the decoded token).
    // On sign-in, stash id/role so encode() can create the DB session row for this user.
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id
        token.sub  = user.id
        token.role = (user as { role?: string }).role ?? "customer"
      }
      return token
    },
    // Populate the public session object from the token payload produced by decode().
    async session({ session, token }) {
      if (token) {
        session.user.id   = (token.id ?? token.sub) as string
        session.user.role = ((token.role as "customer" | "admin") ?? "customer")
      }
      return session
    },
  },
  events: {
    // jwt-strategy signOut only clears the cookie — the adapter is NOT auto-called.
    // Delete the DB session row so logout is server-side revocable (D-06).
    async signOut(message) {
      const sessionToken =
        "token" in message
          ? (message.token?.sessionToken as string | undefined)
          : undefined
      if (sessionToken) {
        await adapter.deleteSession!(sessionToken)
      }
    },
  },
  pages: {
    signIn: "/account/login",
    error:  "/account/login",
  },
} satisfies Parameters<typeof NextAuth>[0]

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
