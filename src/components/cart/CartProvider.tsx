"use client"
// src/components/cart/CartProvider.tsx
// React Context provider for cart drawer open/close state and optimistic count.
// Plan 03-02 (this plan): minimal provider — isOpen/open/close/optimisticCount/setOptimisticCount
// Plan 03-03: extends with CartDrawer consuming isOpen, CartLineItem, CartStepper
// RESEARCH Pattern 4 / D-01 / D-03 / D-13

import { createContext, useContext, useState, type ReactNode } from "react"

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
}

const CartContext = createContext<CartContextValue | null>(null)

// ─── CartProvider ─────────────────────────────────────────────────────────────

interface CartProviderProps {
  children: ReactNode
  /** Server-read cart count seeded into the provider on first render (SSR hydration) */
  initialCount: number
}

export function CartProvider({ children, initialCount }: CartProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [optimisticCount, setOptimisticCount] = useState(initialCount)

  return (
    <CartContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        optimisticCount,
        setOptimisticCount,
      }}
    >
      {children}
      {/* Plan 03-03: <CartDrawer /> will be mounted here */}
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
