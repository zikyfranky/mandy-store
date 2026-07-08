import "server-only"
// src/lib/email/resend-client.ts
// Lazy Resend client factory. Constructing `new Resend(undefined)` throws "Missing API key"
// at call time — so building the client at MODULE scope crashes any route/action that merely
// imports an email sender when RESEND_API_KEY is unset (e.g. a freshly-hosted server). Building
// it lazily here keeps imports safe; callers decide how to handle a null client.

import { Resend } from "resend"

/** Returns a Resend client, or null when RESEND_API_KEY is not configured (never throws). */
export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  return key ? new Resend(key) : null
}
