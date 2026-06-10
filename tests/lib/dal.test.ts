// tests/lib/dal.test.ts
// Covers: ROADMAP SC4 — verifySession() redirects when unauthenticated; verifyAdminSession() rejects non-admin
// Status: GREEN — implemented in Plan 01-02

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next/navigation's redirect so we can assert it's called
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // Throw to simulate Next.js redirect throwing a NEXT_REDIRECT error
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

// Mock the auth() function from @/lib/auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}))

// server-only uses a package that throws if imported outside server context;
// vitest runs in Node so we can mock it to a no-op
vi.mock("server-only", () => ({}))

import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { verifySession, verifyAdminSession } from "@/lib/dal"

const mockAuth = vi.mocked(auth)
const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// verifySession()
// ---------------------------------------------------------------------------

describe("verifySession()", () => {
  it("redirects to /account/login when there is no active session", async () => {
    mockAuth.mockResolvedValue(null as never)

    await expect(verifySession()).rejects.toThrow("NEXT_REDIRECT:/account/login")
    expect(mockRedirect).toHaveBeenCalledWith("/account/login")
  })

  it("redirects to /account/login when session exists but user.id is missing", async () => {
    mockAuth.mockResolvedValue({
      user: { id: undefined, email: "test@example.com", role: "customer" },
      expires: new Date().toISOString(),
    } as never)

    await expect(verifySession()).rejects.toThrow("NEXT_REDIRECT:/account/login")
    expect(mockRedirect).toHaveBeenCalledWith("/account/login")
  })

  it("returns { id, role, email } for an authenticated customer", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-123", email: "customer@example.com", role: "customer" },
      expires: new Date().toISOString(),
    } as never)

    const result = await verifySession()

    expect(result).toEqual({
      id: "user-123",
      role: "customer",
      email: "customer@example.com",
    })
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("returns { id, role, email } for an authenticated admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-456", email: "admin@example.com", role: "admin" },
      expires: new Date().toISOString(),
    } as never)

    const result = await verifySession()

    expect(result).toEqual({
      id: "admin-456",
      role: "admin",
      email: "admin@example.com",
    })
  })

  it("defaults role to 'customer' when session.user.role is undefined", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-789", email: "norole@example.com" },
      expires: new Date().toISOString(),
    } as never)

    const result = await verifySession()

    expect(result.role).toBe("customer")
  })
})

// ---------------------------------------------------------------------------
// verifyAdminSession()
// ---------------------------------------------------------------------------

describe("verifyAdminSession()", () => {
  it("redirects to / when authenticated user does not have admin role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-123", email: "customer@example.com", role: "customer" },
      expires: new Date().toISOString(),
    } as never)

    await expect(verifyAdminSession()).rejects.toThrow("NEXT_REDIRECT:/")
    expect(mockRedirect).toHaveBeenCalledWith("/")
  })

  it("redirects to / when role is undefined (not admin)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-123", email: "norole@example.com" },
      expires: new Date().toISOString(),
    } as never)

    await expect(verifyAdminSession()).rejects.toThrow("NEXT_REDIRECT:/")
    expect(mockRedirect).toHaveBeenCalledWith("/")
  })

  it("returns session user for an authenticated admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-456", email: "admin@example.com", role: "admin" },
      expires: new Date().toISOString(),
    } as never)

    const result = await verifyAdminSession()

    expect(result).toEqual({
      id: "admin-456",
      role: "admin",
      email: "admin@example.com",
    })
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it("redirects to /account/login when unauthenticated (no session at all)", async () => {
    mockAuth.mockResolvedValue(null as never)

    // Should redirect to login first (via verifySession inner call)
    await expect(verifyAdminSession()).rejects.toThrow("NEXT_REDIRECT:/account/login")
  })
})
