// src/components/order/PostPurchaseAccountOffer.tsx
// Post-purchase account creation offer — shown on confirmation page for guest orders (D-03, §7f).
// Server Component. Only rendered by the page when order.userId === null (guest).
// The /account/register page in Phase 6 reads the orderToken query param to link the order.

import Link from "next/link"

interface PostPurchaseAccountOfferProps {
  token: string
}

export function PostPurchaseAccountOffer({ token }: PostPurchaseAccountOfferProps) {
  return (
    <div className="rounded-xl border border-border p-5 mt-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        Track this order with an account
      </h2>
      <p className="text-sm text-muted">
        Create a free account to view your order history and track future orders —
        your current order will be linked automatically.
      </p>
      <Link
        href={"/account/register?orderToken=" + token}
        className="inline-flex items-center rounded-xl bg-brand hover:bg-brand-strong text-white px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Create account
      </Link>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/account/login"
          className="text-brand hover:text-brand-strong font-semibold"
        >
          Sign in
        </Link>{" "}
        to link this order.
      </p>
    </div>
  )
}
