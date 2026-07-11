import "server-only"
// src/lib/payments/stripe.ts
// Stripe client singleton — server-only. Phase 8 (D-03a): key sourced from the DB-first/
// env-fallback resolver, not process.env directly. getStripe() is now ASYNC — every call
// site must `await getStripe()`. The old synchronous `stripe` Proxy export is REMOVED
// (a Proxy cannot transparently unwrap an async getter) — callers hold their own
// `const stripeClient = await getStripe()` reference for the duration of one request.

import Stripe from "stripe"
import { getGatewayConfig } from "./gateway-credentials"

// Lazy singleton — instantiated on first call, not at module load (prevents build-time throw).
// Note: still caches after first successful resolution — if credentials change later via the
// admin UI, a running server process keeps using the FIRST-resolved key until restarted. This
// matches the existing single-active-keyset scope (D-04) and is not a regression this plan
// needs to solve.
let _stripe: Stripe | undefined

export async function getStripe(): Promise<Stripe> {
  if (!_stripe) {
    const cfg = await getGatewayConfig("stripe")
    const key = cfg.secret_key
    if (!key) throw new Error("Stripe secret_key is not configured (DB or env)")
    _stripe = new Stripe(key, { typescript: true })
  }
  return _stripe
}
