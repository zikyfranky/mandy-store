// src/components/order/OrderSummaryLines.tsx
// Read-only order summary lines — shared across all /order/[token] states (§7d).
// Server Component. Props: items from the order snapshot + kobo totals.
// Uses formatNGN for all money display (D-04/RESEARCH Pattern 10).

import { formatNGN } from "@/lib/catalog/format"

interface OrderItem {
  productName: string
  variantLabel: string | null
  quantity: number
  lineTotalKobo: number
}

interface OrderSummaryLinesProps {
  items: OrderItem[]
  subtotalKobo: number
  shippingKobo: number
  totalKobo: number
}

export function OrderSummaryLines({
  items,
  subtotalKobo,
  shippingKobo,
  totalKobo,
}: OrderSummaryLinesProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-3">Your order</h2>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3 items-start">
            {/* Thumbnail placeholder — order snapshot has no imageUrl */}
            <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center">
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
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug">
                {item.productName}
              </p>
              {item.variantLabel && (
                <p className="text-sm text-muted">{item.variantLabel}</p>
              )}
              <p className="text-sm text-muted">Qty: {item.quantity}</p>
            </div>
            <span className="text-sm font-semibold text-foreground shrink-0">
              {formatNGN(item.lineTotalKobo)}
            </span>
          </div>
        ))}
      </div>

      <hr className="border-t border-border my-3" />

      <div className="flex justify-between text-sm font-semibold">
        <span className="text-muted">Subtotal</span>
        <span className="text-foreground">{formatNGN(subtotalKobo)}</span>
      </div>
      <div className="flex justify-between text-sm font-semibold mt-1">
        <span className="text-muted">Shipping</span>
        <span className="text-foreground">{formatNGN(shippingKobo)}</span>
      </div>

      <hr className="border-t border-border my-3" />

      <div className="flex justify-between">
        <span className="text-sm font-semibold text-foreground">Total</span>
        <span className="text-2xl font-semibold text-foreground">
          {formatNGN(totalKobo)}
        </span>
      </div>
    </div>
  )
}
