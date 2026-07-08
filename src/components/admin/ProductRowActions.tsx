"use client"
// src/components/admin/ProductRowActions.tsx
// Products-list row actions: Edit link + overflow menu (Deactivate/Reactivate).
// Deactivate is destructive and confirms via a centered modal dialog (UI-SPEC
// Interaction Rules — "Destructive actions always confirm"). Reactivate is reversible
// and non-destructive, so it fires immediately (UI-SPEC: "reactivate anytime from the
// same menu").

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { deactivateProduct, reactivateProduct } from "@/lib/actions/admin-products"

function EllipsisVerticalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M12 6.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM13.5 18.75a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  )
}

interface ProductRowActionsProps {
  productId: string
  productName: string
  isActive: boolean
}

export function ProductRowActions({ productId, productName, isActive }: ProductRowActionsProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleReactivate() {
    setMenuOpen(false)
    setError(null)
    startTransition(async () => {
      const result = await reactivateProduct(productId)
      if (!result.success) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleDeactivateConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await deactivateProduct(productId)
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
      <Link
        href={`/admin/products/${productId}/edit`}
        className="text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
      >
        Edit
      </Link>

      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={`More actions for ${productName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-brand-soft/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <EllipsisVerticalIcon />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl bg-surface border border-border shadow-lg py-1"
          >
            {isActive ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmOpen(true)
                }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-stock-out hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                disabled={isPending}
                onClick={handleReactivate}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-soft/50 transition-colors disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        </>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-dialog-title"
            className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl"
          >
            <h2 id="deactivate-dialog-title" className="text-2xl font-semibold text-foreground">
              Deactivate {productName}?
            </h2>
            <p className="text-sm text-muted mt-2">
              This hides it from the storefront immediately. Existing orders keep their
              details. You can reactivate it anytime from the same menu.
            </p>
            {error && (
              <p role="alert" className="text-sm font-semibold text-stock-out mt-3">
                {error}
              </p>
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
