// tests/actions/gateway-credentials.test.ts
// Phase 8 (D-05/D-06, ADMN-05/ADMN-06): saveGatewayCredentials + testGatewayConnection
// Server Actions. Pure unit tests — mocks admin session, db insert chain, the gateway-
// credentials resolver, the Stripe SDK, and global fetch.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

// ─── Module mocks (must be at top-level, hoisted before imports) ──────────────

vi.mock("server-only", () => ({}))
vi.mock("@/lib/dal", () => ({ verifyAdminSession: vi.fn() }))

vi.mock("@/lib/payments/gateway-credentials", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/gateway-credentials")>(
    "@/lib/payments/gateway-credentials",
  )
  return {
    ...actual,
    getGatewayConfig: vi.fn(),
  }
})

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
import { getGatewayConfig } from "@/lib/payments/gateway-credentials"
import { saveGatewayCredentials, testGatewayConnection } from "@/lib/actions/gateway-credentials"

const ADMIN_USER = { id: "admin-1", role: "admin" as const, email: "admin@example.com" }

beforeEach(() => {
  vi.mocked(verifyAdminSession).mockResolvedValue(ADMIN_USER)
  vi.mocked(getGatewayConfig).mockResolvedValue({})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
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

describe("testGatewayConnection", () => {
  it("stripe pass: reports success when balance.retrieve resolves", async () => {
    const mockRetrieve = vi.fn().mockResolvedValue({ available: [] })
    vi.doMock("stripe", () => ({
      default: class {
        balance = { retrieve: mockRetrieve }
      },
    }))
    vi.resetModules()
    const { testGatewayConnection: testConn } = await import("@/lib/actions/gateway-credentials")
    const result = await testConn("stripe", { secret_key: "sk_test_valid" })
    expect(result).toEqual({ success: true })
    vi.doUnmock("stripe")
    vi.resetModules()
  })

  it("stripe fail: reports failure when balance.retrieve rejects, never throws", async () => {
    const mockRetrieve = vi.fn().mockRejectedValue(new Error("Invalid API key"))
    vi.doMock("stripe", () => ({
      default: class {
        balance = { retrieve: mockRetrieve }
      },
    }))
    vi.resetModules()
    const { testGatewayConnection: testConn } = await import("@/lib/actions/gateway-credentials")
    const result = await testConn("stripe", { secret_key: "sk_test_invalid" })
    expect(result).toEqual({ success: false, error: "Invalid API key" })
    vi.doUnmock("stripe")
    vi.resetModules()
  })

  it("paystack pass/fail: maps fetch ok/!ok to success/failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const passResult = await testGatewayConnection("paystack", { secret_key: "sk_paystack_valid" })
    expect(passResult).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paystack.co/balance",
      expect.objectContaining({ headers: { Authorization: "Bearer sk_paystack_valid" } }),
    )

    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    const failResult = await testGatewayConnection("paystack", { secret_key: "sk_paystack_invalid" })
    expect(failResult).toEqual({ success: false, error: "Paystack returned 401" })
  })

  it("flutterwave pass/fail: maps fetch ok/!ok to success/failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    const passResult = await testGatewayConnection("flutterwave", { secret_key: "flw_valid" })
    expect(passResult).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.flutterwave.com/v3/balances",
      expect.objectContaining({ headers: { Authorization: "Bearer flw_valid" } }),
    )

    fetchMock.mockResolvedValue({ ok: false, status: 403 })
    const failResult = await testGatewayConnection("flutterwave", { secret_key: "flw_invalid" })
    expect(failResult).toEqual({ success: false, error: "Flutterwave returned 403" })
  })

  it("unsupported provider: never attempts a network call", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const result = await testGatewayConnection("interswitch", {})
    expect(result).toEqual({ success: false, error: "This gateway can't be tested directly" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("admin-gated: rejects before any network call", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => {
      throw new Error("redirect")
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(testGatewayConnection("paystack", { secret_key: "x" })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("tests the unsaved candidate value when provided, not the persisted value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(getGatewayConfig).mockResolvedValue({ secret_key: "persisted-value-should-not-be-used" })
    await testGatewayConnection("paystack", { secret_key: "candidate-value" })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paystack.co/balance",
      expect.objectContaining({ headers: { Authorization: "Bearer candidate-value" } }),
    )
    expect(getGatewayConfig).not.toHaveBeenCalled()
  })

  it("falls back to the persisted value when the field is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(getGatewayConfig).mockResolvedValue({ secret_key: "persisted-value" })
    await testGatewayConnection("paystack", {})
    expect(getGatewayConfig).toHaveBeenCalledWith("paystack")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.paystack.co/balance",
      expect.objectContaining({ headers: { Authorization: "Bearer persisted-value" } }),
    )
  })

  it("never persists — DB insert mock is never called", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    await testGatewayConnection("paystack", { secret_key: "x" })
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
