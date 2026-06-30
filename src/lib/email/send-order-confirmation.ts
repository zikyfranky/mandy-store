import "server-only"
// src/lib/email/send-order-confirmation.ts
// Resend-backed order confirmation email sender.
// ORD-01: sent when payment is confirmed (Stripe webhook calls with .catch(console.error) — non-blocking).
// T-04-07: server-only; no bank details here.

import { Resend } from "resend"
import { OrderConfirmationEmail } from "@/emails/OrderConfirmationEmail"

const resend = new Resend(process.env.RESEND_API_KEY!)

export interface OrderConfirmationInput {
  customerEmail: string
  reference: string
  guestToken: string
  items: Array<{
    productName: string
    variantLabel: string
    quantity: number
    lineTotalKobo: number
  }>
  subtotalKobo: number
  shippingKobo: number
  totalKobo: number
}

/**
 * Sends an order confirmation email to the customer.
 * In the webhook handler this should be called non-blocking (.catch(console.error))
 * so that email failures do not fail the webhook acknowledgement.
 *
 * @throws Error if Resend API returns an error (caller decides whether to swallow)
 */
export async function sendOrderConfirmationEmail(order: OrderConfirmationInput): Promise<void> {
  const { error } = await resend.emails.send({
    from: "Mandy Store <onboarding@resend.dev>",
    to: order.customerEmail,
    subject: `Order confirmed — ${order.reference}`,
    react: OrderConfirmationEmail({
      orderRef: order.reference,
      orderToken: order.guestToken,
      customerEmail: order.customerEmail,
      items: order.items,
      subtotalKobo: order.subtotalKobo,
      shippingKobo: order.shippingKobo,
      totalKobo: order.totalKobo,
    }),
  })

  if (error) {
    throw new Error(`Failed to send order confirmation email: ${error.message}`)
  }
}
