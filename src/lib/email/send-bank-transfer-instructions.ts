import "server-only"
// src/lib/email/send-bank-transfer-instructions.ts
// Resend-backed bank transfer instructions email sender.
// ORD-02: sent synchronously in the bank-transfer checkout action (must succeed before redirect).
// T-04-07: bank account details read from server-only env (BANK_* — no NEXT_PUBLIC_ prefix, D-10).

import { getResendClient } from "./resend-client"
import { BankTransferInstructionsEmail } from "@/emails/BankTransferInstructionsEmail"

export interface BankTransferInstructionsInput {
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
 * Sends bank transfer instructions to the customer.
 * Bank account details are read from server-only env vars at send time (T-04-07, D-10).
 * Called synchronously in the checkout action — must succeed before redirect.
 *
 * @throws Error if Resend API returns an error or bank env vars are not set
 */
export async function sendBankTransferInstructionsEmail(
  order: BankTransferInstructionsInput
): Promise<void> {
  const bankName = process.env.BANK_NAME
  const bankAccountNumber = process.env.BANK_ACCOUNT_NUMBER
  const bankAccountName = process.env.BANK_ACCOUNT_NAME

  if (!bankName || !bankAccountNumber || !bankAccountName) {
    throw new Error(
      "Bank account env vars not configured (BANK_NAME, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_NAME)"
    )
  }

  const resend = getResendClient()
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured — cannot send bank transfer instructions email")
  }

  const { error } = await resend.emails.send({
    from: "YesBuy <onboarding@resend.dev>",
    to: order.customerEmail,
    subject: `Bank transfer instructions — ${order.reference}`,
    react: BankTransferInstructionsEmail({
      orderRef: order.reference,
      orderToken: order.guestToken,
      customerEmail: order.customerEmail,
      bankName,
      bankAccountNumber,
      bankAccountName,
      items: order.items,
      subtotalKobo: order.subtotalKobo,
      shippingKobo: order.shippingKobo,
      totalKobo: order.totalKobo,
    }),
  })

  if (error) {
    throw new Error(`Failed to send bank transfer instructions email: ${error.message}`)
  }
}
