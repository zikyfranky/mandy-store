"use client"
// src/components/product/StockIndicator.tsx
// Tiered stock display component (D-17).
// Rendered inside VariantSelector (client context) — "use client" allows flexibility
// as a standalone importable component.
// aria-live="polite" announces changes when variant selection updates stock.

import { stockLabel, stockTier } from "@/lib/catalog/variant"

interface StockIndicatorProps {
  stock: number
  threshold?: number
}

export function StockIndicator({ stock, threshold = 5 }: StockIndicatorProps) {
  const tier = stockTier(stock, threshold)
  const label = stockLabel(stock, threshold)

  const colorClass =
    tier === "in"
      ? "text-green-600 dark:text-green-400"
      : tier === "low"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400"

  return (
    <p
      className={`text-sm font-semibold ${colorClass}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {label}
    </p>
  )
}
