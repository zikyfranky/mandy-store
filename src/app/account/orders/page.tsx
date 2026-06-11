// src/app/account/orders/page.tsx
// Protected Server Component stub.
// SECURITY: verifySession() is called FIRST — in-page re-verify (SC4, CLAUDE.md dual-layer).
// proxy.ts alone is NOT sufficient; Server Actions/Server Components must re-verify independently.

import { verifySession } from "@/lib/dal"

export default async function OrdersPage() {
  // In-page re-verify — DAL layer 2 of dual-layer protection (CLAUDE.md, RESEARCH Pitfall 3)
  await verifySession()

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Order history
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        Order history is coming in Phase 6 (Accounts & Orders).
      </p>
    </main>
  )
}
