"use client"
// src/components/cart/CartDrawer.tsx
// Right slide-out mini-cart with focus trap, overlay, subtotal, OOS gate.
// D-01 / D-03 / D-11 / D-13 / UI-SPEC §Surfaces 1 / Accessibility Contracts
// Pure CSS translate-x animation; focus-trap-react@12.0.2 for keyboard trap.

import { useEffect, useId } from "react"
import FocusTrap from "focus-trap-react"
import { useCart } from "@/components/cart/CartProvider"
import { CartLineItem } from "@/components/cart/CartLineItem"
import { CartEmptyState } from "@/components/cart/CartEmptyState"
import { formatNGN } from "@/lib/catalog/format"
import Link from "next/link"

// ─── CartDrawer ───────────────────────────────────────────────────────────────

export function CartDrawer() {
  const { isOpen, close, cart } = useCart()
  const titleId = useId()

  // Prevent body scroll while drawer is open (UI-SPEC §Surfaces 1)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  const hasItems = cart.items.length > 0

  return (
    <>
      {/* Overlay — fades in/out, closes drawer on click */}
      <div
        aria-hidden="true"
        onClick={close}
        className={[
          "fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        ]
          .filter(Boolean)
          .join(" ")}
      />

      {/* Focus trap wraps the panel */}
      <FocusTrap
        active={isOpen}
        focusTrapOptions={{
          onDeactivate: close,
          returnFocusOnDeactivate: true,
          escapeDeactivates: true,
          // Avoid errors when the panel has no tabbable children (empty state)
          fallbackFocus: "[data-cart-close]",
        }}
      >
        {/* Panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-label="Shopping cart"
          className={[
            "fixed right-0 inset-y-0 w-full sm:w-[400px] bg-surface z-50 shadow-2xl flex flex-col",
            "transition-transform duration-300",
            isOpen ? "translate-x-0 ease-out" : "translate-x-full ease-in",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-border shrink-0">
            <h2
              id={titleId}
              className="text-2xl font-semibold text-foreground"
            >
              Cart
            </h2>

            {/* Close button */}
            <button
              type="button"
              data-cart-close
              onClick={close}
              aria-label="Close cart"
              className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-foreground hover:bg-brand-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {/* X icon 24px */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-6 h-6"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Body — line items or empty state */}
          <div className="flex-1 overflow-y-auto py-2 no-scrollbar">
            {hasItems ? (
              cart.items.map((item) => (
                <CartLineItem key={item.variantId} item={item} compact />
              ))
            ) : (
              <CartEmptyState />
            )}
          </div>

          {/* Footer — only shown when cart has items */}
          {hasItems && (
            <div className="px-5 py-4 border-t border-border bg-surface space-y-4 shrink-0">
              {/* Subtotal row */}
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-muted">Subtotal</span>
                <span className="text-2xl font-semibold text-foreground">
                  {formatNGN(cart.subtotalKobo)}
                </span>
              </div>

              {/* Shipping note */}
              <p className="text-sm text-muted text-center">
                Shipping calculated at checkout
              </p>

              {/* Checkout CTA — Phase 4 stub; routes to /cart; disabled when OOS (D-11) */}
              {cart.hasOOS ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  aria-label="Remove out-of-stock items to proceed"
                  className="w-full rounded-xl bg-brand text-white px-6 py-4 text-base font-semibold opacity-50 cursor-not-allowed"
                >
                  Checkout
                </button>
              ) : (
                <Link
                  href="/cart"
                  className="w-full rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-4 text-base font-semibold transition-colors block text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  Checkout
                </Link>
              )}

              {/* View full cart link */}
              <Link
                href="/cart"
                className="w-full text-center block text-sm font-semibold text-brand hover:text-brand-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                View full cart
              </Link>
            </div>
          )}
        </div>
      </FocusTrap>
    </>
  )
}
