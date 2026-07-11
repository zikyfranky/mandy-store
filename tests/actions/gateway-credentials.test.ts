// tests/actions/gateway-credentials.test.ts
// Phase 8 (D-05, ADMN-05/ADMN-06): saveGatewayCredentials Server Action.
// Pure unit test — mocks admin session, db insert...onConflictDoUpdate chain, and crypto.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

// ─── Module mocks (must be at top-level, hoisted before imports) ──────────────

vi.mock("server-only", () => ({}))
vi.mock("@/lib/dal", () => ({ verifyAdminSession: vi.fn() }))

// Unit test — mock the db insert...onConflictDoUpdate chain instead of hitting a
// real database (mirrors tests/admin/settings.test.ts's vi.hoisted db-chain mock).
type InsertedRow = { provider: string; field: string; value: string; isSecret: boolean; updatedBy: string }

const { mockInsert, mockValues, mockOnConflictDoUpdate } = vi.hoisted(() => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const mockValues = vi.fn((_row: InsertedRow) => ({ onConflictDoUpdate: mockOnConflictDoUpdate }))
  const mockInsert = vi.fn(() => ({ values: mockValues }))
  return { mockInsert, mockValues, mockOnConflictDoUpdate }
})
vi.mock("@/lib/db/client", () => ({ db: { insert: mockInsert } }))

// ─── Lazy imports after mocks ─────────────────────────────────────────────────

import { verifyAdminSession } from "@/lib/dal"
import { saveGatewayCredentials } from "@/lib/actions/gateway-credentials"

const ADMIN_USER = { id: "admin-1", role: "admin" as const, email: "admin@example.com" }

beforeEach(() => {
  vi.mocked(verifyAdminSession).mockResolvedValue(ADMIN_USER)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("saveGatewayCredentials", () => {
  it("admin-gated: rejects a non-admin caller before any DB write", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => {
      throw new Error("redirect")
    })
    await expect(saveGatewayCredentials("stripe", { secret_key: "sk_x" })).rejects.toThrow()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("rejects unknown provider", async () => {
    const result = await saveGatewayCredentials("not-a-gateway", { x: "y" })
    expect(result).toEqual({ success: false, error: "Unknown provider" })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("rejects field names not in FIELD_MANIFEST (closed schema)", async () => {
    const result = await saveGatewayCredentials("stripe", { not_a_real_field: "x" })
    expect(result).toHaveProperty("success", false)
    for (const call of mockValues.mock.calls) {
      expect(call[0]).not.toMatchObject({ field: "not_a_real_field" })
    }
  })

  it("empty submit: does not write for empty fields (skip-on-empty, D-04)", async () => {
    const result = await saveGatewayCredentials("stripe", { secret_key: "" })
    expect(result).toEqual({ success: true })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("encrypts secret fields before persisting", async () => {
    const result = await saveGatewayCredentials("stripe", { secret_key: "sk_live_abc" })
    expect(result).toEqual({ success: true })
    const call = mockValues.mock.calls.find((c) => c[0].field === "secret_key")
    expect(call).toBeDefined()
    expect(call![0].value).toMatch(/^v1:/)
    expect(call![0].value).not.toContain("sk_live_abc")
  })

  it("stores public fields as plaintext (isSecret: false)", async () => {
    const result = await saveGatewayCredentials("stripe", { publishable_key: "pk_test_abc" })
    expect(result).toEqual({ success: true })
    const call = mockValues.mock.calls.find((c) => c[0].field === "publishable_key")
    expect(call).toBeDefined()
    expect(call![0].value).toBe("pk_test_abc")
    expect(call![0].isSecret).toBe(false)
  })

  it("success shape: returns exactly { success: true } with no field values echoed", async () => {
    const result = await saveGatewayCredentials("stripe", { publishable_key: "pk_test_abc" })
    expect(result).toEqual({ success: true })
    expect(Object.keys(result)).toEqual(["success"])
  })

  it("stamps updated_by with the admin session's email", async () => {
    await saveGatewayCredentials("stripe", { secret_key: "sk_live_abc" })
    const call = mockValues.mock.calls.find((c) => c[0].field === "secret_key")
    expect(call![0].updatedBy).toBe(ADMIN_USER.email)
  })
})
