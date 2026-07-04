// src/app/api/webhooks/paystack/route.ts
// Paystack webhook Route Handler — stub for Wave 1 foundation.
// Full implementation lands in Plan 02 (Wave 2).
//
// Wave 1 deliverable: signature verification (always-runs test).
// PAY-05: charge.success → confirmOrderPaid (Plan 02).
//
// Security: raw body FIRST (same contract as Stripe webhook), then HMAC SHA-512 verify.
// Only charge.success events trigger order processing; all others return 200.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { isPaymentMethodEnabled } from "@/lib/payments/config"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // CRITICAL: raw body FIRST — HMAC verify requires the original bytes (Pitfall 4)
  const body = await req.text()
  const signature = req.headers.get("x-paystack-signature") ?? ""

  // Toggle check — enforce at route level (D-06, PAY-12)
  if (!isPaymentMethodEnabled("paystack")) {
    return NextResponse.json({ error: "Paystack is not enabled" }, { status: 503 })
  }

  // HMAC SHA-512 signature verification (RESEARCH Pattern 4)
  // Paystack signs with the server-only PAYSTACK_SECRET_KEY
  const expectedSig = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(body)  // raw string — do NOT re-stringify parsed JSON (Pitfall 4)
    .digest("hex")

  if (expectedSig !== signature) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  const event = JSON.parse(body) as {
    event: string
    data?: {
      id?: number
      status?: string
      reference?: string
      amount?: number
      currency?: string
    }
  }

  // Only handle charge.success — return 200 for all other events
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true })
  }

  // TODO (Plan 02): Implement full charge.success handling:
  //   1. Extract reference: event.data.reference
  //   2. Idempotency key: "paystack:" + reference
  //   3. Look up order by gatewayReference = reference
  //   4. Call confirmOrderPaid(order, { provider: "paystack", eventId })
  //   5. On oversold: call Paystack refund API
  //   6. Return 200

  return NextResponse.json({ received: true })
}
