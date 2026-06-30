"use client"
// src/components/checkout/StripePaymentPanel.tsx
// Stripe Payment Element panel — mounts after createStripePaymentIntent returns clientSecret.
// UI-SPEC §4b / Interaction Contracts (Stripe card path) / D-05 / D-08
// Security: NEVER logs or exposes clientSecret beyond browser; no Stripe SECRET key here.
// Uses @stripe/react-stripe-js + @stripe/stripe-js — Stripe's SAQ-A iframe model (T-04-23).

import { useState, useCallback } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { createStripePaymentIntent } from "@/lib/actions/checkout"
import type { UseFormTrigger, UseFormGetValues } from "react-hook-form"

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

interface StripePaymentPanelProps {
  publishableKey: string
  // These come from react-hook-form in the parent CheckoutForm.
  // Typed as any to avoid duplicating the Zod enum type between components.
  getValues: UseFormGetValues<AnyFormValues>
  trigger: UseFormTrigger<AnyFormValues>
  hasOOS: boolean
}

// ─── Stripe Appearance API (UI-SPEC §4b) ──────────────────────────────────────

function getAppearance(): import("@stripe/stripe-js").Appearance {
  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches

  return {
    theme: "stripe",
    variables: {
      colorPrimary: "#4f46e5",
      colorBackground: isDark ? "#131320" : "#ffffff",
      colorText: isDark ? "#f4f4f8" : "#0b0b14",
      colorDanger: "#dc2626",
      fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
      borderRadius: "8px",
      spacingUnit: "4px",
    },
  }
}

// ─── Stripe decline code → user-friendly message (UI-SPEC §6) ────────────────

function mapStripeError(error: { code?: string; message?: string }): {
  title: string
  body: string
} {
  switch (error.code) {
    case "card_declined":
      return {
        title: "Your card was declined",
        body: "Please try a different card or payment method.",
      }
    case "insufficient_funds":
      return {
        title: "Insufficient funds",
        body: "Please check your balance or try a different card.",
      }
    case "incorrect_cvc":
      return {
        title: "Incorrect security code (CVC)",
        body: "Please check and try again.",
      }
    case "expired_card":
      return {
        title: "Your card has expired",
        body: "Please use a different card.",
      }
    case "generic_decline":
      return {
        title: "Payment could not be processed",
        body: "Please try again or use a different payment method.",
      }
    default:
      return {
        title: "Payment could not be processed",
        body: error.message ?? "Please try again or use a different payment method.",
      }
  }
}

// ─── Inner ConfirmButton (uses Stripe hooks — must be inside <Elements>) ─────

interface ConfirmButtonProps {
  guestToken: string
  hasOOS: boolean
}

function ConfirmButton({ guestToken, hasOOS }: ConfirmButtonProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<{ title: string; body: string } | null>(null)

  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/order/${guestToken}`
    : `/order/${guestToken}`

  async function handleConfirm() {
    if (!stripe || !elements || isSubmitting) return
    setPaymentError(null)
    setIsSubmitting(true) // Pitfall 7: disable on first click (T-04-26)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    })

    if (error) {
      // D-08: stay on page, show inline error, re-enable button
      setPaymentError(mapStripeError({ code: error.code, message: error.message }))
      setIsSubmitting(false)
    }
    // On success: Stripe redirects to /order/{guestToken}
  }

  return (
    <div className="space-y-4">
      {/* §6 Inline error banner (D-08 — stays on /checkout) */}
      {paymentError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 flex gap-3 items-start"
        >
          {/* Heroicons ExclamationCircleIcon 20px */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 text-stock-out shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-stock-out">{paymentError.title}</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{paymentError.body}</p>
          </div>
        </div>
      )}

      {/* §4d Place order CTA */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!stripe || !elements || isSubmitting || hasOOS}
        aria-disabled={!stripe || !elements || isSubmitting || hasOOS}
        aria-label={
          hasOOS
            ? "Remove out-of-stock items from your cart before placing an order"
            : undefined
        }
        className="w-full rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-4 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            {/* Heroicons ArrowPathIcon 20px animate-spin */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 animate-spin"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
                clipRule="evenodd"
              />
            </svg>
            Processing…
          </>
        ) : (
          <>
            {/* Heroicons LockClosedIcon 16px */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                clipRule="evenodd"
              />
            </svg>
            Place order
          </>
        )}
      </button>
    </div>
  )
}

// ─── StripePaymentPanel ───────────────────────────────────────────────────────

export function StripePaymentPanel({
  publishableKey,
  getValues,
  trigger,
  hasOOS,
}: StripePaymentPanelProps) {
  // Module-level singleton — loadStripe is called once; subsequent calls return the same promise
  const [stripePromise] = useState(() => loadStripe(publishableKey))
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [guestToken, setGuestToken] = useState<string | null>(null)
  const [isCreatingIntent, setIsCreatingIntent] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)

  const handlePlaceOrder = useCallback(async () => {
    setIntentError(null)

    // Validate address before calling the action
    const isValid = await trigger()
    if (!isValid) return

    setIsCreatingIntent(true) // Pitfall 7: disable on first click (T-04-26)

    const values = getValues()
    const result = await createStripePaymentIntent({
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
      setIntentError(result.error)
      setIsCreatingIntent(false) // re-enable on error (D-08)
      return
    }

    // Mount the Elements panel with the returned clientSecret
    setClientSecret(result.clientSecret)
    setGuestToken(result.guestToken)
    setIsCreatingIntent(false)
  }, [getValues, trigger])

  // Loading skeleton while Stripe.js loads (§4b)
  const skeleton = (
    <div
      className="h-[120px] rounded-xl bg-zinc-200 dark:bg-zinc-700 animate-pulse"
      aria-hidden="true"
    />
  )

  return (
    <div className="mt-4 rounded-xl border border-border p-4 space-y-4">
      {/* Intent creation error banner */}
      {intentError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 flex gap-3 items-start"
        >
          {/* Heroicons ExclamationCircleIcon 20px */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 text-stock-out shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-stock-out">Order could not be started</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{intentError}</p>
          </div>
        </div>
      )}

      {clientSecret && guestToken ? (
        /* Elements mounted after clientSecret obtained (RESEARCH Pattern 1) */
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: getAppearance(),
          }}
        >
          {/* §4b: Payment Element mount container */}
          <div className="min-h-[48px]" aria-busy={false}>
            <PaymentElement
              options={{
                layout: "tabs",
              }}
            />
          </div>

          {/* Inner confirm component that uses useStripe + useElements */}
          <ConfirmButton guestToken={guestToken} hasOOS={hasOOS} />
        </Elements>
      ) : (
        <>
          {/* §4b: loading skeleton or initial "Place order" button */}
          {isCreatingIntent ? (
            skeleton
          ) : (
            <div className="min-h-[48px] rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <p className="text-sm text-muted">Card fields will appear after clicking Place order</p>
            </div>
          )}

          {/* §4d Place order CTA — triggers createStripePaymentIntent */}
          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={isCreatingIntent || hasOOS}
            aria-disabled={isCreatingIntent || hasOOS}
            aria-label={
              hasOOS
                ? "Remove out-of-stock items from your cart before placing an order"
                : undefined
            }
            className="w-full rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-4 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreatingIntent ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5 animate-spin"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
                    clipRule="evenodd"
                  />
                </svg>
                Processing…
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                Place order
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}
