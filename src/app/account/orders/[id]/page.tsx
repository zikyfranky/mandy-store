// src/app/account/orders/[id]/page.tsx
// Customer order-detail page — IDOR-safe (D-04, T-06-05).
// SECURITY: verifySession() is called FIRST — in-page re-verify (layer 2, CLAUDE.md dual-auth).
// Loads via getOrderForUser(session.id, id) — ownership lives in the SQL WHERE clause (Plan 01).
// On a miss (missing OR belongs to another user), renders an IDENTICAL styled "not found" card
// — never Next's built-in not-found helper, which would break out of the storefront shell —
// so no existence leak distinguishes "doesn't exist" from "not yours" (single code path,
// D-04 core requirement).
// Reuses OrderSummaryLines + ShippingAddressBlock verbatim, exactly as /order/[token] does.
// Total is rendered straight from the purchase snapshot — never recomputed (SC2).

import { Suspense } from "react"
import Link from "next/link"
import { verifySession } from "@/lib/dal"
import { getOrderForUser } from "@/lib/orders/queries"
import { OrderSummaryLines } from "@/components/order/OrderSummaryLines"
import { ShippingAddressBlock } from "@/components/order/ShippingAddressBlock"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"

interface OrderDetailPageProps {
  params: Promise<{ id: string }>
}

// ─── Payment method label (ported, not imported — the admin helper lives in an ───
// admin-scoped page file that customer code should not depend on)

function paymentMethodLabel(order: {
  gatewayProvider: string | null
  stripePaymentIntentId: string | null
}): string {
  if (order.stripePaymentIntentId) return "Card (Stripe)"
  if (order.gatewayProvider) {
    return order.gatewayProvider.charAt(0).toUpperCase() + order.gatewayProvider.slice(1)
  }
  return "Bank transfer"
}

// ─── OrderNotFound (styled 404 card — identical for missing & not-owned, D-04) ──

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
          This order doesn&apos;t exist or isn&apos;t linked to your account. Check your
          order history for the correct link.
        </p>
        <Link
          href="/account/orders"
          className="text-sm font-semibold text-brand hover:text-brand-strong"
        >
          Back to order history
        </Link>
      </div>
    </main>
  )
}

// ─── OrderPageSkeleton (copied verbatim from /order/[token]) ────────────────────

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

// ─── OrderDetailContent (async) ──────────────────────────────────────────────────

async function OrderDetailContent({ params }: OrderDetailPageProps) {
  // In-page re-verify — DAL layer 2 of dual-layer protection (CLAUDE.md, T-06-06)
  const session = await verifySession()
  const { id } = await params // Next.js 16: params is a Promise — MUST await

  const order = await getOrderForUser(session.id, id)

  if (!order) {
    // D-04: same styled card for "doesn't exist" AND "belongs to another user" — no
    // existence leak. Intentionally NOT using Next's built-in not-found helper here.
    return <OrderNotFound />
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl bg-surface border border-border p-8 space-y-6">
        <div>
          <OrderStatusBadge status={order.status as OrderStatusValue} />
          <h1 className="text-2xl font-semibold text-foreground mt-3">
            Order {order.reference}
          </h1>
          <p className="text-sm text-muted mt-1">
            Placed{" "}
            {order.createdAt.toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        <hr className="border-t border-border" />

        {/* Total shown only from the purchase snapshot — never recomputed (SC2) */}
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

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2">Payment method</h2>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            {paymentMethodLabel(order)}
          </span>
        </div>

        <hr className="border-t border-border" />

        <Link
          href="/account/orders"
          className="text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
        >
          ← Back to order history
        </Link>
      </div>
    </main>
  )
}

// ─── OrderDetailPage (default export) ────────────────────────────────────────────

export default function OrderDetailPage(props: OrderDetailPageProps) {
  return (
    <Suspense fallback={<OrderPageSkeleton />}>
      <OrderDetailContent {...props} />
    </Suspense>
  )
}
