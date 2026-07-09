"use client"
// src/components/admin/OrderStatusControl.tsx
// Guided fulfillment-status transition control (ADMN-03/ORD-03) — UI-SPEC Surface 5.
// Renders ONE primary button per server-supplied legal next state (D-08) — NEVER a
// free-choice dropdown (Pitfall 3). Bank-transfer confirm ("Confirm payment received")
// delegates to the exact same updateOrderStatus -> confirmOrderPaid path used for card
// payments (D-09) — this component never reimplements the stock-decrement/idempotency
// logic, it only calls the one shared Server Action.
// Pattern: useTransition + disable-siblings-while-pending, mirroring CartStepper.tsx.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateOrderStatus } from "@/lib/actions/admin-orders"
import type { OrderStatusValue } from "./OrderStatusBadge"

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pending payment",
  awaiting_bank_transfer: "Awaiting bank transfer",
  payment_confirmed: "Payment confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  payment_failed: "Payment failed",
}

const GENERIC_ILLEGAL_TRANSITION_MESSAGE =
  "That status change isn't allowed. Orders can only move forward one step at a time. Refresh the page to see the current status."

// ─── Icons (Heroicons v2, inlined) ─────────────────────────────────────────────

function ArrowPathIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className ?? "w-4 h-4"} aria-hidden="true">
      <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z" clipRule="evenodd" />
    </svg>
  )
}

function BuildingLibraryIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M11.584 2.376a.75.75 0 0 1 .832 0l9 6a.75.75 0 1 1-.832 1.248L12 3.901 3.416 9.624a.75.75 0 0 1-.832-1.248l9-6Z" />
      <path fillRule="evenodd" d="M20.25 10.332v9.918H21a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1 0-1.5h.75v-9.918a.75.75 0 0 1 .634-.74A49.109 49.109 0 0 1 12 9c2.59 0 5.134.202 7.616.592a.75.75 0 0 1 .634.74Zm-7.5 2.418a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Zm3-.75a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-1.5 0v-6.75a.75.75 0 0 1 .75-.75ZM9 12.75a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Confirm dialog (destructive/irreversible-but-non-destructive share this shell) ──
// UI-SPEC Interaction Rules: "Destructive actions always confirm" (Cancel order) and
// "Non-destructive-but-irreversible actions" (Confirm bank transfer) — the latter's
// confirm button is brand-colored, not red.

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmVariant,
  onConfirm,
  onCancel,
  pending,
  error,
}: {
  title: string
  body: string
  confirmLabel: string
  confirmVariant: "brand" | "destructive"
  onConfirm: () => void
  onCancel: () => void
  pending: boolean
  error: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-status-dialog-title"
        className="relative w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl"
      >
        <h2 id="order-status-dialog-title" className="text-2xl font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted mt-2">{body}</p>
        {error && (
          <p role="alert" className="text-sm font-semibold text-stock-out mt-3">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded px-3 py-2"
          >
            {confirmVariant === "destructive" ? "Keep order" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-disabled={pending}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50",
              confirmVariant === "destructive" ? "bg-stock-out hover:bg-red-700" : "bg-brand hover:bg-brand-strong",
            ].join(" ")}
          >
            {pending ? "Updating…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── OrderStatusControl ─────────────────────────────────────────────────────────

interface OrderStatusControlProps {
  orderId: string
  currentStatus: OrderStatusValue
  validNextStatuses: string[]
  customerEmail: string
  reference: string
  itemCount: number
}

export function OrderStatusControl({
  orderId,
  currentStatus,
  validNextStatuses,
  customerEmail,
  reference,
  itemCount,
}: OrderStatusControlProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [successNote, setSuccessNote] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<"bankTransfer" | "cancel" | null>(null)

  function runTransition(nextStatus: string) {
    setErrorMessage(null)
    setSuccessNote(null)
    setPendingStatus(nextStatus)
    startTransition(async () => {
      try {
        const result = await updateOrderStatus(orderId, nextStatus)
        if (!result.success) {
          if (result.outcome === "oversold") {
            setErrorMessage(
              "This payment could not be confirmed — one or more items sold out before confirmation. A refund is required."
            )
          } else {
            setErrorMessage(GENERIC_ILLEGAL_TRANSITION_MESSAGE)
          }
          setPendingStatus(null)
          return
        }
        const label = STATUS_LABELS[nextStatus] ?? nextStatus
        const emailNote =
          nextStatus === "shipped" || nextStatus === "delivered" ? ` ${customerEmail} was notified.` : ""
        setSuccessNote(`Marked as ${label}.${emailNote}`)
        setConfirmDialog(null)
        setPendingStatus(null)
        router.refresh()
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : GENERIC_ILLEGAL_TRANSITION_MESSAGE)
        setPendingStatus(null)
      }
    })
  }

  const hasCancelOption = validNextStatuses.includes("cancelled")
  const showBankTransferConfirm =
    currentStatus === "awaiting_bank_transfer" && validNextStatuses.includes("payment_confirmed")
  const genericNextStatuses = validNextStatuses.filter(
    (s) => s !== "cancelled" && !(showBankTransferConfirm && s === "payment_confirmed")
  )
  const isTerminal = validNextStatuses.length === 0

  return (
    <div className="space-y-3">
      {isTerminal && (
        <p className="text-sm text-muted">
          {currentStatus === "delivered"
            ? "This order is complete."
            : currentStatus === "cancelled"
              ? "This order was cancelled."
              : "No further action is available for this order."}
        </p>
      )}

      {showBankTransferConfirm && (
        <div className="rounded-xl border border-border bg-brand-soft/30 p-4 space-y-2">
          <button
            type="button"
            onClick={() => setConfirmDialog("bankTransfer")}
            disabled={isPending}
            aria-disabled={isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand hover:bg-brand-strong text-white px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {isPending && pendingStatus === "payment_confirmed" ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <BuildingLibraryIcon />
                Confirm payment received
              </>
            )}
          </button>
          <p className="text-sm text-muted">
            Routes through the same confirmation path used for card payments — stock will
            be decremented and the customer will be emailed.
          </p>
        </div>
      )}

      {genericNextStatuses.map((nextStatus) => (
        <button
          key={nextStatus}
          type="button"
          onClick={() => runTransition(nextStatus)}
          disabled={isPending}
          aria-disabled={isPending}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand hover:bg-brand-strong text-white px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {isPending && pendingStatus === nextStatus ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Updating…
            </>
          ) : (
            `Mark as ${STATUS_LABELS[nextStatus] ?? nextStatus}`
          )}
        </button>
      ))}

      {hasCancelOption && (
        <button
          type="button"
          onClick={() => setConfirmDialog("cancel")}
          disabled={isPending}
          aria-disabled={isPending}
          className="w-full text-sm font-semibold text-stock-out hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          Cancel order
        </button>
      )}

      {successNote && (
        <p role="status" className="text-sm font-semibold text-stock-in">
          {successNote}
        </p>
      )}
      {errorMessage && !confirmDialog && (
        <p role="alert" className="text-sm font-semibold text-stock-out">
          {errorMessage}
        </p>
      )}

      {confirmDialog === "bankTransfer" && (
        <ConfirmDialog
          title="Confirm you've received this payment?"
          body={`This marks the order paid, decrements stock for ${itemCount} item(s), and cannot be undone from here. Only confirm after checking your bank account for ${reference}.`}
          confirmLabel="Confirm payment received"
          confirmVariant="brand"
          pending={isPending}
          error={errorMessage}
          onConfirm={() => runTransition("payment_confirmed")}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {confirmDialog === "cancel" && (
        <ConfirmDialog
          title="Cancel this order?"
          body="This cancels the order permanently. It cannot be reopened from here."
          confirmLabel="Cancel order"
          confirmVariant="destructive"
          pending={isPending}
          error={errorMessage}
          onConfirm={() => runTransition("cancelled")}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
