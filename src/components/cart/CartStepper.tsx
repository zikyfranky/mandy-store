"use client"
// src/components/cart/CartStepper.tsx
// Quantity stepper: − N + with stock cap, remove-at-0, pending state, aria-live.
// D-04 / D-06 / D-07 / UI-SPEC §Surfaces 3 / Accessibility Contracts

import { useTransition } from "react"
import { updateCartItem } from "@/lib/actions/cart"

// ─── CartStepper ─────────────────────────────────────────────────────────────

interface CartStepperProps {
  variantId: string
  quantity: number
  stock: number
  productName: string
}

export function CartStepper({ variantId, quantity, stock, productName }: CartStepperProps) {
  const [isPending, startTransition] = useTransition()

  const atMax = quantity >= stock && stock > 0

  function handleDecrease() {
    if (isPending) return
    // qty 0 → server action removes (D-07); updateCartItem delegates remove when qty ===0
    startTransition(async () => {
      await updateCartItem(variantId, quantity - 1)
    })
  }

  function handleIncrease() {
    if (isPending || atMax) return
    startTransition(async () => {
      await updateCartItem(variantId, quantity + 1)
    })
  }

  return (
    <div>
      <div
        role="group"
        aria-label={`Quantity for ${productName}`}
        className="inline-flex items-center rounded-full border border-border bg-surface h-9"
      >
        {/* Decrease / remove */}
        <button
          type="button"
          onClick={handleDecrease}
          disabled={isPending}
          aria-disabled={isPending}
          aria-label="Decrease quantity"
          className={[
            "min-h-9 min-w-9 flex items-center justify-center rounded-full transition-colors",
            "text-foreground hover:bg-brand-soft",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Heroicons MinusIcon 16px */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.25 12a.75.75 0 0 1 .75-.75h14a.75.75 0 0 1 0 1.5H5a.75.75 0 0 1-.75-.75Z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Quantity count */}
        <span
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${quantity} in cart`}
          className={[
            "text-sm font-semibold text-foreground min-w-[2rem] text-center px-1",
            isPending ? "animate-pulse" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {quantity}
        </span>

        {/* Increase */}
        <button
          type="button"
          onClick={handleIncrease}
          disabled={isPending || quantity >= stock}
          aria-disabled={isPending || quantity >= stock}
          aria-label="Increase quantity"
          className={[
            "min-h-9 min-w-9 flex items-center justify-center rounded-full transition-colors",
            "text-foreground hover:bg-brand-soft",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {/* Heroicons PlusIcon 16px */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Stock cap message (D-06) — shown when at max stock */}
      {atMax && (
        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-1">
          Only {stock} available
        </p>
      )}
    </div>
  )
}
