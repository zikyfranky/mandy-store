import "server-only"
// src/lib/email/send-verification.ts
// Resend-backed email verification sender.
// Source: RESEARCH.md Pattern 6, §Open Question 1 (from address)
// Threat model: T-01-08 (server-only guard prevents client bundle exposure)

import { getResendClient } from "./resend-client"
import { VerificationEmail } from "@/emails/VerificationEmail"

/**
 * Sends a verification email to the given address with a clickable verify link.
 *
 * @param email - The recipient email address
 * @param token - The verification token (crypto.randomUUID())
 * @throws Error if Resend API returns an error
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const resend = getResendClient()
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured — cannot send verification email")
  }

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}&email=${encodeURIComponent(email)}`

  const { error } = await resend.emails.send({
    // TODO: replace with verified domain before production (RESEARCH Open Question 1)
    from: "YesBuy <onboarding@resend.dev>",
    to: email,
    subject: "Verify your email address",
    react: VerificationEmail({ verifyUrl }),
  })

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`)
  }
}
