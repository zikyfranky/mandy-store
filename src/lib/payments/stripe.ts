import "server-only"
// src/lib/payments/stripe.ts
// Stripe client singleton — server-only (never client-bundled).
// STRIPE_SECRET_KEY is non-NEXT_PUBLIC_ (T-04-08). Only the publishable key is NEXT_PUBLIC_.

import Stripe from "stripe"

// Singleton — one instance per cold start. Server-only (never client-bundled).
// apiVersion omitted: uses the SDK's own pinned version (avoids type mismatch with stripe@22.x).
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { typescript: true })
