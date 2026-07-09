// src/app/account/orders/page.tsx
// Protected Server Component.
// SECURITY: verifySession() is called FIRST — in-page re-verify (SC4, CLAUDE.md dual-layer).
// proxy.ts alone is NOT sufficient; Server Actions/Server Components must re-verify independently.
// cacheComponents: session verification (dynamic data) is inside Suspense.

import { Suspense } from "react"
import Link from "next/link"
import { verifySession } from "@/lib/dal"
import { listOrdersForUser } from "@/lib/orders/queries"
import { OrderHistoryCard } from "@/components/order/OrderHistoryCard"

// ─── Empty state (D-02) — mirrors CartEmptyState's tone/structure ───────────────

function EmptyOrdersState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-surface border border-border">
      {/* Heroicons InboxIcon, 48px */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-12 h-12 text-zinc-300 dark:text-zinc-600"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.223 2.25c-.497 0-.974.198-1.325.55l-1.523 1.523c-.351.351-.549.827-.549 1.324V19.5A2.25 2.25 0 0 0 4.077 21.75h15.846a2.25 2.25 0 0 0 2.25-2.25V5.647c0-.497-.198-.973-.549-1.324l-1.523-1.523a1.875 1.875 0 0 0-1.325-.55H5.223Zm14.03 4.5H4.746l.849-.849A.375.375 0 0 1 5.86 5.75h12.28a.375.375 0 0 1 .265.14l.848.86ZM3.75 8.25v10.5c0 .414.336.75.75.75h15c.414 0 .75-.336.75-.75V8.25H16.5v.75a3 3 0 1 1-6 0v-.75H3.75Z"
          clipRule="evenodd"
        />
      </svg>
      <h2 className="text-2xl font-semibold text-foreground mt-4">No orders yet</h2>
      <p className="text-sm text-muted mt-2 max-w-sm">
        When you place an order, it will show up here.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Browse products
      </Link>
    </div>
  )
}

async function OrdersContent() {
  // In-page re-verify — DAL layer 2 of dual-layer protection (CLAUDE.md, RESEARCH Pitfall 3)
  const session = await verifySession()
  const orders = await listOrdersForUser(session.id)

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Order history</h1>

      {orders.length === 0 ? (
        <EmptyOrdersState />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderHistoryCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </main>
  )
}

function OrdersSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-4" aria-hidden="true">
      <div className="h-8 w-48 rounded bg-zinc-100 dark:bg-zinc-800/50 animate-pulse mb-2" />
      <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
      <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
      <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <OrdersContent />
    </Suspense>
  )
}
