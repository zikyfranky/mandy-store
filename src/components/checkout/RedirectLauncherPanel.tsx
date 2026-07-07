"use client"
// src/components/checkout/RedirectLauncherPanel.tsx
// Shared redirect launcher backing the three redirect-native NGN gateways (Interswitch, GTPay,
// Remita). UI-SPEC §Component Inventory "optional consolidation" — one launcher, three thin panels.
//
// UX (UI-SPEC §4d): a single "Place order" button → "Processing…" → full-page navigation.
//   - POST redirect (Interswitch/GTPay): build a hidden auto-submit <form> and .submit() it.
//   - GET redirect (Remita): window.location.assign(url).
// Both look identical to the customer. The only net-new visual is the §4c helper line.
// Secrets never reach here — the init action returns only the non-secret POST fields + URL.

import { useState, useCallback } from "react"
import type { UseFormTrigger, UseFormGetValues } from "react-hook-form"
import type { CheckoutInput } from "@/lib/actions/checkout"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

type RedirectInitResult =
  | { mode: "redirect"; url: string; method: "POST"; fields: Record<string, string>; guestToken: string }
  | { mode: "redirect"; url: string; guestToken: string }
  | { error: string }

interface RedirectLauncherPanelProps {
  initAction: (input: CheckoutInput) => Promise<RedirectInitResult>
  gatewayName: string
  getValues: UseFormGetValues<AnyFormValues>
  trigger: UseFormTrigger<AnyFormValues>
  hasOOS: boolean
}

// ─── Shared SVG icons (mirrored from PaystackPaymentPanel) ────────────────────

const SpinnerIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 animate-spin" aria-hidden="true">
    <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z" clipRule="evenodd" />
  </svg>
)

const LockIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
    <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
  </svg>
)

const ExclamationIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-stock-out shrink-0" aria-hidden="true">
    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
  </svg>
)

// ─── Hidden POST auto-submit form (UI-SPEC §7.2 — invisible, never React-rendered) ──
function submitPostForm(url: string, fields: Record<string, string>): void {
  const form = document.createElement("form")
  form.method = "POST"
  form.action = url
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

export function RedirectLauncherPanel({
  initAction,
  gatewayName,
  getValues,
  trigger,
  hasOOS,
}: RedirectLauncherPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [panelError, setPanelError] = useState<{ title: string; body: string } | null>(null)

  const handlePlaceOrder = useCallback(async () => {
    if (isSubmitting) return
    setPanelError(null)

    // Validation-before-launch (UI-SPEC §4d)
    const isValid = await trigger()
    if (!isValid) return

    setIsSubmitting(true)

    try {
      const values = getValues()
      const result = await initAction({
        email: values.email,
        address: {
          fullName: values.address.fullName,
          phone: values.address.phone,
          street: values.address.street,
          city: values.address.city,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: values.address.state as any,
          landmark: values.address.landmark || undefined,
        },
      })

      if ("error" in result) {
        setPanelError({ title: "Order could not be started", body: result.error })
        setIsSubmitting(false)
        return
      }

      // Success → launch the redirect. Leave the button in "Processing…" (never re-enable on success).
      if ("method" in result && result.method === "POST") {
        submitPostForm(result.url, result.fields) // Interswitch / GTPay
      } else {
        window.location.assign(result.url) // Remita (plain GET)
      }
    } catch (err) {
      // §6 re-enable rule — stay on page, show inline error
      console.error(`[${gatewayName}] place order failed:`, err)
      setPanelError({
        title: "Order could not be started",
        body: "Something went wrong starting your payment. Please check your connection and try again.",
      })
      setIsSubmitting(false)
    }
  }, [getValues, trigger, isSubmitting, initAction, gatewayName])

  return (
    <div className="mt-4 rounded-xl border border-border p-4 space-y-4">
      {/* Inline error banner — byte-identical to PaystackPaymentPanel */}
      {panelError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 flex gap-3 items-start"
        >
          {ExclamationIcon}
          <div>
            <p className="text-sm font-semibold text-stock-out">{panelError.title}</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{panelError.body}</p>
          </div>
        </div>
      )}

      {/* §4c helper — the only net-new visual element */}
      <p className="text-sm text-muted">
        You&apos;ll be securely redirected to {gatewayName} to complete your payment, then brought back here.
      </p>

      {/* Place order CTA — byte-identical to PaystackPaymentPanel */}
      <button
        type="button"
        onClick={handlePlaceOrder}
        disabled={isSubmitting || hasOOS}
        aria-disabled={isSubmitting || hasOOS}
        aria-label={hasOOS ? "Remove out-of-stock items from your cart before placing an order" : undefined}
        className="w-full rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-4 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            {SpinnerIcon}
            Processing…
          </>
        ) : (
          <>
            {LockIcon}
            Place order
          </>
        )}
      </button>
    </div>
  )
}
