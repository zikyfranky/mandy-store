import "server-only"
// src/lib/payments/stripe.ts
// Stripe client singleton — server-only (never client-bundled).
// STRIPE_SECRET_KEY is non-NEXT_PUBLIC_ (T-04-08). Only the publishable key is NEXT_PUBLIC_.
//
// Lazy singleton: the Stripe instance is created on first use, not at module load time.
// This avoids build-time failures when STRIPE_SECRET_KEY is not set in the build environment
// (e.g. CI or local build without .env.local keys). The key is validated at call time.

import Stripe from "stripe"

// Lazy singleton — instantiated on first call, not at module load (prevents build-time throw).
let _stripe: Stripe | undefined

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured")
    _stripe = new Stripe(key, { typescript: true })
  }
  return _stripe
}

// Convenience named export for callers that previously used `stripe` directly.
// apiVersion omitted: uses the SDK's own pinned version (avoids type mismatch with stripe@22.x).
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
