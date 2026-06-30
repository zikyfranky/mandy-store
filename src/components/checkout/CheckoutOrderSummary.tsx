"use client"
// src/components/checkout/CheckoutOrderSummary.tsx
// Sticky order summary: desktop right-column card (§5a) + mobile collapsible bar (§5b).
// UI-SPEC §5a / §5b / Copywriting Contract
// "use client" for the mobile expand/collapse toggle (useState).

import { useState } from "react"
import Image from "next/image"
import { formatNGN } from "@/lib/catalog/format"
import type { CartResult } from "@/lib/cart/logic"

interface CheckoutOrderSummaryProps {
  cart: CartResult
  shippingKobo: number
}

export function CheckoutOrderSummary({ cart, shippingKobo }: CheckoutOrderSummaryProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const totalKobo = cart.subtotalKobo + shippingKobo

  return (
    <>
      {/* ── Mobile collapsible summary bar (shown below lg) ── */}
      <div className="lg:hidden sticky top-16 z-30 bg-surface border-b border-border">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileExpanded((v) => !v)}
            aria-expanded={mobileExpanded}
            aria-controls="mobile-order-summary"
            className="flex items-center gap-2 text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {/* Heroicons ChevronDownIcon — rotates when expanded */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`w-4 h-4 transition-transform ${mobileExpanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z"
                clipRule="evenodd"
              />
            </svg>
            Order summary
          </button>
          <span className="text-sm font-semibold text-foreground ml-auto">
            {formatNGN(totalKobo)}
          </span>
        </div>

        {mobileExpanded && (
          <div
            id="mobile-order-summary"
            className="bg-surface border-b border-border px-4 pb-4 space-y-3"
          >
            <OrderSummaryRows cart={cart} shippingKobo={shippingKobo} totalKobo={totalKobo} />
          </div>
        )}
      </div>

      {/* ── Desktop sticky card (shown at lg+) ── */}
      <div
        className="hidden lg:block rounded-2xl bg-surface border border-border p-6 space-y-4 sticky top-24"
        aria-label="Order summary"
      >
        <h2 className="text-2xl font-semibold text-foreground">Order summary</h2>

        <hr className="border-t border-border" />

        <OrderSummaryRows cart={cart} shippingKobo={shippingKobo} totalKobo={totalKobo} />
      </div>
    </>
  )
}

// ── Shared summary rows (line items + subtotal + shipping + total + security note) ──

interface SummaryRowsProps {
  cart: CartResult
  shippingKobo: number
  totalKobo: number
}

function OrderSummaryRows({ cart, shippingKobo, totalKobo }: SummaryRowsProps) {
  return (
    <>
      {/* Line items */}
      <div className="space-y-3">
        {cart.items.map((item) => (
          <div key={item.variantId} className="flex gap-3 items-start">
            {/* Thumbnail */}
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.productName}
                  width={48}
                  height={48}
                  className="object-cover w-full h-full"
                />
              ) : (
                /* Heroicons PhotoIcon 24px fallback */
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-6 h-6 text-zinc-400"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>

            {/* Product info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                {item.productName}
              </p>
              {item.variantLabel && (
                <p className="text-sm text-muted">{item.variantLabel}</p>
              )}
              <p className="text-sm text-muted">Qty: {item.quantity}</p>
            </div>

            {/* Line total */}
            <p className="text-sm font-semibold text-foreground shrink-0">
              {formatNGN(item.lineTotalKobo)}
            </p>
          </div>
        ))}
      </div>

      <hr className="border-t border-border" />

      {/* Subtotal */}
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-muted">Subtotal</span>
        <span className="text-foreground">{formatNGN(cart.subtotalKobo)}</span>
      </div>

      {/* Shipping */}
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-muted">Shipping</span>
        <span className="text-foreground">{formatNGN(shippingKobo)}</span>
      </div>

      <hr className="border-t border-border" />

      {/* Total */}
      <div className="flex justify-between">
        <span className="text-sm font-semibold text-foreground">Total</span>
        <span className="text-2xl font-semibold text-foreground">{formatNGN(totalKobo)}</span>
      </div>

      {/* Security note */}
      <p className="text-sm text-muted text-center mt-2 flex items-center justify-center gap-1">
        {/* Heroicons LockClosedIcon 14px */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-3.5 h-3.5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
            clipRule="evenodd"
          />
        </svg>
        Secure checkout
      </p>
    </>
  )
}
