"use client"
// src/components/admin/VariantEditor.tsx
// Product editor "Variants" card (D-05, ADMN-02) — UI-SPEC Surface 3 §3.
// Each row is saved independently via its own Server Action call (upsertVariant),
// mirroring CartLineItem's row + remove-button pattern rather than being bundled
// into the parent ProductForm's single submit. Price is entered/displayed in naira;
// converted to kobo at the input boundary (server re-validates int().positive()).

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { inputClass } from "@/components/admin/formStyles"
import { upsertVariant, upsertOptionValue } from "@/lib/actions/admin-products"

export type VariantEditorOptionValue = { id: string; value: string }
export type VariantEditorOption = { id: string; name: string; values: VariantEditorOptionValue[] }
export type VariantEditorVariant = {
  id: string
  priceKobo: number
  stock: number
  isActive: boolean
  optionValueIds: string[]
  optionLabel: string
}

interface VariantEditorProps {
  productId: string
  options: VariantEditorOption[]
  variants: VariantEditorVariant[]
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ─── One saved variant row ──────────────────────────────────────────────────────

function VariantRow({ productId, variant }: { productId: string; variant: VariantEditorVariant }) {
  const router = useRouter()
  const [priceNaira, setPriceNaira] = useState(String(variant.priceKobo / 100))
  const [stock, setStock] = useState(String(variant.stock))
  const [isActive, setIsActive] = useState(variant.isActive)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [isPending, startTransition] = useTransition()

  function persist(overrides?: Partial<{ isActive: boolean }>) {
    setError(null)
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100)
    const stockNum = parseInt(stock || "0", 10)
    if (!Number.isFinite(priceKobo) || priceKobo <= 0) {
      setError("Price must be greater than ₦0")
      return
    }
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setError("Stock cannot be negative")
      return
    }
    startTransition(async () => {
      const result = await upsertVariant(productId, {
        id: variant.id,
        priceKobo,
        stock: stockNum,
        isActive: overrides?.isActive ?? isActive,
      })
      if (!result.success) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleToggleActive() {
    const next = !isActive
    setIsActive(next)
    persist({ isActive: next })
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await upsertVariant(productId, { id: variant.id, remove: true })
      if (!result.success) {
        setError(result.error)
      } else {
        setConfirmRemove(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-4 border-b border-border last:border-0">
      <div className="flex flex-wrap items-start gap-3">
        {/* Option-value chips */}
        <span className="text-sm font-semibold text-foreground min-w-0 shrink-0 py-2.5">
          {variant.optionLabel || "Default"}
        </span>

        <div className="flex-1 min-w-[140px]">
          <label className="sr-only" htmlFor={`price-${variant.id}`}>Price (₦)</label>
          <input
            id={`price-${variant.id}`}
            type="number"
            min="0"
            step="0.01"
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            onBlur={() => persist()}
            className={inputClass(!!error)}
            aria-label={`Price for ${variant.optionLabel}`}
          />
        </div>

        <div className="w-28">
          <label className="sr-only" htmlFor={`stock-${variant.id}`}>Stock</label>
          <input
            id={`stock-${variant.id}`}
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            onBlur={() => persist()}
            className={inputClass(!!error)}
            aria-label={`Stock for ${variant.optionLabel}`}
          />
        </div>

        {/* Active toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={`${isActive ? "Deactivate" : "Activate"} variant ${variant.optionLabel}`}
          onClick={handleToggleActive}
          disabled={isPending}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors mt-2",
            isActive ? "bg-brand" : "bg-zinc-300 dark:bg-zinc-600",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              isActive ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>

        {/* Remove — 44x44 touch target, copied from CartLineItem */}
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={isPending}
          aria-label={`Remove variant ${variant.optionLabel}`}
          title="Remove variant"
          className={[
            "shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors",
            "text-muted hover:text-stock-out hover:bg-red-50 dark:hover:bg-red-500/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            isPending ? "opacity-40 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <TrashIcon />
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-stock-out">{error}</p>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmRemove(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="remove-variant-title" className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl">
            <h2 id="remove-variant-title" className="text-2xl font-semibold text-foreground">Remove this variant?</h2>
            <p className="text-sm text-muted mt-2">
              {variant.optionLabel} will be removed from this product when you save.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button type="button" onClick={() => setConfirmRemove(false)} className="text-sm font-semibold text-muted hover:text-foreground rounded px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
                Keep it
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="rounded-lg bg-stock-out hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add-variant inline picker ───────────────────────────────────────────────────

function AddVariantForm({ productId, options }: { productId: string; options: VariantEditorOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [priceNaira, setPriceNaira] = useState("")
  const [stock, setStock] = useState("")
  const [newOptionName, setNewOptionName] = useState("")
  const [newOptionValue, setNewOptionValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAddOptionValue() {
    if (!newOptionName.trim() || !newOptionValue.trim()) {
      setError("Enter both an option name and a value")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await upsertOptionValue(productId, {
        optionName: newOptionName.trim(),
        value: newOptionValue.trim(),
      })
      if (!result.success) {
        setError(result.error)
      } else {
        setNewOptionName("")
        setNewOptionValue("")
        router.refresh()
      }
    })
  }

  function handleSubmit() {
    setError(null)
    const missingOption = options.find((o) => !selected[o.id])
    if (options.length > 0 && missingOption) {
      setError(`Select a value for "${missingOption.name}"`)
      return
    }
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100)
    const stockNum = parseInt(stock || "0", 10)
    if (!Number.isFinite(priceKobo) || priceKobo <= 0) {
      setError("Price must be greater than ₦0")
      return
    }
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setError("Stock cannot be negative")
      return
    }
    startTransition(async () => {
      const result = await upsertVariant(productId, {
        priceKobo,
        stock: stockNum,
        isActive: true,
        optionValueIds: Object.values(selected),
      })
      if (!result.success) {
        setError(result.error)
      } else {
        setOpen(false)
        setSelected({})
        setPriceNaira("")
        setStock("")
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <div className="px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
        >
          + Add variant
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 py-4 space-y-4 bg-brand-soft/30">
      {options.map((option) => (
        <div key={option.id}>
          <p className="text-sm font-semibold text-foreground mb-1">{option.name}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={option.name}>
            {option.values.map((value) => (
              <button
                key={value.id}
                type="button"
                role="radio"
                aria-checked={selected[option.id] === value.id}
                onClick={() => setSelected((prev) => ({ ...prev, [option.id]: value.id }))}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                  selected[option.id] === value.id
                    ? "bg-brand text-white border-brand"
                    : "bg-surface text-foreground border-border hover:bg-brand-soft/50",
                ].join(" ")}
              >
                {value.value}
              </button>
            ))}
            {option.values.length === 0 && (
              <p className="text-sm text-muted">No values yet — add one below.</p>
            )}
          </div>
        </div>
      ))}

      {/* Define a new option/value inline (e.g. new Color "Gold") */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="new-option-name" className="block text-sm font-semibold text-foreground mb-1">
            Option name
          </label>
          <input
            id="new-option-name"
            type="text"
            placeholder="Color"
            value={newOptionName}
            onChange={(e) => setNewOptionName(e.target.value)}
            className={inputClass()}
          />
        </div>
        <div>
          <label htmlFor="new-option-value" className="block text-sm font-semibold text-foreground mb-1">
            Value
          </label>
          <input
            id="new-option-value"
            type="text"
            placeholder="Gold"
            value={newOptionValue}
            onChange={(e) => setNewOptionValue(e.target.value)}
            className={inputClass()}
          />
        </div>
        <button
          type="button"
          onClick={handleAddOptionValue}
          disabled={isPending}
          className="rounded-lg border border-border px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-brand-soft/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          + Add option value
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="new-variant-price" className="block text-sm font-semibold text-foreground mb-1">
            Price (₦)
          </label>
          <input
            id="new-variant-price"
            type="number"
            min="0"
            step="0.01"
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            className={inputClass()}
          />
        </div>
        <div>
          <label htmlFor="new-variant-stock" className="block text-sm font-semibold text-foreground mb-1">
            Stock
          </label>
          <input
            id="new-variant-stock"
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className={inputClass()}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-stock-out">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-lg bg-brand hover:bg-brand-strong text-white px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save variant"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── VariantEditor ───────────────────────────────────────────────────────────────

export function VariantEditor({ productId, options, variants }: VariantEditorProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {variants.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          No variants yet — add at least one variant with a price and stock level before
          this product appears on the storefront.
        </p>
      ) : (
        variants.map((variant) => (
          <VariantRow key={variant.id} productId={productId} variant={variant} />
        ))
      )}
      <AddVariantForm productId={productId} options={options} />
    </div>
  )
}
