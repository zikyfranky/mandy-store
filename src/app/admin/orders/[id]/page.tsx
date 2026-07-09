// src/app/admin/orders/[id]/page.tsx
// Admin order detail (ADMN-03/ORD-03) — UI-SPEC Surface 5.
// Next.js 16: params is a Promise — MUST await.
// Loads via getOrderForAdmin(id) — the ONE pinned admin order-detail read (Plan 02).
// Reuses OrderSummaryLines + ShippingAddressBlock verbatim, read-only, exactly as
// /order/[token]/page.tsx does for the customer-facing confirmation page.

import { Suspense } from "react"
import Link from "next/link"
import { getOrderForAdmin } from "@/lib/catalog/admin-queries"
import { getValidNextStatuses } from "@/lib/orders/legal-transitions"
import { formatNGN } from "@/lib/catalog/format"
import { OrderSummaryLines } from "@/components/order/OrderSummaryLines"
import { ShippingAddressBlock } from "@/components/order/ShippingAddressBlock"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"
import { OrderStatusControl } from "@/components/admin/OrderStatusControl"

interface OrderDetailPageProps {
  params: Promise<{ id: string }>
}

// ─── Payment method display (derived — see admin/orders/page.tsx for the same logic) ──

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

// ─── OrderNotFound (styled 404, matches /order/[token]'s treatment) ─────────────

function OrderNotFound() {
  return (
    <div className="rounded-2xl bg-surface border border-border p-8 text-center space-y-4">
      <div className="flex justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-zinc-300 dark:text-zinc-600" aria-hidden="true">
          <path d="M11.625 16.5a1.875 1.875 0 1 0 0-3.75 1.875 1.875 0 0 0 0 3.75Z" />
          <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Zm6 16.5c.66 0 1.277-.19 1.797-.518l1.048 1.048a.75.75 0 0 0 1.06-1.06l-1.047-1.048A3.375 3.375 0 1 0 11.625 18Z" clipRule="evenodd" />
          <path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold text-foreground">Order not found</h1>
      <p className="text-sm text-muted">
        This order may have been removed or the link is incorrect.
      </p>
      <Link href="/admin/orders" className="text-sm font-semibold text-brand hover:text-brand-strong">
        Back to orders
      </Link>
    </div>
  )
}

// ─── Content ────────────────────────────────────────────────────────────────────

async function OrderDetailContent({ params }: OrderDetailPageProps) {
  const { id } = await params
  const order = await getOrderForAdmin(id)

  if (!order) {
    return <OrderNotFound />
  }

  const validNextStatuses = getValidNextStatuses(order.status)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Order {order.reference}</h1>
          <p className="text-sm text-muted mt-1">
            Placed {order.createdAt.toLocaleString("en-NG")}
          </p>
        </div>
        <OrderStatusBadge status={order.status as OrderStatusValue} />
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 space-y-6 lg:space-y-0">
        {/* Left column */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-surface border border-border p-6">
            <OrderSummaryLines
              items={order.items}
              subtotalKobo={order.subtotalKobo}
              shippingKobo={order.shippingKobo}
              totalKobo={order.totalKobo}
            />
          </div>

          <div className="rounded-2xl bg-surface border border-border p-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground mb-1">Payment details</h2>
            <div className="text-sm text-muted space-y-1">
              <p>
                <span className="text-foreground font-semibold">Method: </span>
                {paymentMethodLabel(order)}
              </p>
              {order.stripePaymentIntentId && (
                <p>
                  <span className="text-foreground font-semibold">Stripe PI: </span>
                  <span className="font-mono">{order.stripePaymentIntentId}</span>
                </p>
              )}
              {order.gatewayProvider && (
                <p>
                  <span className="text-foreground font-semibold">Gateway: </span>
                  {order.gatewayProvider}
                </p>
              )}
              {order.gatewayReference && (
                <p>
                  <span className="text-foreground font-semibold">Gateway reference: </span>
                  <span className="font-mono">{order.gatewayReference}</span>
                </p>
              )}
              <p>
                <span className="text-foreground font-semibold">Total: </span>
                {formatNGN(order.totalKobo)}
              </p>
              <p>
                <span className="text-foreground font-semibold">Paid at: </span>
                {order.paidAt ? order.paidAt.toLocaleString("en-NG") : "Not yet paid"}
              </p>
            </div>
          </div>
        </div>

        {/* Right column (sidebar) */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-surface border border-border p-6">
            <ShippingAddressBlock
              shippingName={order.shippingName}
              shippingPhone={order.shippingPhone}
              shippingStreet={order.shippingStreet}
              shippingCity={order.shippingCity}
              shippingState={order.shippingState}
              shippingLandmark={order.shippingLandmark ?? null}
            />
          </div>

          <div className="rounded-2xl bg-surface border border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Fulfillment</h2>
              <OrderStatusBadge status={order.status as OrderStatusValue} />
            </div>
            <OrderStatusControl
              orderId={order.id}
              currentStatus={order.status as OrderStatusValue}
              validNextStatuses={validNextStatuses}
              customerEmail={order.customerEmail}
              reference={order.reference}
              itemCount={order.items.length}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-64 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 space-y-6 lg:space-y-0">
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </div>
  )
}

export default function AdminOrderDetailPage(props: OrderDetailPageProps) {
  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetailContent {...props} />
    </Suspense>
  )
}
