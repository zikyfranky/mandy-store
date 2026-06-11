// tests/auth/session.test.ts
// Covers: AUTH-02 — DB-backed, server-side-revocable sessions for the Credentials
// provider (D-06, D-07, D-08).
//
// REGRESSION GUARD (the bug these tests now catch):
// The original config used `session.strategy: "database"` with a Credentials provider.
// @auth/core's assertConfig REJECTS that combination (UnsupportedStrategy → HTTP 500 on
// /api/auth/callback/credentials) BEFORE authorize() runs. The previous version of this
// test mocked @/lib/auth entirely and asserted on a hand-written db.insert(sessions) —
// so it passed even though real login was 100% broken.
//
// These tests instead import the REAL authConfig and:
//   1. Assert session.strategy === "jwt" (the only value that lets Credentials run).
//      The contradictory database+credentials state can no longer pass silently.
//   2. Exercise the real jwt.encode/decode session bridge against the live DB, which is
//      exactly the code path Auth.js invokes on sign-in and on every session read:
//        - encode() on sign-in creates ONE DB session row (D-06)
//        - encode() on refresh REUSES the same row (no leak)
//        - decode() resolves the opaque token → user + role
//        - a deleted/expired row decodes to null (server-side revocability — D-06)
//
// NOTE: The full HTTP signIn → cookie → auth() round trip (and proxy redirects) is
// verified by the Playwright e2e (tests/e2e/proxy.spec.ts) and was manually verified
// against the live dev server during the D-08 fix. Vitest cannot spin up the Next.js
// HTTP/cookie context, so the encode/decode bridge is tested directly here.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateAuthTables, getDb } from "../helpers/db"

// @/lib/auth transitively pulls a module guarded by `import "server-only"`; stub it
// so the real config can be imported under the node test environment.
vi.mock("server-only", () => ({}))

// Don't send real verification emails during register-based seeding.
vi.mock("@/lib/email/send-verification", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}))

const skip = !hasDatabase

// Helper: seed a verified user and return its id.
async function seedVerifiedUser(opts: {
  email: string
  username: string
  password: string
  name: string
}): Promise<string> {
  const { register, verifyEmail } = await import("@/lib/actions/auth")
  const db = await getDb()
  const { users, verificationTokens } = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")

  const fd = new FormData()
  fd.set("email", opts.email)
  fd.set("password", opts.password)
  fd.set("name", opts.name)
  fd.set("username", opts.username)
  await register(fd)

  const tokenRow = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.identifier, opts.email),
  })
  await verifyEmail(tokenRow!.token, opts.email)

  const user = await db.query.users.findFirst({
    where: eq(users.email, opts.email),
  })
  return user!.id
}

describe("auth config — credentials/session-strategy contract (D-08 regression guard)", () => {
  it("session.strategy MUST be 'jwt' (database+credentials throws UnsupportedStrategy)", async () => {
    const { authConfig } = await import("@/lib/auth")
    // This is the single assertion that would have caught the 500 at build/test time.
    expect(authConfig.session.strategy).toBe("jwt")
  })

  it("declares a Credentials provider with an authorize() handler", async () => {
    const { authConfig } = await import("@/lib/auth")
    const provider = authConfig.providers[0] as { type?: string; authorize?: unknown }
    // @auth/core also requires authorize() to exist for credentials.
    expect(typeof provider.authorize).toBe("function")
  })

  it("declares jwt.encode and jwt.decode overrides (the DB-session bridge)", async () => {
    const { authConfig } = await import("@/lib/auth")
    expect(typeof authConfig.jwt?.encode).toBe("function")
    expect(typeof authConfig.jwt?.decode).toBe("function")
  })

  it("session maxAge is 30 days (D-07)", async () => {
    const { authConfig } = await import("@/lib/auth")
    expect(authConfig.session.maxAge).toBe(30 * 24 * 60 * 60)
  })
})

describe("database session bridge — encode/decode against live DB (D-06)", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateAuthTables()
  })

  it.skipIf(skip)(
    "jwt.encode creates exactly ONE DB session row on sign-in (D-06)",
    async () => {
      const userId = await seedVerifiedUser({
        email: "encode@example.com",
        username: "encodeuser",
        password: "password123",
        name: "Encode User",
      })

      const { authConfig } = await import("@/lib/auth")
      const db = await getDb()
      const { sessions } = await import("@/lib/db/schema")

      // Simulate sign-in: jwt callback stashed id/role; encode mints the row.
      const cookieValue = await authConfig.jwt!.encode!({
        token: { id: userId, sub: userId, role: "customer" },
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })

      // Cookie value is an opaque UUID (DB session token), NOT a signed JWT.
      expect(cookieValue).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )

      const rows = await db.select().from(sessions)
      expect(rows).toHaveLength(1)
      expect(rows[0].sessionToken).toBe(cookieValue)
      expect(rows[0].userId).toBe(userId)
      // D-07: ~30 days out
      const diff = rows[0].expires.getTime() - Date.now()
      expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000)
      expect(diff).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 5000)
    },
  )

  it.skipIf(skip)(
    "jwt.encode REUSES the existing sessionToken on refresh (no row leak)",
    async () => {
      const userId = await seedVerifiedUser({
        email: "reuse@example.com",
        username: "reuseuser",
        password: "password123",
        name: "Reuse User",
      })

      const { authConfig } = await import("@/lib/auth")
      const db = await getDb()
      const { sessions } = await import("@/lib/db/schema")

      // Sign-in
      const first = await authConfig.jwt!.encode!({
        token: { id: userId, sub: userId, role: "customer" },
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })

      // Read-refresh: token now carries sessionToken (as decode() would return).
      const refreshed = await authConfig.jwt!.encode!({
        token: { id: userId, sub: userId, role: "customer", sessionToken: first },
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })

      expect(refreshed).toBe(first) // same opaque token
      const rows = await db.select().from(sessions)
      expect(rows).toHaveLength(1) // NOT 2 — no leak
    },
  )

  it.skipIf(skip)(
    "jwt.decode resolves the opaque token to the user + role",
    async () => {
      const userId = await seedVerifiedUser({
        email: "decode@example.com",
        username: "decodeuser",
        password: "password123",
        name: "Decode User",
      })

      const { authConfig } = await import("@/lib/auth")
      const cookieValue = await authConfig.jwt!.encode!({
        token: { id: userId, sub: userId, role: "customer" },
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })

      const payload = await authConfig.jwt!.decode!({
        token: cookieValue as string,
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })

      expect(payload).not.toBeNull()
      expect(payload!.id).toBe(userId)
      expect(payload!.sessionToken).toBe(cookieValue)
      expect(payload!.role).toBe("customer")

      // Confirm the session callback would expose id + role.
      const session = await authConfig.callbacks!.session!({
        // @ts-expect-error partial session object for the callback under test
        session: { user: {} },
        token: payload!,
      })
      expect(session.user.id).toBe(userId)
      expect(session.user.role).toBe("customer")
    },
  )

  it.skipIf(skip)(
    "jwt.decode returns null for a revoked (deleted) session row (D-06 revocability)",
    async () => {
      const userId = await seedVerifiedUser({
        email: "revoke@example.com",
        username: "revokeuser",
        password: "password123",
        name: "Revoke User",
      })

      const { authConfig } = await import("@/lib/auth")
      const db = await getDb()
      const { sessions } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const cookieValue = (await authConfig.jwt!.encode!({
        token: { id: userId, sub: userId, role: "customer" },
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })) as string

      // Server-side revocation: delete the row while the cookie is still "valid".
      await db.delete(sessions).where(eq(sessions.sessionToken, cookieValue))

      const payload = await authConfig.jwt!.decode!({
        token: cookieValue,
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })
      // No DB row → no session. This is the entire point of DB-backed sessions.
      expect(payload).toBeNull()
    },
  )

  it.skipIf(skip)(
    "jwt.decode returns null and cleans up an expired session row",
    async () => {
      const userId = await seedVerifiedUser({
        email: "expired@example.com",
        username: "expireduser",
        password: "password123",
        name: "Expired User",
      })

      const { authConfig } = await import("@/lib/auth")
      const db = await getDb()
      const { sessions } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      // Insert an already-expired row directly.
      const sessionToken = crypto.randomUUID()
      await db.insert(sessions).values({
        sessionToken,
        userId,
        expires: new Date(Date.now() - 1000),
      })

      const payload = await authConfig.jwt!.decode!({
        token: sessionToken,
        salt: "authjs.session-token",
        secret: process.env.AUTH_SECRET!,
      })
      expect(payload).toBeNull()

      // Expired row is cleaned up.
      const row = await db.query.sessions.findFirst({
        where: eq(sessions.sessionToken, sessionToken),
      })
      expect(row).toBeUndefined()
    },
  )
})
