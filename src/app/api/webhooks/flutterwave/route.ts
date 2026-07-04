// src/app/api/webhooks/flutterwave/route.ts
// Flutterwave webhook Route Handler — stub for Wave 1 foundation.
// Full implementation lands in Plan 03 (Wave 2).
//
// Wave 1 deliverable: signature verification (always-runs test).
// PAY-06: charge.completed/status:successful → confirmOrderPaid (Plan 03).
//
// Security: raw body FIRST, then HMAC SHA-256 base64 verify.
// Pitfall 5: check both "flutterwave-signature" (newer) and "verif-hash" (legacy) headers.

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { isPaymentMethodEnabled } from "@/lib/payments/config"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // CRITICAL: raw body FIRST — required for HMAC verification
  const body = await req.text()

  // Pitfall 5: check both headers (newer API uses "flutterwave-signature"; legacy uses "verif-hash")
  const signature =
    req.headers.get("flutterwave-signature") ??
    req.headers.get("verif-hash") ??
    ""

  // Toggle check — enforce at route level (D-06, PAY-12)
  if (!isPaymentMethodEnabled("flutterwave")) {
    return NextResponse.json({ error: "Flutterwave is not enabled" }, { status: 503 })
  }

  // HMAC SHA-256 base64 signature verification (RESEARCH Pattern 5)
  // Flutterwave signs with the FLUTTERWAVE_WEBHOOK_HASH (set by merchant in dashboard)
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH!
  const expectedSig = crypto
    .createHmac("sha256", secretHash)
    .update(body)
    .digest("base64")

  if (expectedSig !== signature) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }

  const event = JSON.parse(body) as {
    type: string
    id?: string
    data?: {
      id?: number
      status?: string
      tx_ref?: string
      amount?: number
      currency?: string
    }
  }

  // Only handle charge.completed with status "successful" — 200 for all other events/statuses
  // Pitfall 7: Flutterwave uses "successful" NOT "success"
  if (event.type !== "charge.completed" || event.data?.status !== "successful") {
    return NextResponse.json({ received: true })
  }

  // TODO (Plan 03): Implement full charge.completed handling:
  //   1. Extract txRef: event.data.tx_ref
  //   2. Idempotency key: "flutterwave:" + txRef
  //   3. Look up order by gatewayReference = txRef
  //   4. Verify amount: event.data.amount × 100 must equal order.totalKobo (Pitfall 1)
  //   5. Call confirmOrderPaid(order, { provider: "flutterwave", eventId })
  //   6. On oversold: call Flutterwave refund API
  //   7. Return 200

  return NextResponse.json({ received: true })
}
