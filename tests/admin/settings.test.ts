// WAVE 0 RED SCAFFOLD — expected to fail until Plan 05-03/05-04 implement the actions.
// tests/admin/settings.test.ts
// ADMN-04 (admin toggles Stripe/PayPal/bank transfer). Imports
// @/lib/actions/admin-settings, which does not exist until Wave 2 — a
// missing-module import error is the CORRECT red signal for Wave 0.
//
// Pure unit test — mocks the db, no truncate helper needed (mirrors
// tests/checkout/actions.test.ts's toggle-rejection unit style).

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

// ─── Module mocks (must be at top-level, hoisted before imports) ──────────────

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock("@/lib/dal", () => ({
  verifyAdminSession: vi.fn(),
}))

// Unit test — mock the db update chain instead of hitting a real database.
// vi.hoisted runs before vi.mock factory hoisting — allows us to share these
// references reliably (the bare "mock"-prefix hoisting convention does not
// reliably hoist a chain of variables that reference each other).
const { mockWhere, mockSet, mockUpdate } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue(undefined)
  const mockSet = vi.fn(() => ({ where: mockWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockSet }))
  return { mockWhere, mockSet, mockUpdate }
})
vi.mock("@/lib/db/client", () => ({
  db: { update: mockUpdate },
}))

// ─── Lazy imports after mocks ─────────────────────────────────────────────────

import { verifyAdminSession } from "@/lib/dal"

// NOTE: this module does not exist until Wave 2 (Plan 05-05). The top-level import
// below is intentionally left unresolved — Vitest will fail to collect this file
// with a missing-module error, which IS the expected Wave 0 RED signal.
import { toggleStoreSetting } from "@/lib/actions/admin-settings"

const ADMIN_USER = { id: "admin-1", role: "admin" as const, email: "admin@example.com" }

beforeEach(() => {
  vi.mocked(verifyAdminSession).mockResolvedValue(ADMIN_USER)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("toggleStoreSetting — toggle enforcement", () => {
  it("rejects a non-admin caller", async () => {
    vi.mocked(verifyAdminSession).mockImplementation(() => {
      throw new Error("redirect")
    })
    await expect(toggleStoreSetting("stripe", true)).rejects.toThrow()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rejects an invalid payment method (Zod enum validation)", async () => {
    const result = await toggleStoreSetting("not-a-real-method", true)
    expect(result).toHaveProperty("success", false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("updates the row for a valid method + admin caller", async () => {
    const result = await toggleStoreSetting("stripe", false)
    expect(result).toHaveProperty("success", true)
    expect(mockUpdate).toHaveBeenCalled()
  })
})
