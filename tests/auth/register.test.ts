// tests/auth/register.test.ts
// Covers: AUTH-01 — User can register with email and password
// Integration tests against the live Neon test DB.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateAuthTables } from "../helpers/db"

// Mock sendVerificationEmail so no real emails are sent during tests
vi.mock("@/lib/email/send-verification", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock next-auth/server and @/lib/auth to avoid Next.js server module resolution issues in Vitest
vi.mock("@/lib/auth", () => ({
  signIn:  vi.fn(),
  signOut: vi.fn(),
  auth:    vi.fn(),
  handlers: {},
}))

// server-only is a no-op in Node test environment
vi.mock("server-only", () => ({}))

const skip = !hasDatabase

describe("register()", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateAuthTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)(
    "creates a new user with email, password, name, and username",
    async () => {
      const { register } = await import("@/lib/actions/auth")
      const { getDb } = await import("../helpers/db")
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const formData = new FormData()
      formData.set("email", "alice@example.com")
      formData.set("password", "password123")
      formData.set("name", "Alice Smith")
      formData.set("username", "alice_smith")

      const result = await register(formData)
      expect(result).toMatchObject({ success: true })

      const db = await getDb()
      const user = await db.query.users.findFirst({
        where: eq(users.email, "alice@example.com"),
      })
      expect(user).toBeDefined()
      expect(user!.name).toBe("Alice Smith")
      expect(user!.username).toBe("alice_smith")
      expect(user!.emailVerified).toBeNull() // D-02: must verify email first
      expect(user!.passwordHash).toBeTruthy()
      expect(user!.passwordHash).not.toBe("password123") // never plaintext
    },
  )

  it.skipIf(skip)(
    "rejects registration with a duplicate email",
    async () => {
      const { register } = await import("@/lib/actions/auth")

      const formData1 = new FormData()
      formData1.set("email", "duplicate@example.com")
      formData1.set("password", "password123")
      formData1.set("name", "First User")
      formData1.set("username", "firstuser")

      await register(formData1)

      const formData2 = new FormData()
      formData2.set("email", "duplicate@example.com")
      formData2.set("password", "password456")
      formData2.set("name", "Second User")
      formData2.set("username", "seconduser")

      const result = await register(formData2)
      expect(result).toMatchObject({ error: expect.stringContaining("Email") })
    },
  )

  it.skipIf(skip)(
    "rejects registration with a duplicate username",
    async () => {
      const { register } = await import("@/lib/actions/auth")

      const formData1 = new FormData()
      formData1.set("email", "user1@example.com")
      formData1.set("password", "password123")
      formData1.set("name", "User One")
      formData1.set("username", "takenusername")

      await register(formData1)

      const formData2 = new FormData()
      formData2.set("email", "user2@example.com")
      formData2.set("password", "password456")
      formData2.set("name", "User Two")
      formData2.set("username", "takenusername") // same username

      const result = await register(formData2)
      expect(result).toMatchObject({ error: expect.stringContaining("Username") })
    },
  )

  it.skipIf(skip)(
    "sends a verification email after successful registration",
    async () => {
      const { sendVerificationEmail } = await import("@/lib/email/send-verification")
      const { register } = await import("@/lib/actions/auth")

      const formData = new FormData()
      formData.set("email", "verify@example.com")
      formData.set("password", "password123")
      formData.set("name", "Verify User")
      formData.set("username", "verifyuser")

      await register(formData)

      expect(sendVerificationEmail).toHaveBeenCalledOnce()
      expect(sendVerificationEmail).toHaveBeenCalledWith(
        "verify@example.com",
        expect.any(String),
      )
    },
  )

  it.skipIf(skip)(
    "auto-promotes matching ADMIN_EMAILS to admin role (D-10)",
    async () => {
      const { register } = await import("@/lib/actions/auth")
      const { getDb } = await import("../helpers/db")
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      // Set the env var before calling register
      const original = process.env.ADMIN_EMAILS
      process.env.ADMIN_EMAILS = "admin@example.com,isaac@leisurepay.io"

      try {
        const formData = new FormData()
        formData.set("email", "admin@example.com")
        formData.set("password", "password123")
        formData.set("name", "Admin User")
        formData.set("username", "adminuser")

        const result = await register(formData)
        expect(result).toMatchObject({ success: true })

        const db = await getDb()
        const user = await db.query.users.findFirst({
          where: eq(users.email, "admin@example.com"),
        })
        expect(user!.role).toBe("admin")
      } finally {
        process.env.ADMIN_EMAILS = original
      }
    },
  )

  it.skipIf(skip)(
    "assigns customer role to non-ADMIN_EMAILS registrants",
    async () => {
      const { register } = await import("@/lib/actions/auth")
      const { getDb } = await import("../helpers/db")
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const formData = new FormData()
      formData.set("email", "customer@example.com")
      formData.set("password", "password123")
      formData.set("name", "Customer User")
      formData.set("username", "customeruser")

      await register(formData)

      const db = await getDb()
      const user = await db.query.users.findFirst({
        where: eq(users.email, "customer@example.com"),
      })
      expect(user!.role).toBe("customer")
    },
  )

  it.skipIf(skip)(
    "rejects invalid/weak input with a zod validation error",
    async () => {
      const { register } = await import("@/lib/actions/auth")

      // Password too short
      const formData = new FormData()
      formData.set("email", "valid@example.com")
      formData.set("password", "short") // less than 8 chars
      formData.set("name", "Valid User")
      formData.set("username", "validuser")

      const result = await register(formData)
      expect(result).toMatchObject({ error: expect.any(String) })
      expect("success" in result).toBe(false)
    },
  )
})
