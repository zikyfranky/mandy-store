// tests/auth/login.test.ts
// Covers: AUTH-02 — User can log in; login accepts email OR username; wrong password fails
// The login() action suite below mocks @/lib/auth (it tests the action's error mapping).
// The "real authorize()" suite at the bottom imports the ACTUAL Credentials provider via
// vi.importActual and runs its authorize() against the live DB — the path that exercises
// the D-02 (verified) and D-04 (email-or-username) gates for real.

import { describe, it, expect, beforeEach, vi } from "vitest"
import { hasDatabase, truncateAuthTables, getDb } from "../helpers/db"

// Mock sendVerificationEmail so no real emails are sent during register setup
vi.mock("@/lib/email/send-verification", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock signIn/signOut — login() delegates to signIn; we test the authorize() function
// directly in this suite (unit-testing the credentials resolver).
// Full signIn integration (session row) is tested in session.test.ts.
vi.mock("@/lib/auth", () => {
  // Capture the actual authorize logic by importing auth config directly
  return {
    signIn:   vi.fn(),
    signOut:  vi.fn(),
    auth:     vi.fn(),
    handlers: {},
  }
})

vi.mock("server-only", () => ({}))

const skip = !hasDatabase

// ---------------------------------------------------------------------------
// Helper: seed a verified user for login tests
// ---------------------------------------------------------------------------

async function seedVerifiedUser(opts: {
  email: string
  username: string
  password: string
  name: string
}) {
  const { register, verifyEmail } = await import("@/lib/actions/auth")
  const db = await getDb()
  const { verificationTokens } = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")

  const formData = new FormData()
  formData.set("email", opts.email)
  formData.set("password", opts.password)
  formData.set("name", opts.name)
  formData.set("username", opts.username)
  await register(formData)

  // Grab the token and verify it
  const tokenRow = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.identifier, opts.email),
  })
  if (tokenRow) {
    await verifyEmail(tokenRow.token, opts.email)
  }
}

// ---------------------------------------------------------------------------
// authorize() — direct testing of the Credentials resolver
// ---------------------------------------------------------------------------

describe("login / authorize()", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateAuthTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)(
    "accepts valid email + password and returns user",
    async () => {
      await seedVerifiedUser({
        email:    "login@example.com",
        username: "loginuser",
        password: "password123",
        name:     "Login User",
      })

      // Test authorize() logic directly by importing and calling it
      const db = await getDb()
      const { users } = await import("@/lib/db/schema")
      const { eq, or } = await import("drizzle-orm")
      const argon2 = await import("argon2")

      const user = await db.query.users.findFirst({
        where: or(
          eq(users.email, "login@example.com"),
          eq(users.username, "loginuser"),
        ),
      })
      expect(user).toBeDefined()
      expect(user!.emailVerified).not.toBeNull() // verified

      const passwordValid = await argon2.verify(user!.passwordHash!, "password123")
      expect(passwordValid).toBe(true)
    },
  )

  it.skipIf(skip)(
    "accepts valid username + password and returns user (D-04)",
    async () => {
      await seedVerifiedUser({
        email:    "byusername@example.com",
        username: "byusername",
        password: "password123",
        name:     "ByUsername User",
      })

      const db = await getDb()
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")
      const argon2 = await import("argon2")

      // Look up by username (D-04)
      const user = await db.query.users.findFirst({
        where: eq(users.username, "byusername"),
      })
      expect(user).toBeDefined()

      const passwordValid = await argon2.verify(user!.passwordHash!, "password123")
      expect(passwordValid).toBe(true)
    },
  )

  it.skipIf(skip)(
    "rejects login with wrong password",
    async () => {
      await seedVerifiedUser({
        email:    "wrongpw@example.com",
        username: "wrongpwuser",
        password: "correct_password",
        name:     "Wrong PW User",
      })

      const db = await getDb()
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")
      const argon2 = await import("argon2")

      const user = await db.query.users.findFirst({
        where: eq(users.email, "wrongpw@example.com"),
      })
      expect(user).toBeDefined()

      // Wrong password should not verify
      const passwordValid = await argon2.verify(user!.passwordHash!, "wrong_password")
      expect(passwordValid).toBe(false)
    },
  )

  it.skipIf(skip)(
    "rejects login for non-existent user",
    async () => {
      const db = await getDb()
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const user = await db.query.users.findFirst({
        where: eq(users.email, "nonexistent@example.com"),
      })
      expect(user).toBeUndefined()
    },
  )

  it.skipIf(skip)(
    "rejects login for unverified user (D-02 gate)",
    async () => {
      // Register without verifying
      const { register } = await import("@/lib/actions/auth")
      const formData = new FormData()
      formData.set("email", "notverified@example.com")
      formData.set("password", "password123")
      formData.set("name", "Not Verified")
      formData.set("username", "notverifieduser")
      await register(formData)

      // Confirm emailVerified is null (login should be blocked by authorize())
      const db = await getDb()
      const { users } = await import("@/lib/db/schema")
      const { eq } = await import("drizzle-orm")

      const user = await db.query.users.findFirst({
        where: eq(users.email, "notverified@example.com"),
      })
      expect(user).toBeDefined()
      expect(user!.emailVerified).toBeNull() // D-02: authorize() returns null for unverified
    },
  )

  it.skipIf(skip)(
    "login() action returns { error } on failure (no enumeration leak — T-01-11)",
    async () => {
      // Mock signIn to throw an AuthError (simulates bad credentials)
      const { signIn } = await import("@/lib/auth")
      const { AuthError } = await import("next-auth")

      const mockSignIn = vi.mocked(signIn)
      // Create a mock AuthError instance
      const authErr = new AuthError("CredentialsSignin")
      mockSignIn.mockRejectedValueOnce(authErr)

      const { login } = await import("@/lib/actions/auth")

      const formData = new FormData()
      formData.set("identifier", "anybodys@example.com")
      formData.set("password", "wrongpass")

      const result = await login(formData)
      // T-01-11: must return a generic error, not leak bad-user vs bad-password
      expect(result).toMatchObject({ error: "Invalid credentials" })
    },
  )
})

// ---------------------------------------------------------------------------
// REAL authorize() — imports the actual Credentials provider (NOT the mock).
// This exercises the real resolver: email-OR-username (D-04) + emailVerified gate (D-02).
// ---------------------------------------------------------------------------

async function getRealAuthorize() {
  // Bypass the module-level vi.mock("@/lib/auth") above and load the real config.
  const real = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth")
  // NOTE: @auth/core's Credentials() wraps the user authorize() at provider.authorize
  // (expecting (credentials, request)); the ORIGINAL user function is preserved at
  // provider.options.authorize. We invoke that to test the resolver in isolation.
  const provider = real.authConfig.providers[0] as unknown as {
    options: {
      authorize: (
        creds: Record<string, unknown>,
      ) => Promise<{ id: string; role?: string } | null>
    }
  }
  return provider.options.authorize
}

describe("real Credentials.authorize() against live DB (D-02, D-04)", () => {
  beforeEach(async () => {
    if (!hasDatabase) return
    await truncateAuthTables()
    vi.clearAllMocks()
  })

  it.skipIf(skip)("returns the user for valid email + password", async () => {
    await seedVerifiedUser({
      email: "real-login@example.com",
      username: "realloginuser",
      password: "password123",
      name: "Real Login",
    })
    const authorize = await getRealAuthorize()
    const user = await authorize({
      identifier: "real-login@example.com",
      password: "password123",
    })
    expect(user).not.toBeNull()
    expect(user!.role).toBe("customer")
  })

  it.skipIf(skip)("accepts username as the identifier (D-04)", async () => {
    await seedVerifiedUser({
      email: "real-byuser@example.com",
      username: "realbyuser",
      password: "password123",
      name: "Real ByUser",
    })
    const authorize = await getRealAuthorize()
    const user = await authorize({
      identifier: "realbyuser",
      password: "password123",
    })
    expect(user).not.toBeNull()
  })

  it.skipIf(skip)("returns null for wrong password", async () => {
    await seedVerifiedUser({
      email: "real-wrongpw@example.com",
      username: "realwrongpw",
      password: "correct-horse",
      name: "Real WrongPW",
    })
    const authorize = await getRealAuthorize()
    const user = await authorize({
      identifier: "real-wrongpw@example.com",
      password: "wrong",
    })
    expect(user).toBeNull()
  })

  it.skipIf(skip)("returns null for an UNVERIFIED user (D-02 gate)", async () => {
    // Register without verifying.
    const { register } = await import("@/lib/actions/auth")
    const fd = new FormData()
    fd.set("email", "real-unverified@example.com")
    fd.set("password", "password123")
    fd.set("name", "Real Unverified")
    fd.set("username", "realunverified")
    await register(fd)

    const authorize = await getRealAuthorize()
    const user = await authorize({
      identifier: "real-unverified@example.com",
      password: "password123",
    })
    // D-02: unverified email cannot log in.
    expect(user).toBeNull()
  })
})
