// src/app/order/[token]/page.tsx
// Order confirmation / status page — Server Component.
// Access: 64-char hex token URL only (IDOR-safe, D-12). No login required.
// Three states: payment_confirmed (§7a), awaiting_bank_transfer (§7b), pending_payment (§7c).
// Bank account details read HERE (server-side only) and passed as props — never in client components (D-10, T-04-29).
// NO 'use cache' — order status must always be fresh (D-06, D-07).

import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { getOrderByToken } from "@/lib/orders/queries"
import { OrderConfirmedView } from "@/components/order/OrderConfirmedView"
import { BankTransferView } from "@/components/order/BankTransferView"
import { PaymentProcessingView } from "@/components/order/PaymentProcessingView"
import { OrderSummaryLines } from "@/components/order/OrderSummaryLines"
import { ShippingAddressBlock } from "@/components/order/ShippingAddressBlock"
import { PostPurchaseAccountOffer } from "@/components/order/PostPurchaseAccountOffer"

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderPageProps {
  params: Promise<{ token: string }>
}

// ─── generateMetadata ─────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const order = await getOrderByToken(token)
  if (!order) return {}
  return { title: `Order ${order.reference} — Mandy Store` }
}

// ─── OrderNotFound ────────────────────────────────────────────────────────────
// §8 — styled 404 card; do NOT call notFound() (we want the styled card, not Next's 404 page)

function OrderNotFound() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl bg-surface border border-border p-8 text-center space-y-4">
        {/* Heroicons DocumentMagnifyingGlassIcon 48px */}
        <div className="flex justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-12 h-12 text-zinc-300 dark:text-zinc-600"
            aria-hidden="true"
          >
            <path d="M11.625 16.5a1.875 1.875 0 1 0 0-3.75 1.875 1.875 0 0 0 0 3.75Z" />
            <path
              fillRule="evenodd"
              d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Zm6 16.5c.66 0 1.277-.19 1.797-.518l1.048 1.048a.75.75 0 0 0 1.06-1.06l-1.047-1.048A3.375 3.375 0 1 0 11.625 18Z"
              clipRule="evenodd"
            />
            <path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Order not found</h1>
        <p className="text-sm text-muted">
          This order link may have expired or been mistyped. Check your email for the
          original link.
        </p>
        <Link
          href="/products"
          className="text-sm font-semibold text-brand hover:text-brand-strong"
        >
          Back to shop
        </Link>
      </div>
    </main>
  )
}

// ─── OrderPageSkeleton ────────────────────────────────────────────────────────

function OrderPageSkeleton() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl bg-surface border border-border p-8 space-y-6 animate-pulse">
        <div className="h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700 mx-auto" />
        <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-700 mx-auto" />
        <div className="h-4 w-64 rounded bg-zinc-200 dark:bg-zinc-700 mx-auto" />
        <div className="h-32 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
      </div>
    </main>
  )
}

// ─── OrderContent (async) ─────────────────────────────────────────────────────
// Reads order by token, branches on status, reads bank env server-side.

async function OrderContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const order = await getOrderByToken(token)

  if (!order) {
    return <OrderNotFound />
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const orderUrl = `${appUrl}/order/${order.guestToken}`

  // Build the confirmed view (Server Component JSX) to pass to PaymentProcessingView as a prop (option a)
  const confirmedView = (
    <>
      <OrderConfirmedView order={order} orderUrl={orderUrl} />
      <hr className="border-t border-border" />
      <OrderSummaryLines
        items={order.items}
        subtotalKobo={order.subtotalKobo}
        shippingKobo={order.shippingKobo}
        totalKobo={order.totalKobo}
      />
      <ShippingAddressBlock
        shippingName={order.shippingName}
        shippingPhone={order.shippingPhone}
        shippingStreet={order.shippingStreet}
        shippingCity={order.shippingCity}
        shippingState={order.shippingState}
        shippingLandmark={order.shippingLandmark ?? null}
      />
      {order.userId === null && (
        <PostPurchaseAccountOffer token={order.guestToken} />
      )}
    </>
  )

  // State-specific content block
  let stateContent: React.ReactNode

  if (order.status === "payment_confirmed") {
    stateContent = (
      <>
        <OrderConfirmedView order={order} orderUrl={orderUrl} />
        <hr className="border-t border-border" />
        <OrderSummaryLines
          items={order.items}
          subtotalKobo={order.subtotalKobo}
          shippingKobo={order.shippingKobo}
          totalKobo={order.totalKobo}
        />
        <ShippingAddressBlock
          shippingName={order.shippingName}
          shippingPhone={order.shippingPhone}
          shippingStreet={order.shippingStreet}
          shippingCity={order.shippingCity}
          shippingState={order.shippingState}
          shippingLandmark={order.shippingLandmark ?? null}
        />
        {order.userId === null && (
          <PostPurchaseAccountOffer token={order.guestToken} />
        )}
      </>
    )
  } else if (order.status === "awaiting_bank_transfer") {
    // D-10: bank env read HERE in the server component — never inside a client component
    stateContent = (
      <>
        <BankTransferView
          order={order}
          bankName={process.env.BANK_NAME ?? ""}
          bankAccountNumber={process.env.BANK_ACCOUNT_NUMBER ?? ""}
          bankAccountName={process.env.BANK_ACCOUNT_NAME ?? ""}
        />
        <OrderSummaryLines
          items={order.items}
          subtotalKobo={order.subtotalKobo}
          shippingKobo={order.shippingKobo}
          totalKobo={order.totalKobo}
        />
        <ShippingAddressBlock
          shippingName={order.shippingName}
          shippingPhone={order.shippingPhone}
          shippingStreet={order.shippingStreet}
          shippingCity={order.shippingCity}
          shippingState={order.shippingState}
          shippingLandmark={order.shippingLandmark ?? null}
        />
        {order.userId === null && (
          <PostPurchaseAccountOffer token={order.guestToken} />
        )}
      </>
    )
  } else if (order.status === "pending_payment") {
    // D-07: processing interstitial polls /api/order/status/:token
    // Pass the pre-built confirmedView as a prop so PaymentProcessingView (client) can swap to it
    stateContent = (
      <PaymentProcessingView token={order.guestToken} confirmedView={confirmedView} />
    )
  } else {
    // payment_failed or other — minimal "contact us" card
    stateContent = (
      <div className="text-center space-y-4">
        {/* Heroicons ExclamationCircleIcon 48px */}
        <div className="flex justify-center">
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
        <h1 className="text-2xl font-semibold text-foreground">
          Payment could not be processed
        </h1>
        <p className="text-sm text-muted">
          Your payment could not be confirmed. Please try checking out again.
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

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl bg-surface border border-border p-8 space-y-6">
        {stateContent}
      </div>
    </main>
  )
}

// ─── OrderPage (default export) ───────────────────────────────────────────────

export default function OrderPage({ params }: OrderPageProps) {
  return (
    <Suspense fallback={<OrderPageSkeleton />}>
      <OrderContent params={params} />
    </Suspense>
  )
}
