// src/components/order/OrderConfirmedView.tsx
// Success state for the /order/[token] page — shown when status === "payment_confirmed" (§7a).
// Server Component. Receives the full order object + the order URL for the copy CTA.
// D-06: display only — never sets or computes payment status.

import Link from "next/link"
import { CopyButton } from "@/components/ui/CopyButton"

interface Order {
  reference: string
  customerEmail: string
  shippingName: string
  guestToken: string
}

interface OrderConfirmedViewProps {
  order: Order
  orderUrl: string
}

export function OrderConfirmedView({ order, orderUrl }: OrderConfirmedViewProps) {
  // Extract first name from shipping name for the greeting
  const firstName = order.shippingName.split(" ")[0] || "there"

  return (
    <div className="space-y-6">
      {/* Icon */}
      <div className="flex justify-center">
        {/* Heroicons CheckCircleIcon 48px */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-12 h-12 text-stock-in"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Heading */}
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-foreground mt-4">
          Order confirmed!
        </h1>

        {/* Status pill */}
        <div className="flex justify-center mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-500/10 px-3 py-1 text-sm font-semibold text-stock-in">
            Payment received
          </span>
        </div>

        {/* Body */}
        <p className="text-base text-muted mt-4">
          Thank you, {firstName}. We&apos;ve received your payment and will begin processing
          your order. A confirmation has been sent to{" "}
          <span className="font-semibold">{order.customerEmail}</span>.
        </p>

        {/* Order reference */}
        <p className="text-sm text-muted mt-3">
          Order reference:{" "}
          <span className="inline-flex items-center rounded-full bg-brand-soft px-4 py-1 text-sm font-semibold text-brand font-mono">
            {order.reference}
          </span>
        </p>
      </div>

      <hr className="border-t border-border" />

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/products"
          className="rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-3 text-sm font-semibold text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Continue shopping
        </Link>
        <CopyButton
          value={orderUrl}
          label="View this order"
          copiedLabel="Link copied!"
          className="rounded-xl border border-border hover:border-brand text-foreground px-6 py-3 text-sm font-semibold text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
      </div>
    </div>
  )
}
