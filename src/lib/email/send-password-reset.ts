import "server-only"
// src/lib/email/send-password-reset.ts
// Resend-backed admin-triggered password-reset sender (Phase 9, ADMN-09, D-03).
// Mirrors send-verification.ts. Threat model: T-09-06 (server-only — no client bundle exposure).

import { getResendClient } from "./resend-client"
import { PasswordResetEmail } from "@/emails/PasswordResetEmail"

/**
 * Sends a password-reset email with a one-time, 1h-expiring reset link.
 *
 * @param email - The recipient email address
 * @param token - The reset token (pwreset_<uuid>)
 * @throws Error if RESEND_API_KEY is unset or Resend returns an error. The caller
 *   (sendCustomerPasswordReset) wraps this in try/catch so the reset token is still
 *   issued in dev where no key is configured (best-effort, mirrors register()).
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resend = getResendClient()
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured — cannot send password reset email")
  }

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`

  const { error } = await resend.emails.send({
    // TODO: replace with verified domain before production
    from: "YesBuy <onboarding@resend.dev>",
    to: email,
    subject: "Reset your password",
    react: PasswordResetEmail({ resetUrl }),
  })

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`)
  }
}
