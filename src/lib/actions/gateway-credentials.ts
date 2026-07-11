"use server"
import "server-only"
// src/lib/actions/gateway-credentials.ts
// Phase 8 (D-05/D-06, ADMN-05/ADMN-06): the ONLY write surface for gateway credentials in
// the application. saveGatewayCredentials mirrors toggleStoreSetting's security template
// (verifyAdminSession() literal first statement, closed Zod schema, never echoes values).
// testGatewayConnection is the non-blocking "verify before enable" affordance for
// Stripe/Paystack/Flutterwave — never persists as a side effect.

import { z } from "zod"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { gatewayCredentials } from "@/lib/db/schema"
import { encryptSecret } from "@/lib/payments/crypto"
import { FIELD_MANIFEST } from "@/lib/payments/gateway-credentials"

// One closed schema PER provider — allowlisted field names only (D-05), derived from
// FIELD_MANIFEST so the allowlist can never drift from the resolver's own field list.
function schemaForProvider(provider: string) {
  const fields = FIELD_MANIFEST[provider] ?? []
  const shape = Object.fromEntries(fields.map((f) => [f.field, z.string().optional()]))
  return z.object(shape).strict()
}

export type SaveGatewayCredentialsResult = { success: true } | { success: false; error: string }

export async function saveGatewayCredentials(
  provider: string,
  fields: Record<string, string>,
): Promise<SaveGatewayCredentialsResult> {
  const admin = await verifyAdminSession() // D-05 — literal first statement

  if (!(provider in FIELD_MANIFEST)) {
    return { success: false, error: "Unknown provider" }
  }
  const parsed = schemaForProvider(provider).safeParse(fields)
  if (!parsed.success) {
    return { success: false, error: "Invalid input" }
  }

  const manifest = FIELD_MANIFEST[provider]
  for (const spec of manifest) {
    const submitted = parsed.data[spec.field]
    // Empty submit = leave unchanged (D-04) — skip entirely, never overwrite with "".
    if (submitted === undefined || submitted === "") continue

    const value = spec.isSecret ? encryptSecret(submitted) : submitted
    await db
      .insert(gatewayCredentials)
      .values({ provider, field: spec.field, value, isSecret: spec.isSecret, updatedBy: admin.email })
      .onConflictDoUpdate({
        target: [gatewayCredentials.provider, gatewayCredentials.field],
        set: { value, updatedAt: new Date(), updatedBy: admin.email },
      })
  }

  return { success: true } // never echoes any field value, secret or public
}
