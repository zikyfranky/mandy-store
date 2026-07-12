// WAVE 0 RED SCAFFOLD — admin-customers.test.ts stays RED until Plan 09-02 creates
// @/lib/actions/admin-customers. The unresolved top-level import below is the CORRECT
// Wave 0 red signal (mirror tests/admin/products.test.ts). Do NOT stub the module.
// tests/actions/admin-customers.test.ts
// ADMN-09 (admin-triggered password reset via one-time email link) + ADMN-10 (role
// promote/demote with self-lockout + last-admin guards). Encodes the 09-VALIDATION.md map.
// DB-gated tests run only with TEST_DATABASE_URL.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import * as argon2 from "argon2"
import { hasDatabase, getDb, truncateAuthTables } from "../helpers/db"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// D-02 pattern: admin actions re-verify via verifyAdminSession — mock @/lib/dal, not @/lib/auth.
vi.mock("@/lib/dal", () => ({ verifyAdminSession: vi.fn() }))
// D-03: the reset email seam is mocked so the action is testable without a live RESEND_API_KEY.
vi.mock("@/lib/email/send-password-reset", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}))

import { verifyAdminSession } from "@/lib/dal"
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset"

// Module does NOT exist until Plan 09-02 — intentional unresolved import (Wave 0 RED).
import {
  sendCustomerPasswordReset,
  resetPassword,
  updateCustomerRole,
  adminSetCustomerPassword,
} from "@/lib/actions/admin-customers"

const ADMIN_USER = { id: "admin-1", role: "admin" as const, email: "admin@example.com" }

async function insertUser(overrides: Record<string, unknown> = {}) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const id = (overrides.id as string) ?? crypto.randomUUID()
  await db.insert(schema.users).values({
    id,
    name: (overrides.name as string) ?? "Cust",
    email: (overrides.email as string) ?? `u-${id.slice(0, 8)}@example.com`,
    passwordHash: (overrides.passwordHash as string) ?? "old-hash",
    role: (overrides.role as "customer" | "admin") ?? "customer",
    ...overrides,
  })
  return id
}

async function getUser(id: string) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id))
  return u
}

async function getResetTokens(email: string) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const { eq } = await import("drizzle-orm")
  return db.select().from(schema.verificationTokens).where(eq(schema.verificationTokens.identifier, email))
}

beforeEach(async () => {
  if (hasDatabase) await truncateAuthTables()
  vi.mocked(verifyAdminSession).mockResolvedValue(ADMIN_USER)
})

afterEach(async () => {
  if (hasDatabase) await truncateAuthTables()
  vi.clearAllMocks()
})

// ─── admin gate (ADMN-08/09/10) ──────────────────────────────────────────────
describe("admin-customers — admin gate", () => {
  it("rejects a non-admin caller of updateCustomerRole (verifyAdminSession first statement)", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => { throw new Error("redirect") })
    await expect(updateCustomerRole("someone", "admin")).rejects.toThrow()
  })
  it("rejects a non-admin caller of sendCustomerPasswordReset", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => { throw new Error("redirect") })
    await expect(sendCustomerPasswordReset("someone")).rejects.toThrow()
  })
})

// ─── ADMN-09 password reset ───────────────────────────────────────────────────
describe("sendCustomerPasswordReset (ADMN-09, D-03/D-07)", () => {
  it.skipIf(!hasDatabase)("issues a pwreset_-prefixed token with ~1h expiry and never returns the token", async () => {
    const id = await insertUser({ email: "reset@example.com" })
    const before = Date.now()
    const res = await sendCustomerPasswordReset(id)
    expect(res.success).toBe(true)
    expect(JSON.stringify(res)).not.toContain("pwreset_") // token not leaked in the return
    const tokens = await getResetTokens("reset@example.com")
    expect(tokens).toHaveLength(1)
    expect(tokens[0].token.startsWith("pwreset_")).toBe(true)
    const ms = tokens[0].expires.getTime() - before
    expect(ms).toBeGreaterThan(55 * 60 * 1000)
    expect(ms).toBeLessThan(65 * 60 * 1000)
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce()
  })

  it.skipIf(!hasDatabase)("deletes prior pwreset_ tokens so only the latest link is live (D-07.2)", async () => {
    const id = await insertUser({ email: "reissue@example.com" })
    await sendCustomerPasswordReset(id)
    await sendCustomerPasswordReset(id)
    const tokens = await getResetTokens("reissue@example.com")
    expect(tokens).toHaveLength(1)
  })

  it.skipIf(!hasDatabase)("still succeeds when the email seam is a no-op (RESEND unset)", async () => {
    const id = await insertUser({ email: "noresend@example.com" })
    const res = await sendCustomerPasswordReset(id)
    expect(res.success).toBe(true)
  })
})

describe("resetPassword (ADMN-09, D-03/D-07 — public action)", () => {
  async function issue(email: string) {
    const id = await insertUser({ email })
    await sendCustomerPasswordReset(id)
    const [t] = await getResetTokens(email)
    return { id, token: t.token }
  }

  it.skipIf(!hasDatabase)("round-trip: valid token updates hash (argon2.verify) and deletes the token (single-use)", async () => {
    const { id, token } = await issue("rt@example.com")
    const res = await resetPassword({ email: "rt@example.com", token, password: "newpassword1" })
    expect(res.success).toBe(true)
    const u = await getUser(id)
    expect(await argon2.verify(u.passwordHash as string, "newpassword1")).toBe(true)
    expect(await getResetTokens("rt@example.com")).toHaveLength(0)
  })

  it.skipIf(!hasDatabase)("revokes the target's sessions on reset (D-07.1)", async () => {
    const { id, token } = await issue("sess@example.com")
    const db = await getDb()
    const schema = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")
    await db.insert(schema.sessions).values({
      sessionToken: crypto.randomUUID(), userId: id, expires: new Date(Date.now() + 86400000),
    })
    await resetPassword({ email: "sess@example.com", token, password: "newpassword1" })
    const left = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, id))
    expect(left).toHaveLength(0)
  })

  it.skipIf(!hasDatabase)("rejects a bare-UUID (non-pwreset_) token with a generic failure (D-07.3)", async () => {
    await insertUser({ email: "bare@example.com" })
    const db = await getDb()
    const schema = await import("@/lib/db/schema")
    const bare = crypto.randomUUID()
    await db.insert(schema.verificationTokens).values({
      identifier: "bare@example.com", token: bare, expires: new Date(Date.now() + 3600000),
    })
    const res = await resetPassword({ email: "bare@example.com", token: bare, password: "newpassword1" })
    expect(res.success).toBe(false)
  })

  it.skipIf(!hasDatabase)("rejects and deletes an expired reset token", async () => {
    const id = await insertUser({ email: "exp@example.com" })
    const db = await getDb()
    const schema = await import("@/lib/db/schema")
    const token = "pwreset_" + crypto.randomUUID()
    await db.insert(schema.verificationTokens).values({
      identifier: "exp@example.com", token, expires: new Date(Date.now() - 1000),
    })
    const res = await resetPassword({ email: "exp@example.com", token, password: "newpassword1" })
    expect(res.success).toBe(false)
    expect(await getResetTokens("exp@example.com")).toHaveLength(0)
    const u = await getUser(id)
    expect(u.passwordHash).toBe("old-hash") // unchanged
  })

  it.skipIf(!hasDatabase)("rejects a too-short password (zod min 8)", async () => {
    const { token } = await issue("short@example.com")
    const res = await resetPassword({ email: "short@example.com", token, password: "x" })
    expect(res.success).toBe(false)
  })
})

// ─── ADMN-11 admin-set password ───────────────────────────────────────────────
describe("adminSetCustomerPassword (ADMN-11)", () => {
  it("rejects a non-admin caller (verifyAdminSession first statement)", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => { throw new Error("redirect") })
    await expect(adminSetCustomerPassword("someone", "newpassword1")).rejects.toThrow()
  })

  it.skipIf(!hasDatabase)("sets the argon2id hash, revokes target sessions, and invalidates reset links", async () => {
    const id = await insertUser({ email: "setpw@example.com" })
    // a live reset link + a session that should both be cleared
    await sendCustomerPasswordReset(id)
    const db = await getDb()
    const schema = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")
    await db.insert(schema.sessions).values({
      sessionToken: crypto.randomUUID(), userId: id, expires: new Date(Date.now() + 86400000),
    })
    const res = await adminSetCustomerPassword(id, "adminsetpass1")
    expect(res.success).toBe(true)
    const u = await getUser(id)
    expect(await argon2.verify(u.passwordHash as string, "adminsetpass1")).toBe(true)
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, id))).toHaveLength(0)
    expect(await getResetTokens("setpw@example.com")).toHaveLength(0)
  })

  it.skipIf(!hasDatabase)("rejects a too-short password (zod min 8)", async () => {
    const id = await insertUser({ email: "shortset@example.com" })
    const res = await adminSetCustomerPassword(id, "x")
    expect(res.success).toBe(false)
    expect((await getUser(id)).passwordHash).toBe("old-hash") // unchanged
  })

  it.skipIf(!hasDatabase)("returns failure for an unknown user", async () => {
    const res = await adminSetCustomerPassword("nope", "adminsetpass1")
    expect(res.success).toBe(false)
  })

  it.skipIf(!hasDatabase)("does NOT revoke the acting admin's own session when setting their own password", async () => {
    await insertUser({ id: "admin-1", email: "admin@example.com", role: "admin" })
    const db = await getDb()
    const schema = await import("@/lib/db/schema")
    const { eq } = await import("drizzle-orm")
    await db.insert(schema.sessions).values({
      sessionToken: crypto.randomUUID(), userId: "admin-1", expires: new Date(Date.now() + 86400000),
    })
    const res = await adminSetCustomerPassword("admin-1", "adminsetpass1")
    expect(res.success).toBe(true)
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, "admin-1"))).toHaveLength(1)
  })
})

// ─── ADMN-10 role change ──────────────────────────────────────────────────────
describe("updateCustomerRole (ADMN-10, D-04/D-07.4)", () => {
  it.skipIf(!hasDatabase)("promotes a customer to admin", async () => {
    const id = await insertUser({ email: "promote@example.com", role: "customer" })
    const res = await updateCustomerRole(id, "admin")
    expect(res.success).toBe(true)
    expect((await getUser(id)).role).toBe("admin")
  })

  it.skipIf(!hasDatabase)("demotes an admin when another admin remains", async () => {
    await insertUser({ id: "admin-1", email: "admin@example.com", role: "admin" }) // the acting admin
    const id = await insertUser({ email: "second-admin@example.com", role: "admin" })
    const res = await updateCustomerRole(id, "customer")
    expect(res.success).toBe(true)
    expect((await getUser(id)).role).toBe("customer")
  })

  it.skipIf(!hasDatabase)("refuses to demote the last remaining admin (D-07.4 atomic guard)", async () => {
    const id = await insertUser({ id: "only-admin", email: "only@example.com", role: "admin" })
    vi.mocked(verifyAdminSession).mockResolvedValue({ id: "other", role: "admin", email: "o@example.com" })
    const res = await updateCustomerRole(id, "customer")
    expect(res.success).toBe(false)
    expect((await getUser(id)).role).toBe("admin") // unchanged
  })

  it.skipIf(!hasDatabase)("refuses to change the acting admin's own role (self-lockout guard)", async () => {
    await insertUser({ id: "admin-1", email: "admin@example.com", role: "admin" })
    const res = await updateCustomerRole("admin-1", "customer")
    expect(res.success).toBe(false)
    expect((await getUser("admin-1")).role).toBe("admin")
  })

  it.skipIf(!hasDatabase)("rejects a newRole outside {customer,admin} (zod)", async () => {
    const id = await insertUser({ email: "badrole@example.com" })
    // @ts-expect-error — invalid role must be rejected at runtime by zod
    const res = await updateCustomerRole(id, "superuser")
    expect(res.success).toBe(false)
  })
})
