// src/app/admin/orders/page.tsx
// Admin Orders list (ADMN-03) — UI-SPEC Surface 4.
// Next.js 16: searchParams is a Promise — MUST await, mirrors src/app/admin/products/page.tsx.
//
// Row-level auth: this page itself does NOT re-call verifyAdminSession — the shared
// /admin/layout.tsx shell already does (D-02 layer 2).

import { Suspense } from "react"
import Link from "next/link"
import { listOrdersForAdmin, type OrderStatus } from "@/lib/catalog/admin-queries"
import { formatNGN } from "@/lib/catalog/format"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"

interface OrdersPageProps {
  searchParams: Promise<{ status?: string; page?: string }>
}

// ─── Icons (Heroicons v2, inlined) ─────────────────────────────────────────────

function InboxIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-zinc-300 dark:text-zinc-600" aria-hidden="true">
      <path d="M2.25 13.5a8.25 8.25 0 1 1 16.5 0v3a3 3 0 0 1-3 3h-10.5a3 3 0 0 1-3-3v-3Z" />
      <path fillRule="evenodd" d="M12 2.25a9.75 9.75 0 0 0-9.75 9.75v.75a.75.75 0 0 0 .75.75h4.146a2.25 2.25 0 0 1 2.121 1.5l.512 1.464a1.5 1.5 0 0 0 1.415 1.036h1.612a1.5 1.5 0 0 0 1.415-1.036l.512-1.464a2.25 2.25 0 0 1 2.121-1.5H21a.75.75 0 0 0 .75-.75V12A9.75 9.75 0 0 0 12 2.25Z" clipRule="evenodd" />
    </svg>
  )
}

function CreditCardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-muted" aria-hidden="true">
      <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
      <path fillRule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" />
    </svg>
  )
}

function BuildingLibraryIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-muted" aria-hidden="true">
      <path d="M11.584 2.376a.75.75 0 0 1 .832 0l9 6a.75.75 0 1 1-.832 1.248L12 3.901 3.416 9.624a.75.75 0 0 1-.832-1.248l9-6Z" />
      <path fillRule="evenodd" d="M20.25 10.332v9.918H21a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1 0-1.5h.75v-9.918a.75.75 0 0 1 .634-.74A49.109 49.109 0 0 1 12 9c2.59 0 5.134.202 7.616.592a.75.75 0 0 1 .634.74Zm-7.5 2.418a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Zm3-.75a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-1.5 0v-6.75a.75.75 0 0 1 .75-.75ZM9 12.75a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Payment method display (derived — orders have no single "paymentMethod" column) ──
// Stripe uses stripePaymentIntentId; Paystack/Flutterwave (and future gateways) use
// gatewayProvider; anything with neither is a bank-transfer order (D-11 scope: only
// stripe/bank_transfer are relevant here in practice).

function paymentMethodDisplay(row: { gatewayProvider: string | null; hasStripePaymentIntent: boolean }): {
  label: string
  icon: React.ReactNode
} {
  if (row.hasStripePaymentIntent) {
    return { label: "Card (Stripe)", icon: <CreditCardIcon /> }
  }
  if (row.gatewayProvider) {
    const label = row.gatewayProvider.charAt(0).toUpperCase() + row.gatewayProvider.slice(1)
    return { label, icon: <CreditCardIcon /> }
  }
  return { label: "Bank transfer", icon: <BuildingLibraryIcon /> }
}

// ─── Date formatting — relative + absolute title ───────────────────────────────

function relativeDate(date: Date): string {
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "seconds"],
    [60, "minutes"],
    [24, "hours"],
    [7, "days"],
    [4.34524, "weeks"],
    [12, "months"],
    [Number.POSITIVE_INFINITY, "years"],
  ]

  let duration = diffSec
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) {
      return rtf.format(Math.round(duration), unit)
    }
    duration /= amount
  }
  return rtf.format(Math.round(duration), "years")
}

// ─── Status filter ──────────────────────────────────────────────────────────────

const ORDER_STATUSES: OrderStatusValue[] = [
  "pending_payment",
  "awaiting_bank_transfer",
  "payment_confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "payment_failed",
]

const STATUS_FILTER_LABELS: Record<OrderStatusValue, string> = {
  pending_payment: "Pending payment",
  awaiting_bank_transfer: "Awaiting bank transfer",
  payment_confirmed: "Payment confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  payment_failed: "Payment failed",
}

function chipHref(status: string): string {
  return status === "all" ? "/admin/orders" : `/admin/orders?status=${status}`
}

// ─── Content ────────────────────────────────────────────────────────────────────

async function OrdersContent({ searchParams }: OrdersPageProps) {
  const sp = await searchParams
  const status =
    sp.status && ORDER_STATUSES.includes(sp.status as OrderStatusValue)
      ? (sp.status as OrderStatus)
      : undefined
  const page = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1

  const result = await listOrdersForAdmin({ status, page })
  const hasFilter = !!status

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Orders</h1>
      </div>

      {/* Status filter — horizontal segmented control, All + 8 statuses */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={chipHref("all")}
          aria-current={!hasFilter ? "true" : undefined}
          className={[
            "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            !hasFilter
              ? "bg-brand-soft text-brand-strong border-brand/30 ring-2 ring-brand"
              : "bg-surface text-muted border-border hover:text-foreground hover:bg-brand-soft/50",
          ].join(" ")}
        >
          All
        </Link>
        {ORDER_STATUSES.map((s) => {
          const isCurrent = status === s
          return (
            <Link
              key={s}
              href={chipHref(s)}
              aria-current={isCurrent ? "true" : undefined}
              className={[
                "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                isCurrent
                  ? "bg-brand-soft text-brand-strong border-brand/30 ring-2 ring-brand"
                  : "bg-surface text-muted border-border hover:text-foreground hover:bg-brand-soft/50",
              ].join(" ")}
            >
              {STATUS_FILTER_LABELS[s]}
            </Link>
          )
        })}
      </div>

      {result.orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-surface border border-border">
          <InboxIcon />
          {hasFilter ? (
            <>
              <h2 className="text-2xl font-semibold text-foreground mt-4">No orders with this status</h2>
              <p className="text-sm text-muted mt-2 max-w-sm">
                Try a different status filter, or view all orders.
              </p>
              <Link
                href="/admin/orders"
                className="mt-4 text-sm font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
              >
                View all orders
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-foreground mt-4">No orders yet</h2>
              <p className="text-sm text-muted mt-2 max-w-sm">
                Orders will appear here as soon as a customer checks out.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-surface border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Reference</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Date</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Customer</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Total</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Payment</th>
                <th scope="col" className="text-left font-semibold text-foreground px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.map((order) => {
                const method = paymentMethodDisplay(order)
                return (
                  <tr key={order.id} className="border-b border-border last:border-0 hover:bg-brand-soft/20 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-mono font-semibold text-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
                      >
                        {order.reference}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <span title={order.createdAt.toLocaleString("en-NG")}>
                        {relativeDate(order.createdAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-foreground">{order.customerEmail}</td>
                    <td className="px-5 py-3 text-foreground font-semibold">{formatNGN(order.totalKobo)}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        {method.icon}
                        {method.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.pageCount > 1 && (
        <p className="text-sm text-muted text-center">
          Page {result.page} of {result.pageCount}
        </p>
      )}
    </div>
  )
}

function OrdersSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="h-10 w-full max-w-2xl rounded-full bg-zinc-100 dark:bg-zinc-800" />
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 border-b border-border last:border-0 bg-zinc-100 dark:bg-zinc-800/50" />
        ))}
      </div>
    </div>
  )
}

export default function AdminOrdersPage(props: OrdersPageProps) {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersContent {...props} />
    </Suspense>
  )
}
