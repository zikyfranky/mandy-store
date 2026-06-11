"use client"
// src/components/product/VariantSelector.tsx
// Interactive variant selection client component (D-15/D-16/D-17/D-18).
// Props are passed from the Server Component — no server round-trips on selection.
// Price comes from server-provided variant.priceKobo — client NEVER computes price (CLAUDE.md).

import { useState, useEffect } from "react"
import { formatNGN } from "@/lib/catalog/format"
import {
  resolveVariant,
  isOptionValueAvailable,
  type VariantForSelector,
} from "@/lib/catalog/variant"
import { StockIndicator } from "@/components/product/StockIndicator"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OptionForSelector {
  id: string
  name: string
  values: { id: string; value: string }[]
}

export interface VariantSelectorProps {
  options: OptionForSelector[]
  variants: VariantForSelector[]
  lowStockThreshold?: number
  /** Callback to lift variant imageUrl to parent for gallery swap (D-19) */
  onVariantImageChange?: (url: string | null) => void
}

// ─── Helper: detect color options ────────────────────────────────────────────

function isColorOption(name: string): boolean {
  return /color|colour/i.test(name)
}

// ─── VariantSelector ─────────────────────────────────────────────────────────

export function VariantSelector({
  options,
  variants,
  lowStockThreshold = 5,
  onVariantImageChange,
}: VariantSelectorProps) {
  // Initialize to first in-stock variant's option values if available, else first variant (UI-SPEC step 1)
  function buildInitialSelected(): Record<string, string> {
    const firstInStock = variants.find((v) => v.stock > 0)
    const seed = firstInStock ?? variants[0]
    if (!seed) return {}
    return Object.fromEntries(
      seed.optionValues.map((ov) => [
        ov.optionValue.productOption.name,
        ov.optionValue.id,
      ])
    )
  }

  const [selected, setSelected] = useState<Record<string, string>>(
    buildInitialSelected
  )

  const resolvedVariant = resolveVariant(variants, selected)

  // D-19: notify parent when resolved variant's imageUrl changes
  useEffect(() => {
    onVariantImageChange?.(resolvedVariant?.imageUrl ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedVariant?.id])

  function handleOptionSelect(optionName: string, valueId: string) {
    setSelected((prev) => ({ ...prev, [optionName]: valueId }))
  }

  const isOOS = !resolvedVariant || resolvedVariant.stock === 0
  const ctaLabel = isOOS ? "Out of stock" : "Add to cart"

  return (
    <div className="space-y-6">
      {/* Price — aria-live so screen readers announce variant-driven updates */}
      <div aria-live="polite" aria-atomic="true">
        {resolvedVariant ? (
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {formatNGN(resolvedVariant.priceKobo)}
          </p>
        ) : (
          <p className="text-2xl font-semibold text-zinc-400 dark:text-zinc-600">
            —
          </p>
        )}
      </div>

      {/* Stock indicator (D-17) */}
      <StockIndicator
        stock={resolvedVariant?.stock ?? 0}
        threshold={lowStockThreshold}
      />

      {/* Option groups */}
      <div className="space-y-4">
        {options.map((option) => {
          const isColor = isColorOption(option.name)
          const selectedValueId = selected[option.name]

          return (
            <div key={option.id}>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                {option.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {option.values.map((val) => {
                  const isSelected = selectedValueId === val.id
                  const available = isOptionValueAvailable(
                    variants,
                    { ...selected, [option.name]: val.id },
                    option.name,
                    val.id
                  )

                  if (isColor) {
                    // Swatch button (D-15 / UI-SPEC)
                    return (
                      <button
                        key={val.id}
                        type="button"
                        onClick={() => handleOptionSelect(option.name, val.id)}
                        disabled={!available}
                        aria-pressed={isSelected}
                        aria-disabled={!available}
                        title={!available ? "Out of stock" : val.value}
                        aria-label={`${val.value}${!available ? " — Out of stock" : ""}`}
                        className={[
                          "relative w-8 h-8 rounded-full border-2 transition-all",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                          isSelected
                            ? "border-blue-600 ring-2 ring-blue-600 ring-offset-2"
                            : "border-transparent hover:border-zinc-400",
                          !available ? "opacity-40 cursor-not-allowed" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ backgroundColor: val.value.toLowerCase() }}
                      />
                    )
                  }

                  // Pill button (D-15 / UI-SPEC)
                  return (
                    <button
                      key={val.id}
                      type="button"
                      onClick={() => handleOptionSelect(option.name, val.id)}
                      disabled={!available}
                      aria-pressed={isSelected}
                      aria-disabled={!available}
                      title={!available ? "Out of stock" : undefined}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                        isSelected
                          ? "border-blue-600 ring-2 ring-blue-600 text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900"
                          : "border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:border-zinc-500",
                        !available
                          ? "border-zinc-200 text-zinc-400 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-900 cursor-not-allowed opacity-50"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {val.value}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add-to-cart CTA (D-18 stub) */}
      {/* Phase 3 wires cart — onClick is a no-op stub this phase */}
      <button
        type="button"
        disabled={isOOS}
        aria-disabled={isOOS}
        onClick={() => {
          // Phase 3 wires cart — this is a no-op stub (D-18)
          // console.debug("add-to-cart stub: variant", resolvedVariant?.id)
        }}
        className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 text-base font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {ctaLabel}
      </button>
    </div>
  )
}
