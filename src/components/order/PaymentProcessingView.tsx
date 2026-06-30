"use client"
// src/components/order/PaymentProcessingView.tsx
// Payment processing interstitial — shown when status === "pending_payment" (§7c, D-07).
// Polls /api/order/status/:token every 2s. On payment_confirmed, swaps to confirmedView.
// After 30s without resolution, shows fallback copy but keeps polling.
// On payment_failed, shows error state + link to /checkout.
// aria-live="polite" so screen readers announce the transition (Accessibility Contract).

import { useState, useEffect, useRef, ReactNode } from "react"
import Link from "next/link"

interface PaymentProcessingViewProps {
  token: string
  confirmedView: ReactNode
}

export function PaymentProcessingView({
  token,
  confirmedView,
}: PaymentProcessingViewProps) {
  const [resolved, setResolved] = useState<"pending" | "confirmed" | "failed">("pending")
  const [showFallback, setShowFallback] = useState(false)
  const [fadeIn, setFadeIn] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 30s fallback timer
    fallbackRef.current = setTimeout(() => {
      setShowFallback(true)
    }, 30_000)

    // Poll every 2 seconds
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/order/status/${token}`)
        if (!res.ok) return // keep polling on network errors

        const data: { status: string } = await res.json()

        if (data.status === "payment_confirmed") {
          clearInterval(intervalRef.current!)
          clearTimeout(fallbackRef.current!)
          setFadeIn(true)
          // Brief delay for fade transition
          setTimeout(() => setResolved("confirmed"), 100)
        } else if (data.status === "payment_failed") {
          clearInterval(intervalRef.current!)
          clearTimeout(fallbackRef.current!)
          setResolved("failed")
        }
        // For "pending_payment" — keep polling
      } catch {
        // Network error — keep polling silently
      }
    }, 2_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (fallbackRef.current) clearTimeout(fallbackRef.current)
    }
  }, [token])

  // Transition to confirmed state
  if (resolved === "confirmed") {
    return (
      <div
        className={`transition-opacity duration-500 ${fadeIn ? "opacity-100" : "opacity-0"}`}
        aria-live="polite"
      >
        {confirmedView}
      </div>
    )
  }

  // Payment failed state
  if (resolved === "failed") {
    return (
      <div className="space-y-6 text-center" aria-live="polite">
        <div className="flex justify-center">
          {/* Heroicons ExclamationCircleIcon 48px */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-12 h-12 text-stock-out"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Payment could not be confirmed</h1>
        <p className="text-base text-muted">
          Your payment could not be confirmed. Please return to checkout and try again.
        </p>
        <Link
          href="/checkout"
          className="inline-flex rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Return to checkout
        </Link>
      </div>
    )
  }

  // Processing state (pending)
  return (
    <div className="space-y-6" aria-live="polite">
      {/* Spinner icon */}
      <div className="flex justify-center">
        <div className="w-12 h-12 flex items-center justify-center">
          {/* Heroicons ArrowPathIcon animate-spin */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-12 h-12 text-brand animate-spin"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-semibold text-foreground mt-4">
          Payment processing&hellip;
        </h1>
        <p className="text-base text-muted mt-4">
          We&apos;re confirming your payment. This usually takes a few seconds — please
          don&apos;t close this page.
        </p>
      </div>

      {/* Indeterminate progress bar */}
      <div className="mt-6 w-full h-1 rounded-full bg-brand-soft overflow-hidden" aria-hidden="true">
        <div className="h-full bg-brand rounded-full animate-pulse" />
      </div>

      {/* 30s fallback message */}
      {showFallback && (
        <p className="text-sm text-muted text-center mt-4">
          Taking longer than expected?{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-brand hover:text-brand-strong font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
          >
            Refresh this page
          </button>{" "}
          or check your email for a confirmation.
        </p>
      )}
    </div>
  )
}
