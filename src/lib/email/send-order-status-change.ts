import "server-only"
// src/lib/email/send-order-status-change.ts
// Resend-backed status-change email sender.
// ORD-03: fired only when an order transitions to shipped or delivered (D-10), non-blocking
// (.catch(console.error) at the call site in src/lib/actions/admin-orders.ts).

import { getResendClient } from "./resend-client"
import { OrderStatusChangeEmail, type NotifiableStatus } from "@/emails/OrderStatusChangeEmail"

export interface OrderStatusChangeInput {
  customerEmail: string
  reference: string
  guestToken: string
  newStatus: NotifiableStatus
}

const SUBJECTS: Record<NotifiableStatus, (ref: string) => string> = {
  processing: (ref) => `Your order ${ref} is being processed`,
  shipped: (ref) => `Your order ${ref} has shipped`,
  delivered: (ref) => `Your order ${ref} was delivered`,
  cancelled: (ref) => `Your order ${ref} was cancelled`,
}

/**
 * Sends a fulfillment status-change email to the customer.
 * Caller (updateOrderStatus) should call this non-blocking (.catch(console.error))
 * so that email failures do not fail the status transition.
 *
 * @throws Error if Resend API returns an error (caller decides whether to swallow)
 */
export async function sendOrderStatusChangeEmail(input: OrderStatusChangeInput): Promise<void> {
  const resend = getResendClient()
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured — cannot send status-change email")
  }

  const { error } = await resend.emails.send({
    from: "Yesbuy Store <onboarding@resend.dev>",
    to: input.customerEmail,
    subject: SUBJECTS[input.newStatus](input.reference),
    react: OrderStatusChangeEmail({
      reference: input.reference,
      guestToken: input.guestToken,
      newStatus: input.newStatus,
    }),
  })

  if (error) {
    throw new Error(`Failed to send status-change email: ${error.message}`)
  }
}
