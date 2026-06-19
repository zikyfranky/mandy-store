import "server-only"
// src/lib/cart/cookie.ts
// Guest cart cookie read/write helpers — server-only (never reach the client).
// NOTE: setGuestCartItems / clearGuestCartCookie can only be called from Server
// Actions or Route Handlers (Next.js 16 Pitfall 1 — cookies().set() throws in
// Server Components). getGuestCartItems (read-only) is safe in Server Components.
// CART-03 / D-08 / Research Pitfall 1

import { cookies } from "next/headers"
import {
  CART_COOKIE,
  MAX_AGE,
  parseCartCookie,
  serializeCartCookie,
  type GuestCartItem,
} from "@/lib/cart/logic"

// ─── getGuestCartItems ───────────────────────────────────────────────────────

/**
 * Read the guest cart cookie and parse into typed items.
 * Safe to call from Server Components (read-only path).
 *
 * @returns Parsed guest cart items; [] if cookie is absent or malformed (T-03-02).
 */
export async function getGuestCartItems(): Promise<GuestCartItem[]> {
  const store = await cookies()
  return parseCartCookie(store.get(CART_COOKIE)?.value)
}

// ─── setGuestCartItems ───────────────────────────────────────────────────────

/**
 * Serialize and write the guest cart cookie.
 * ONLY call from Server Actions / Route Handlers — throws in Server Components.
 *
 * Cookie options (CART-03 / D-08):
 *   httpOnly: true    — not accessible via document.cookie (XSS protection)
 *   sameSite: "lax"   — sent on top-level navigations, not third-party (CSRF)
 *   path: "/"         — valid for all routes
 *   maxAge: 30 days   — guest cart persists for a month (D-08)
 *   secure: true in production
 */
export async function setGuestCartItems(items: GuestCartItem[]): Promise<void> {
  const store = await cookies()
  store.set(CART_COOKIE, serializeCartCookie(items), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  })
}

// ─── clearGuestCartCookie ────────────────────────────────────────────────────

/**
 * Expire and clear the guest cart cookie.
 * Called after a successful login merge (D-10) to prevent cart duplication.
 * ONLY call from Server Actions / Route Handlers.
 */
export async function clearGuestCartCookie(): Promise<void> {
  const store = await cookies()
  store.set(CART_COOKIE, "[]", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // maxAge: 0 expires the cookie immediately
    secure: process.env.NODE_ENV === "production",
  })
}
