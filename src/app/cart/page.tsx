// src/app/cart/page.tsx
// Full /cart page — Server Component (async).
// D-02 / D-04 / D-05 / D-11 / D-14 / UI-SPEC §Surfaces 5
// Dynamic — cart reads cookies/DB per request; no caching directive (Research Pitfall 3).

import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { getCart } from "@/lib/cart/queries"
import { CartLineItem } from "@/components/cart/CartLineItem"
import { CartEmptyState } from "@/components/cart/CartEmptyState"
import { formatNGN } from "@/lib/catalog/format"

export const metadata: Metadata = {
  title: "Your Cart — YesBuy",
  description: "Review the items in your cart.",
}

// ─── CartSkeleton (Suspense fallback) ─────────────────────────────────────────

function CartSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <div className="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse mb-8" />
      <div className="lg:grid lg:grid-cols-3 lg:gap-8 space-y-8 lg:space-y-0">
        <div className="col-span-2 space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-zinc-200 dark:bg-zinc-700 animate-pulse"
            />
          ))}
        </div>
        <div className="col-span-1">
          <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// ─── CartContent ──────────────────────────────────────────────────────────────

async function CartContent() {
  const cart = await getCart()

  if (cart.items.length === 0) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        <CartEmptyState />
      </main>
    )
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
      <h1 className="text-2xl font-semibold text-foreground mb-8">
        Your cart ({cart.totalQty} {cart.totalQty === 1 ? "item" : "items"})
      </h1>

      <div className="lg:grid lg:grid-cols-3 lg:gap-8 space-y-8 lg:space-y-0">
        {/* Line items — spans 2/3 on desktop */}
        <div className="col-span-2 rounded-2xl bg-surface border border-border overflow-hidden">
          {cart.items.map((item) => (
            <CartLineItem key={item.variantId} item={item} compact={false} />
          ))}
        </div>

        {/* Order summary — 1/3 on desktop, sticky */}
        <div className="col-span-1">
          <div className="rounded-2xl bg-surface border border-border p-6 space-y-4 sticky top-24">
            <h2 className="text-2xl font-semibold text-foreground">
              Order summary
            </h2>

            <hr className="border-t border-border" />

            {/* Subtotal row */}
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-muted">
                Subtotal ({cart.totalQty} {cart.totalQty === 1 ? "item" : "items"})
              </span>
              <span className="text-foreground">{formatNGN(cart.subtotalKobo)}</span>
            </div>

            {/* Shipping note */}
            <p className="text-sm text-muted">Shipping calculated at checkout</p>

            <hr className="border-t border-border" />

            {/* Checkout CTA — routes to /checkout (Phase 4) */}
            {cart.hasOOS ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                aria-label="Remove out-of-stock items to proceed"
                className="w-full rounded-xl bg-brand text-white px-6 py-4 text-base font-semibold opacity-50 cursor-not-allowed"
              >
                Proceed to checkout
              </button>
            ) : (
              <Link
                href="/checkout"
                className="w-full text-center block rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-4 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Proceed to checkout
              </Link>
            )}

            {/* Continue shopping */}
            <Link
              href="/products"
              className="w-full text-center block mt-2 text-sm font-semibold text-brand hover:text-brand-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              ← Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

// ─── CartPage ─────────────────────────────────────────────────────────────────

export default function CartPage() {
  return (
    <Suspense fallback={<CartSkeleton />}>
      <CartContent />
    </Suspense>
  )
}
