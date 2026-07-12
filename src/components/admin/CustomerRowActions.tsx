"use client"
// src/components/admin/CustomerRowActions.tsx
// Customers-list row actions (Phase 9, ADMN-09/10, D-05). Mirrors ProductRowActions.
// - "Send password reset" fires immediately (reversible — issues a one-time email link).
// - Role change is privileged and confirms via a centered modal dialog.
// - The acting admin's own row has the role toggle DISABLED (self-lockout is enforced
//   server-side too — the action is the sole authority; this is a UX guard, T-09-02).
// Receives only {customerId,email,role,isSelf} — never passwordHash/tokens (D-06, T-09-06).

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { sendCustomerPasswordReset, updateCustomerRole } from "@/lib/actions/admin-customers"

interface CustomerRowActionsProps {
  customerId: string
  email: string
  role: "customer" | "admin"
  isSelf: boolean
}

export function CustomerRowActions({ customerId, email, role, isSelf }: CustomerRowActionsProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const nextRole = role === "admin" ? "customer" : "admin"
  const toggleLabel = role === "admin" ? "Revoke admin" : "Make admin"

  function handleSendReset() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const r = await sendCustomerPasswordReset(customerId)
      if (!r.success) {
        setError(r.error ?? "Could not send reset link")
      } else {
        setNotice("Reset link sent")
        setTimeout(() => setNotice(null), 4000)
      }
    })
  }

  function handleRoleConfirm() {
    setError(null)
    startTransition(async () => {
      const r = await updateCustomerRole(customerId, nextRole)
      if (!r.success) {
        setError(r.error ?? "Could not change role")
      } else {
        setConfirmOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="relative flex items-center justify-end gap-3">
      {notice && (
        <span role="status" className="text-sm font-semibold text-green-600 dark:text-green-400">
          {notice}
        </span>
      )}

      <button
        type="button"
        onClick={handleSendReset}
        disabled={isPending}
        className="text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded disabled:opacity-50"
      >
        Send password reset
      </button>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isSelf}
        aria-disabled={isSelf}
        title={isSelf ? "You can't change your own role" : undefined}
        className="text-sm font-semibold text-foreground hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {toggleLabel}
      </button>

      {/* Inline error for the reset action (dialog has its own error surface) */}
      {error && !confirmOpen && (
        <span role="alert" className="text-sm font-semibold text-stock-out">
          {error}
        </span>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-dialog-title"
            className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl"
          >
            <h2 id="role-dialog-title" className="text-2xl font-semibold text-foreground">
              {role === "admin" ? "Revoke admin access?" : "Make this customer an admin?"}
            </h2>
            <p className="text-sm text-muted mt-2">
              {role === "admin"
                ? `${email} will lose access to the admin panel on their next request.`
                : `${email} will gain full access to the admin panel, including products, orders, settings, and customers.`}
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
                onClick={handleRoleConfirm}
                disabled={isPending}
                aria-disabled={isPending}
                className="rounded-lg bg-brand hover:bg-brand-strong text-white px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {isPending ? "Saving…" : toggleLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
