// src/app/account/page.tsx
// Minimal /account landing (D-07) — signed-in email, sign-out, link to order history.
// SECURITY: verifySession() is called FIRST — in-page re-verify (layer 2, CLAUDE.md dual-auth).
// proxy.ts's exact `path === "/account"` match is layer-1 defense-in-depth only.
// cacheComponents: session verification (dynamic data) is inside Suspense.

import { Suspense } from "react"
import Link from "next/link"
import { verifySession } from "@/lib/dal"
import { logout } from "@/lib/actions/auth"

async function AccountContent() {
  // In-page re-verify — DAL layer 2 of dual-layer protection (CLAUDE.md, RESEARCH Pitfall 3)
  const session = await verifySession()

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="rounded-2xl bg-surface border border-border p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Your account</h1>
        <p className="text-sm text-muted">Signed in as {session.email}</p>

        <Link
          href="/account/orders"
          className="inline-flex items-center rounded-xl bg-brand hover:bg-brand-strong text-white px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          View order history
        </Link>

        <hr className="border-t border-border" />

        {/* Sign out — neutral, non-destructive action; no confirmation needed */}
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-brand-soft/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={<div className="max-w-2xl mx-auto px-4 py-12 animate-pulse" aria-hidden="true" />}
    >
      <AccountContent />
    </Suspense>
  )
}
