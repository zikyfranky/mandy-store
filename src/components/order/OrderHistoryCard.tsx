// src/components/order/OrderHistoryCard.tsx
// Whole-card link row for the /account/orders history list (D-01).
// Net-new component this phase — everything else is verbatim reuse or inline JSX.
// Absolute date (toLocaleDateString) — UI-SPEC Decision Log #3: a customer's own short
// order history reads better with the literal date than admin's relative-time triage
// convention (that helper is intentionally not ported here).

import Link from "next/link"
import { formatNGN } from "@/lib/catalog/format"
import { OrderStatusBadge, type OrderStatusValue } from "@/components/admin/OrderStatusBadge"

interface OrderHistoryCardProps {
  order: {
    id: string
    reference: string
    createdAt: Date
    status: OrderStatusValue
    totalKobo: number
    itemCount: number
  }
}

export function OrderHistoryCard({ order }: OrderHistoryCardProps) {
  return (
    <Link
      href={`/account/orders/${order.id}`}
      className="block rounded-2xl bg-surface border border-border p-5 hover:border-brand/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold text-foreground">{order.reference}</p>
          <p className="text-sm text-muted mt-0.5">
            {order.createdAt.toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
        <div className="text-right">
          <p className="text-sm text-muted">
            {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
          </p>
          <p className="text-sm font-semibold text-foreground">{formatNGN(order.totalKobo)}</p>
        </div>
      </div>
    </Link>
  )
}
