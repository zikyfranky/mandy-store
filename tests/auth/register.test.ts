// tests/auth/register.test.ts
// Covers: AUTH-01 — User can register with email and password
// Integration tests against the live Neon test DB.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateAuthTables, truncateOrderTables } from "../helpers/db"

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
    await truncateOrderTables() // orders reference users(id) — clear before auth tables (D-06 claim tests)
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
    "still succeeds (does NOT 500) when the verification email fails to send",
    async () => {
      // Regression: register() must not crash when Resend is misconfigured/unreachable
      // (e.g. RESEND_API_KEY unset on the server). The account is already created; a mail
      // failure degrades to a softer success message, never an unhandled throw.
      const { sendVerificationEmail } = await import("@/lib/email/send-verification")
      vi.mocked(sendVerificationEmail).mockRejectedValueOnce(
        new Error("RESEND_API_KEY is not configured — cannot send verification email"),
      )

      const { register } = await import("@/lib/actions/auth")
      const { getDb } = await import("../helpers/db")
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const formData = new FormData()
      formData.set("email", "mailfail@example.com")
      formData.set("password", "password123")
      formData.set("name", "Mail Fail")
      formData.set("username", "mail_fail")

      const result = await register(formData)
      // Does not throw; returns success with the degraded message
      expect(result).toMatchObject({ success: true })
      expect((result as { message: string }).message).toMatch(/couldn't send the verification email/i)

      // The user was still created (account exists, just unverified)
      const db = await getDb()
      const user = await db.query.users.findFirst({ where: eq(users.email, "mailfail@example.com") })
      expect(user).toBeDefined()
      expect(user!.emailVerified).toBeNull()
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

  // ─── D-06: best-effort guest-order claim on register (Phase 6, AUTH-04) ──────

  async function insertGuestOrder(guestToken: string, userId: string | null) {
    const { db } = await import("@/lib/db/client")
    const { orders } = await import("@/lib/db/schema")
    const orderId = crypto.randomUUID()
    await db.insert(orders).values({
      id: orderId,
      reference: "MS-CLAIM-" + orderId.slice(0, 6),
      guestToken,
      status: "awaiting_bank_transfer",
      userId,
      customerEmail: "guest@example.com",
      subtotalKobo: 1_000_000,
      shippingKobo: 200_000,
      totalKobo: 1_200_000,
      shippingName: "Guest",
      shippingPhone: "08000000000",
      shippingStreet: "1 Test St",
      shippingCity: "Lagos",
      shippingState: "Lagos",
    })
    return orderId
  }

  it.skipIf(skip)(
    "claims the guest order when register() is given a valid, unclaimed orderToken",
    async () => {
      const { register } = await import("@/lib/actions/auth")
      const { getDb } = await import("../helpers/db")
      const { users, orders } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const tok = "c".repeat(64)
      const orderId = await insertGuestOrder(tok, null)

      const formData = new FormData()
      formData.set("email", "claimer@example.com")
      formData.set("password", "password123")
      formData.set("name", "Claim User")
      formData.set("username", "claimuser")
      formData.set("orderToken", tok)

      const result = await register(formData)
      expect(result).toMatchObject({ success: true })

      const db = await getDb()
      const newUser = await db.query.users.findFirst({ where: eq(users.email, "claimer@example.com") })
      const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
      expect(order!.userId).toBe(newUser!.id) // order now linked to the new account
    },
  )

  it.skipIf(skip)(
    "does not reassign an already-claimed orderToken and still succeeds",
    async () => {
      const { register } = await import("@/lib/actions/auth")
      const { getDb } = await import("../helpers/db")
      const { users, orders } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      // Pre-existing owner
      const ownerId = crypto.randomUUID()
      const db0 = await getDb()
      await db0.insert(users).values({ id: ownerId, email: "owner@example.com", name: "Owner", username: "owner_x" })

      const tok = "d".repeat(64)
      const orderId = await insertGuestOrder(tok, ownerId) // already claimed by owner

      const formData = new FormData()
      formData.set("email", "attacker@example.com")
      formData.set("password", "password123")
      formData.set("name", "Attacker")
      formData.set("username", "attacker_x")
      formData.set("orderToken", tok)

      const result = await register(formData)
      expect(result).toMatchObject({ success: true }) // registration still succeeds

      const db = await getDb()
      const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
      expect(order!.userId).toBe(ownerId) // UNCHANGED — not reassigned
    },
  )

  it.skipIf(skip)(
    "still succeeds when the orderToken is missing/garbage (best-effort, never blocks)",
    async () => {
      const { register } = await import("@/lib/actions/auth")

      const formData = new FormData()
      formData.set("email", "garbagetoken@example.com")
      formData.set("password", "password123")
      formData.set("name", "Garbage Token")
      formData.set("username", "garbage_tok")
      formData.set("orderToken", "garbage-not-a-real-token")

      const result = await register(formData)
      expect(result).toMatchObject({ success: true })
    },
  )
})
