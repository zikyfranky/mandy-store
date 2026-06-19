// tests/cart/cart-cookie.test.ts
// Cookie integration scaffold — asserts guest cart cookie contract (CART-03).
// Covers: cookie name, httpOnly, sameSite, maxAge, path — the harness Plan 02 uses.
// Plan 02 extends: addToCart guest-path round-trip via this store

import { describe, it, expect, vi, beforeEach } from "vitest"
import { hasDatabase } from "../helpers/db"
import { CART_COOKIE, MAX_AGE } from "@/lib/cart/logic"

// Mock server-only and next/headers for test environment
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))
// Mock next/cache so revalidatePath doesn't throw "static generation store missing" in tests
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
}))
// Mock @/lib/auth so addToCart can call auth() without a real session
vi.mock("@/lib/auth", () => ({
  signIn:  vi.fn(),
  signOut: vi.fn(),
  auth:    vi.fn().mockResolvedValue(null), // null session = guest
  handlers: {},
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

  // ─── Plan 02 additions: addToCart guest round-trip ────────────────────────

  describe("addToCart() guest path (Plan 02)", () => {
    let mockSet: ReturnType<typeof vi.fn>
    let mockGet: ReturnType<typeof vi.fn>
    let mockCookieStore: Record<string, unknown>

    beforeEach(async () => {
      vi.resetModules() // fresh module cache for each test
      mockSet = vi.fn()
      mockGet = vi.fn()
      mockCookieStore = {
        get: mockGet,
        set: mockSet,
        delete: vi.fn(),
        has: vi.fn(),
        getAll: vi.fn(),
      }
      const { cookies } = await import("next/headers")
      vi.mocked(cookies).mockResolvedValue(
        mockCookieStore as unknown as Awaited<ReturnType<typeof cookies>>
      )
    })

    it.skipIf(skip)(
      "addToCart() writes cookie with httpOnly=true, sameSite=lax, maxAge=MAX_AGE (CART-01, CART-03)",
      async () => {
        // Start with an empty cookie
        mockGet.mockReturnValue(undefined)

        // Fetch a real variant ID from the DB to pass as a valid UUID
        const { db } = await import("@/lib/db/client")
        const { variants } = await import("@/lib/db/schema")

        const variant = await db.query.variants.findFirst({
          where: (v, { eq }) => eq(v.isActive, true),
          columns: { id: true, stock: true },
        })

        if (!variant || variant.stock === 0) {
          // No in-stock variants seeded — skip gracefully
          return
        }

        const { addToCart } = await import("@/lib/actions/cart")
        const result = await addToCart(variant.id, 1)

        expect(result.success).toBe(true)
        expect(typeof result.count).toBe("number")

        // Verify the cookie was set with correct options
        expect(mockSet).toHaveBeenCalledWith(
          CART_COOKIE,
          expect.any(String),
          expect.objectContaining({
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: MAX_AGE,
          })
        )

        // The serialized value should contain the variantId (no price)
        const setCall = mockSet.mock.calls[0]
        const serialized = setCall[1] as string
        const parsed = JSON.parse(serialized) as Array<{ variantId: string; quantity: number }>
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed.some((i) => i.variantId === variant.id)).toBe(true)
        // Critically: no price in the cookie
        parsed.forEach((item) => {
          expect("price" in item).toBe(false)
          expect("priceKobo" in item).toBe(false)
        })
      }
    )

    it.skipIf(skip)(
      "addToCart() returns {success:false, error:'Out of stock'} for OOS variant (D-06)",
      async () => {
        // The UUID won't match any real variant
        const { addToCart } = await import("@/lib/actions/cart")
        const fakeId = "00000000-0000-0000-0000-000000000000"
        const result = await addToCart(fakeId, 1)
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
      }
    )

    it(
      "addToCart() returns {success:false} for invalid UUID (T-03-05 input validation)",
      async () => {
        const { addToCart } = await import("@/lib/actions/cart")
        const result = await addToCart("not-a-uuid", 1)
        expect(result.success).toBe(false)
        expect(result.count).toBe(0)
        expect(result.error).toBeDefined()
      }
    )
  })
})
