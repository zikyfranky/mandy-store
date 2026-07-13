// src/app/checkout/page.tsx
// /checkout single-page route — Server Component (async).
// UI-SPEC §1 / D-01 / CHKT-01 / CHKT-02 / CHKT-04 / PAY-04
// Dynamic — reads cart + session per request; no caching.
// Redirects empty carts to /cart (server-side, no flash).

import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getCart } from "@/lib/cart/queries"
import { auth } from "@/lib/auth"
import { enabledPaymentMethods } from "@/lib/payments/config"
import { FLAT_SHIPPING_KOBO } from "@/lib/orders/shipping"
import { CheckoutForm } from "@/components/checkout/CheckoutForm"
import { CheckoutOrderSummary } from "@/components/checkout/CheckoutOrderSummary"
import { OOSWarningBanner } from "@/components/checkout/OOSWarningBanner"

export const metadata: Metadata = {
  title: "Checkout — Yesbuy Store",
  description: "Review your order and complete your purchase.",
}

// ─── CheckoutSkeleton (Suspense fallback) ─────────────────────────────────────

function CheckoutSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1">
      <div className="h-8 w-36 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse mb-8" />
      <div className="lg:grid lg:grid-cols-5 lg:gap-8 space-y-8 lg:space-y-0">
        <div className="col-span-3 space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-zinc-200 dark:bg-zinc-700 animate-pulse"
            />
          ))}
        </div>
        <div className="col-span-2">
          <div className="h-80 rounded-2xl bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// ─── CheckoutContent (async) ──────────────────────────────────────────────────

async function CheckoutContent() {
  const cart = await getCart()

  // Guard: empty cart → redirect to /cart
  if (cart.items.length === 0) {
    redirect("/cart")
  }

  const session = await auth()
  const methods = await enabledPaymentMethods() // server-only — safe in a Server Component
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""

  const prefilledEmail = session?.user?.email ?? null
  const isLoggedIn = !!session?.user?.email

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1">
      <h1 className="text-2xl font-semibold text-foreground mb-8">Checkout</h1>

      {/* OOS warning banner (§1 / §8) — shown above form when cart has OOS items */}
      {cart.hasOOS && <OOSWarningBanner />}

      {/* §1 Two-column grid: left = form (col-span-3), right = sticky summary (col-span-2) */}
      <div className="lg:grid lg:grid-cols-5 lg:gap-8 space-y-8 lg:space-y-0">
        {/* Left: contact + address + payment (3/5) */}
        <div className="col-span-3">
          <CheckoutForm
            prefilledEmail={prefilledEmail}
            isLoggedIn={isLoggedIn}
            enabledMethods={methods}
            publishableKey={publishableKey}
            hasOOS={cart.hasOOS}
          />
        </div>

        {/* Right: sticky order summary (2/5) */}
        <div className="col-span-2">
          <CheckoutOrderSummary cart={cart} shippingKobo={FLAT_SHIPPING_KOBO} />
        </div>
      </div>
    </main>
  )
}

// ─── CheckoutPage ─────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutContent />
    </Suspense>
  )
}
