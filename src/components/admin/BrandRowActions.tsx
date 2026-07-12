"use client"
// src/components/admin/BrandRowActions.tsx
// Brands-list row actions: inline Rename editor + Deactivate (confirm modal) / Reactivate.
// Mirrors CategoryRowActions.tsx (brands have no slug). Deactivate is destructive → confirm;
// Reactivate is reversible → fires immediately. Friendly duplicate-name error via role="alert".

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { renameBrand, deactivateBrand, reactivateBrand } from "@/lib/actions/admin-taxonomy"

interface BrandRowActionsProps {
  brand: { id: string; name: string; isActive: boolean }
}

export function BrandRowActions({ brand }: BrandRowActionsProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(brand.name)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRename() {
    setError(null)
    startTransition(async () => {
      const result = await renameBrand(brand.id, { name })
      if (!result.success) {
        setError(result.error)
      } else {
        setEditing(false)
        router.refresh()
      }
    })
  }

  function handleReactivate() {
    setError(null)
    startTransition(async () => {
      const result = await reactivateBrand(brand.id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  function handleDeactivateConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await deactivateBrand(brand.id)
      if (!result.success) {
        setError(result.error)
      } else {
        setConfirmOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="relative flex items-center justify-end gap-3">
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`New name for ${brand.name}`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="button"
            onClick={handleRename}
            disabled={isPending || name.trim().length === 0}
            className="rounded-lg bg-brand hover:bg-brand-strong text-white px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setName(brand.name); setError(null) }}
            className="text-sm font-semibold text-muted hover:text-foreground rounded px-2 py-1.5"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
          >
            Rename
          </button>
          {brand.isActive ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="text-sm font-semibold text-stock-out hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={handleReactivate}
              className="text-sm font-semibold text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded disabled:opacity-50"
            >
              Reactivate
            </button>
          )}
        </>
      )}

      {error && !confirmOpen && (
        <p role="alert" className="text-sm font-semibold text-stock-out">{error}</p>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-brand-title"
            className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl"
          >
            <h2 id="deactivate-brand-title" className="text-2xl font-semibold text-foreground">
              Deactivate {brand.name}?
            </h2>
            <p className="text-sm text-muted mt-2">
              This removes the brand from the storefront filters immediately. Products keep
              their brand. You can reactivate it anytime.
            </p>
            {error && (
              <p role="alert" className="text-sm font-semibold text-stock-out mt-3">{error}</p>
            )}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-sm font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded px-3 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivateConfirm}
                disabled={isPending}
                aria-disabled={isPending}
                className="rounded-lg bg-stock-out hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {isPending ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
