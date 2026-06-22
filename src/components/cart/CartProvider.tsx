"use client"
// src/components/cart/CartProvider.tsx
// React Context provider for cart drawer open/close state, optimistic count, and cart data.
// Plan 03-02: minimal provider — isOpen/open/close/optimisticCount/setOptimisticCount
// Plan 03-03: extended to hold cart: CartResult seeded from initialCart server prop
// RESEARCH Pattern 4 / D-01 / D-03 / D-13

import { createContext, useContext, useState, type ReactNode } from "react"
import type { CartResult } from "@/lib/cart/logic"

// ─── Context value type ───────────────────────────────────────────────────────

type CartContextValue = {
  /** Whether the cart drawer is currently open */
  isOpen: boolean
  /** Open the cart drawer */
  open: () => void
  /** Close the cart drawer */
  close: () => void
  /**
   * Mirrored cart item count for instant badge updates (D-13).
   * Seeded from the server-rendered count on first render;
   * updated optimistically after each Server Action response.
   */
  optimisticCount: number
  /** Update the optimistic count — called by VariantSelector after addToCart */
  setOptimisticCount: (n: number) => void
  /**
   * Full hydrated cart — seeded from server initialCart on first render.
   * Refreshed automatically when revalidatePath triggers layout re-render.
   */
  cart: CartResult
}

const CartContext = createContext<CartContextValue | null>(null)

// ─── CartProvider ─────────────────────────────────────────────────────────────

interface CartProviderProps {
  children: ReactNode
  /** Server-read cart count seeded into the provider on first render (SSR hydration) */
  initialCount: number
  /** Server-read full cart seeded into the provider on first render */
  initialCart: CartResult
}

export function CartProvider({ children, initialCount, initialCart }: CartProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [optimisticCount, setOptimisticCount] = useState(initialCount)
  // `cart` is server-owned truth: read the prop directly (do NOT freeze it in useState).
  // After a mutation, addToCart/updateCartItem call revalidatePath('/', 'layout'), which
  // re-renders CartShell with a fresh getCart() and passes a new initialCart down — the
  // drawer must reflect that. useState(initialCart) pinned the value at first mount, leaving
  // the drawer permanently stale/empty while the badge + /cart page stayed correct.
  const cart = initialCart

  return (
    <CartContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        optimisticCount,
        setOptimisticCount,
        cart,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

// ─── useCart ──────────────────────────────────────────────────────────────────

/**
 * Access cart context values.
 * @throws if called outside of a <CartProvider> tree.
 */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error("useCart must be used inside a <CartProvider>")
  }
  return ctx
}
