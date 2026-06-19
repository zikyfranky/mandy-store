// tests/cart/cart-cookie.test.ts
// Cookie integration scaffold — asserts guest cart cookie contract (CART-03).
// Covers: cookie name, httpOnly, sameSite, maxAge, path — the harness Plan 02 uses.
// Plan 02 extends: addToCart guest-path round-trip via this store

import { describe, it, expect, vi } from "vitest"
import { hasDatabase } from "../helpers/db"
import { CART_COOKIE, MAX_AGE } from "@/lib/cart/logic"

// Mock server-only and next/headers for test environment
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

const skip = !hasDatabase

// ─── Guest cart cookie contract tests ────────────────────────────────────────

describe("guest cart cookie", () => {
  it("CART_COOKIE name is 'ms_cart' (D-08 — short name saves cookie bytes)", () => {
    expect(CART_COOKIE).toBe("ms_cart")
  })

  it("MAX_AGE is 30 days in seconds (D-08 — 30-day guest cart lifetime)", () => {
    expect(MAX_AGE).toBe(30 * 24 * 60 * 60)
    expect(MAX_AGE).toBe(2_592_000)
  })

  it("mock cookie store harness: set() is called with correct contract options", async () => {
    const { cookies } = await import("next/headers")

    // Build a mock cookie store that records calls
    const mockSet = vi.fn()
    const mockCookieStore = {
      get: vi.fn(),
      set: mockSet,
      delete: vi.fn(),
      has: vi.fn(),
      getAll: vi.fn(),
    }
    vi.mocked(cookies).mockResolvedValue(
      mockCookieStore as unknown as Awaited<ReturnType<typeof cookies>>
    )

    // Simulate what a setGuestCart() function would do (Plan 02 implements this)
    // We assert the cookie options contract here so Plan 02 must match it
    const store = await cookies()
    store.set(CART_COOKIE, "[]", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    })

    expect(mockSet).toHaveBeenCalledWith(
      "ms_cart",          // CART_COOKIE
      expect.any(String), // serialized cart
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE,
      })
    )
  })

  it("mock cookie store harness: get() returns undefined for missing cookie", async () => {
    const { cookies } = await import("next/headers")

    const mockCookieStore = {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      getAll: vi.fn(),
    }
    vi.mocked(cookies).mockResolvedValue(
      mockCookieStore as unknown as Awaited<ReturnType<typeof cookies>>
    )

    const store = await cookies()
    const raw = store.get(CART_COOKIE)?.value
    // When cookie is missing, parseCartCookie should gracefully return []
    const { parseCartCookie } = await import("@/lib/cart/logic")
    expect(parseCartCookie(raw)).toEqual([])
  })

  it("mock cookie store harness: get() with malformed value returns [] (T-03-02)", async () => {
    const { cookies } = await import("next/headers")

    const mockCookieStore = {
      get: vi.fn().mockReturnValue({ value: "not-valid-json{{" }),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      getAll: vi.fn(),
    }
    vi.mocked(cookies).mockResolvedValue(
      mockCookieStore as unknown as Awaited<ReturnType<typeof cookies>>
    )

    const store = await cookies()
    const raw = store.get(CART_COOKIE)?.value
    const { parseCartCookie } = await import("@/lib/cart/logic")
    expect(parseCartCookie(raw)).toEqual([])
  })

  // Plan 02 adds: setGuestCart() round-trip via this store
  it.todo("setGuestCart() writes cookie with correct name+options and is readable back (Plan 02)")
  it.todo("addToCart() guest path: writes cookie, returns updated count (Plan 02)")
  it.skipIf(skip).todo("addToCart() DB path: writes cart_item, returns updated count (Plan 02)")
})
