// src/app/api/order/status/[token]/route.ts
// Order status polling endpoint — powers the "Payment processing…" reconciliation (CHKT-05/D-07).
//
// Security: keyed by 64-char unguessable guestToken (T-04-20).
// Returns only { status } — never order IDs, emails, or payment details.
// Unknown token → 404 (no enumeration possible).

import { NextRequest, NextResponse } from "next/server"
import { getOrderStatusByToken } from "@/lib/orders/queries"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params
  const status = await getOrderStatusByToken(token)

  if (status === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ status })
}
