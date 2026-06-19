"use client"
// src/components/cart/CartLineItem.tsx
// Single cart line: thumbnail, name, variant label, stepper, line price, trash.
// OOS state (D-11): row dimmed, label, struck-through price, stepper disabled.
// Clamp notice (D-12): amber notice when isClamped.
// D-04 / D-05 / D-07 / D-11 / D-12 / UI-SPEC §Surfaces 2

import Image from "next/image"
import { useTransition } from "react"
import { formatNGN } from "@/lib/catalog/format"
import { removeCartItem } from "@/lib/actions/cart"
import { CartStepper } from "@/components/cart/CartStepper"
import type { CartLineItem as CartLineItemType } from "@/lib/cart/logic"

// ─── CartLineItem ─────────────────────────────────────────────────────────────

interface CartLineItemProps {
  item: CartLineItemType
  /** compact=true in the drawer; compact=false on the /cart page */
  compact?: boolean
}

export function CartLineItem({ item, compact = false }: CartLineItemProps) {
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    if (isPending) return
    startTransition(async () => {
      await removeCartItem(item.variantId)
    })
  }

  return (
    <div
      className={[
        "flex gap-3 items-start px-5 py-4 border-b border-border last:border-0",
        item.isOOS ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Thumbnail (72×72px) */}
      <div className="relative w-[72px] h-[72px] shrink-0 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.productName}
            fill
            className="object-cover"
            sizes="72px"
          />
        ) : (
          /* Heroicons PhotoIcon fallback */
          <div className="flex items-center justify-center w-full h-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-8 h-8 text-zinc-400 dark:text-zinc-600"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Item details */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* OOS label (D-11) */}
        {item.isOOS && (
          <p className="text-sm font-semibold text-stock-out">Out of stock</p>
        )}

        {/* Product name */}
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {item.productName}
        </p>

        {/* Variant label */}
        <p className="text-sm text-muted">{item.variantLabel}</p>

        {/* Clamp notice (D-12) */}
        {item.isClamped && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm font-semibold text-amber-600 dark:text-amber-400"
          >
            Only {item.stock} left — quantity updated
          </p>
        )}

        {/* Unit price */}
        <p className="text-sm font-semibold text-foreground">
          {formatNGN(item.priceKobo)}
        </p>

        {/* Stepper + line price row */}
        <div className="flex items-center justify-between mt-2">
          {/* Stepper — disabled (pointer-events-none) when OOS */}
          <div
            className={item.isOOS ? "opacity-40 pointer-events-none" : ""}
            aria-disabled={item.isOOS}
          >
            <CartStepper
              variantId={item.variantId}
              quantity={item.quantity}
              stock={item.stock}
              productName={item.productName}
            />
          </div>

          {/* Line price — struck through when OOS (D-11) */}
          <p
            className={[
              "text-sm font-semibold",
              item.isOOS ? "line-through text-muted" : "text-foreground",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {formatNGN(item.lineTotalKobo)}
          </p>
        </div>
      </div>

      {/* Trash button — stays active even on OOS (D-11) */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        aria-disabled={isPending}
        aria-label={`Remove ${item.productName} from cart`}
        title="Remove from cart"
        className={[
          "shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors",
          "text-muted hover:text-destructive hover:bg-red-50 dark:hover:bg-red-500/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          isPending ? "opacity-40 cursor-not-allowed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Heroicons TrashIcon 18px */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-[18px] h-[18px]"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}
