"use client"
// src/components/checkout/FlutterwavePaymentPanel.tsx
// Flutterwave inline modal panel — calls initFlutterwavePayment, configures useFlutterwave hook,
// opens the modal, verifies server-side on success, then redirects to /order/[guestToken].
// D-03: customer stays on /checkout throughout payment.
// D-08: only public key (from init action) is used; FLUTTERWAVE_SECRET_KEY never appears here.
// RESEARCH Pattern 2: server assembles popup params, client invokes FlutterwaveCheckout.

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useFlutterwave, closePaymentModal } from "flutterwave-react-v3"
import type { FlutterWaveResponse } from "flutterwave-react-v3/dist/types"
import { initFlutterwavePayment } from "@/lib/actions/flutterwave"
import { verifyFlutterwavePayment } from "@/lib/actions/flutterwave"
import type { UseFormTrigger, UseFormGetValues } from "react-hook-form"

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

interface FlutterwavePaymentPanelProps {
  getValues: UseFormGetValues<AnyFormValues>
  trigger: UseFormTrigger<AnyFormValues>
  hasOOS: boolean
}

// ─── Flutterwave init data (stored in state after init action returns) ─────────

interface FlwInitData {
  publicKey: string
  txRef: string
  amountNaira: number
  email: string
  customerName: string
  phone: string | undefined
  guestToken: string
}

// ─── Shared SVG icons (mirrored from StripePaymentPanel) ─────────────────────

const SpinnerIcon = (
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
)

const LockIcon = (
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
)

const ExclamationIcon = (
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
)

// ─── FlutterwavePaymentPanel ───────────────────────────────────────────────────

export function FlutterwavePaymentPanel({
  getValues,
  trigger,
  hasOOS,
}: FlutterwavePaymentPanelProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [panelError, setPanelError] = useState<{ title: string; body: string } | null>(null)
  // Holds the init result from initFlutterwavePayment; used to configure the hook.
  const [flwData, setFlwData] = useState<FlwInitData | null>(null)

  // useFlutterwave must be called at the component top level (React hooks rule).
  // When flwData is null (before init), we pass placeholder values; handlePayment is only
  // invoked after flwData is populated (guarded in the click handler below).
  const handleFlutterwavePayment = useFlutterwave({
    public_key: flwData?.publicKey ?? "",
    tx_ref: flwData?.txRef ?? "",
    amount: flwData?.amountNaira ?? 0,
    currency: "NGN",
    payment_options: "card,ussd,banktransfer",
    customer: {
      email: flwData?.email ?? "",
      name: flwData?.customerName ?? "",
      phone_number: flwData?.phone ?? "",
    },
    customizations: {
      title: "Mandy Store",
      description: "Payment for your order",
      logo: "",
    },
  })

  const handlePlaceOrder = useCallback(async () => {
    if (isSubmitting) return
    setPanelError(null)

    // Validate address + contact fields before calling the action
    const isValid = await trigger()
    if (!isValid) return

    setIsSubmitting(true) // disable on first click (T-04-26 pattern)

    try {
      const values = getValues()
      const initResult = await initFlutterwavePayment({
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

      if ("error" in initResult) {
        setPanelError({
          title: "Order could not be started",
          body: initResult.error,
        })
        setIsSubmitting(false)
        return
      }

      // Store the init data — the hook config will be updated on the next render.
      // We then call handleFlutterwavePayment with fresh callbacks immediately after.
      // Because setFlwData triggers re-render but we need to open the modal in this same
      // tick, we pass the initResult directly to the callbacks instead of reading flwData state.
      const data = initResult
      setFlwData(data)

      // Open the Flutterwave modal with the initialized data.
      // Callbacks capture `data` (closure) so they don't depend on flwData state timing.
      handleFlutterwavePayment({
        callback: async (resp: FlutterWaveResponse) => {
          closePaymentModal()
          // RESEARCH Anti-pattern: DO NOT redirect before verify returns (T-07-18)
          try {
            const verifyResult = await verifyFlutterwavePayment({
              transactionId: String(resp.transaction_id),
              txRef: data.txRef,
            })
            if ("error" in verifyResult) {
              setPanelError({
                title: "Payment could not be confirmed",
                body: verifyResult.error,
              })
              setIsSubmitting(false)
            } else {
              // Verified — redirect to the confirmed order page
              router.push("/order/" + verifyResult.guestToken)
              // Button stays disabled during redirect
            }
          } catch (err) {
            console.error("[flutterwave] verifyFlutterwavePayment threw:", err)
            setPanelError({
              title: "Payment could not be confirmed",
              body: "We could not verify your payment. Please contact support if you were charged.",
            })
            setIsSubmitting(false)
          }
        },
        onClose: () => {
          // Customer closed modal without completing payment — stay on page, re-enable (Pitfall 2)
          setIsSubmitting(false)
        },
      })
    } catch (err) {
      // Unexpected throw (network drop, action rejection) — show inline error, re-enable
      console.error("[flutterwave] place order failed:", err)
      setPanelError({
        title: "Order could not be started",
        body: "Something went wrong starting your payment. Please check your connection and try again.",
      })
      setIsSubmitting(false)
    }
  }, [getValues, trigger, isSubmitting, router, handleFlutterwavePayment])

  return (
    <div className="mt-4 rounded-xl border border-border p-4 space-y-4">
      {/* Inline error banner — same markup as StripePaymentPanel (D-08 — stays on /checkout) */}
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

      {/* Place order CTA — disabled while submitting or OOS */}
      <button
        type="button"
        onClick={handlePlaceOrder}
        disabled={isSubmitting || hasOOS}
        aria-disabled={isSubmitting || hasOOS}
        aria-label={
          hasOOS
            ? "Remove out-of-stock items from your cart before placing an order"
            : undefined
        }
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
