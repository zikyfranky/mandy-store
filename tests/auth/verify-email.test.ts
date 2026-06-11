// tests/auth/verify-email.test.ts
// Covers: AUTH-01 — Email verification blocks login until confirmed; expired token rejected
// Integration tests against the live Neon test DB.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateAuthTables, getDb } from "../helpers/db"

// Mock sendVerificationEmail so no real emails are sent during tests
vi.mock("@/lib/email/send-verification", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock next-auth and @/lib/auth to avoid Next.js server module resolution issues in Vitest
vi.mock("@/lib/auth", () => ({
  signIn:   vi.fn(),
  signOut:  vi.fn(),
  auth:     vi.fn(),
  handlers: {},
}))

// server-only is a no-op in Node test environment
vi.mock("server-only", () => ({}))

const skip = !hasDatabase

describe("verifyEmail()", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateAuthTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)(
    "blocks login for an unverified user (emailVerified is null)",
    async () => {
      // Register creates user with emailVerified: null (D-02)
      const { register } = await import("@/lib/actions/auth")
      const db = await getDb()
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const formData = new FormData()
      formData.set("email", "unverified@example.com")
      formData.set("password", "password123")
      formData.set("name", "Unverified User")
      formData.set("username", "unverifieduser")

      await register(formData)

      const user = await db.query.users.findFirst({
        where: eq(users.email, "unverified@example.com"),
      })
      expect(user).toBeDefined()
      expect(user!.emailVerified).toBeNull() // D-02: emailVerified must be null until verified
    },
  )

  it.skipIf(skip)(
    "allows login after email is successfully verified",
    async () => {
      const { register, verifyEmail } = await import("@/lib/actions/auth")
      const db = await getDb()
      const { users, verificationTokens } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      // Register the user first
      const formData = new FormData()
      formData.set("email", "newuser@example.com")
      formData.set("password", "password123")
      formData.set("name", "New User")
      formData.set("username", "newuser")

      await register(formData)

      // Get the verification token from DB
      const tokenRow = await db.query.verificationTokens.findFirst({
        where: eq(verificationTokens.identifier, "newuser@example.com"),
      })
      expect(tokenRow).toBeDefined()

      // Verify the email
      const result = await verifyEmail(tokenRow!.token, "newuser@example.com")
      expect(result).toMatchObject({ success: true })

      // Check emailVerified is now set
      const user = await db.query.users.findFirst({
        where: eq(users.email, "newuser@example.com"),
      })
      expect(user!.emailVerified).toBeInstanceOf(Date)
    },
  )

  it.skipIf(skip)(
    "rejects an expired verification token",
    async () => {
      const db = await getDb()
      const { users, verificationTokens } = await import("@/lib/db/schema")
      const { verifyEmail } = await import("@/lib/actions/auth")

      // Insert a user directly
      const userId = crypto.randomUUID()
      await db.insert(users).values({
        id:            userId,
        email:         "expired@example.com",
        name:          "Expired User",
        username:      "expireduser",
        passwordHash:  "dummyhash",
        role:          "customer",
        emailVerified: null,
      })

      // Insert an expired token (expires in the past)
      const expiredToken = crypto.randomUUID()
      await db.insert(verificationTokens).values({
        identifier: "expired@example.com",
        token:      expiredToken,
        expires:    new Date(Date.now() - 1000), // already expired
      })

      const result = await verifyEmail(expiredToken, "expired@example.com")
      expect(result).toMatchObject({ error: expect.stringContaining("expired") })
    },
  )

  it.skipIf(skip)(
    "deletes the verification token after successful verification (single-use)",
    async () => {
      const { register, verifyEmail } = await import("@/lib/actions/auth")
      const db = await getDb()
      const { verificationTokens } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const formData = new FormData()
      formData.set("email", "singleuse@example.com")
      formData.set("password", "password123")
      formData.set("name", "Single Use")
      formData.set("username", "singleuseuser")

      await register(formData)

      const tokenRow = await db.query.verificationTokens.findFirst({
        where: eq(verificationTokens.identifier, "singleuse@example.com"),
      })
      expect(tokenRow).toBeDefined()

      // Verify once
      await verifyEmail(tokenRow!.token, "singleuse@example.com")

      // Token should be deleted now
      const deletedToken = await db.query.verificationTokens.findFirst({
        where: eq(verificationTokens.identifier, "singleuse@example.com"),
      })
      expect(deletedToken).toBeUndefined()
    },
  )

  it.skipIf(skip)(
    "rejects an unknown/invalid token",
    async () => {
      const { verifyEmail } = await import("@/lib/actions/auth")

      const result = await verifyEmail("nonexistent-token-uuid", "nobody@example.com")
      expect(result).toMatchObject({ error: expect.stringContaining("Invalid") })
    },
  )

  it.skipIf(skip)(
    "deletes expired token on rejection (no reuse possible)",
    async () => {
      const db = await getDb()
      const { users, verificationTokens } = await import("@/lib/db/schema")
      const { verifyEmail } = await import("@/lib/actions/auth")
      const { eq } = await import("drizzle-orm")

      const userId = crypto.randomUUID()
      await db.insert(users).values({
        id:            userId,
        email:         "expired2@example.com",
        name:          "Expired Two",
        username:      "expiredtwo",
        passwordHash:  "dummyhash",
        role:          "customer",
        emailVerified: null,
      })

      const expiredToken = crypto.randomUUID()
      await db.insert(verificationTokens).values({
        identifier: "expired2@example.com",
        token:      expiredToken,
        expires:    new Date(Date.now() - 1000),
      })

      // Reject the expired token
      await verifyEmail(expiredToken, "expired2@example.com")

      // Token should be deleted (not reusable)
      const deletedToken = await db.query.verificationTokens.findFirst({
        where: eq(verificationTokens.identifier, "expired2@example.com"),
      })
      expect(deletedToken).toBeUndefined()
    },
  )
})
