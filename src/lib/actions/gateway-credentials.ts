"use server"
import "server-only"
// src/lib/actions/gateway-credentials.ts
// Phase 8 (D-05/D-06, ADMN-05/ADMN-06): the ONLY write surface for gateway credentials in
// the application. saveGatewayCredentials mirrors toggleStoreSetting's security template
// (verifyAdminSession() literal first statement, closed Zod schema, never echoes values).
// testGatewayConnection is the non-blocking "verify before enable" affordance for
// Stripe/Paystack/Flutterwave — never persists as a side effect.

import { z } from "zod"
import Stripe from "stripe"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { gatewayCredentials } from "@/lib/db/schema"
import { encryptSecret } from "@/lib/payments/crypto"
import { FIELD_MANIFEST, getGatewayConfig } from "@/lib/payments/gateway-credentials"

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

export type TestConnectionResult = { success: true } | { success: false; error: string }

const TESTABLE_PROVIDERS = new Set(["stripe", "paystack", "flutterwave"])

/**
 * Best-effort "verify before enable" affordance (D-06). Non-blocking — saving/enabling never
 * requires a passing test. Tests the just-submitted (unsaved) value if provided, else falls
 * back to the persisted/env-resolved value. Never persists as a side effect (T-08-12).
 */
export async function testGatewayConnection(
  provider: string,
  fields: Record<string, string>,
): Promise<TestConnectionResult> {
  await verifyAdminSession() // D-05-style gate — first statement

  if (!TESTABLE_PROVIDERS.has(provider)) {
    return { success: false, error: "This gateway can't be tested directly" }
  }

  // Test the just-typed (unsaved) value if provided; else fall back to the persisted value
  // resolved via the DB-first/env-fallback resolver (RESEARCH Open Question #1).
  const candidateSecretKey =
    fields.secret_key || (await getGatewayConfig(provider)).secret_key

  if (!candidateSecretKey) {
    return { success: false, error: "No credential to test — enter a secret key first" }
  }

  try {
    if (provider === "stripe") {
      // Throwaway client from the CANDIDATE key — never the existing lazy singleton,
      // which is fixed to the resolver-sourced key on its own first call.
      const testClient = new Stripe(candidateSecretKey, { typescript: true })
      await testClient.balance.retrieve()
    } else if (provider === "paystack") {
      const res = await fetch("https://api.paystack.co/balance", {
        headers: { Authorization: `Bearer ${candidateSecretKey}` },
      })
      if (!res.ok) throw new Error(`Paystack returned ${res.status}`)
    } else if (provider === "flutterwave") {
      const res = await fetch("https://api.flutterwave.com/v3/balances", {
        headers: { Authorization: `Bearer ${candidateSecretKey}` },
      })
      if (!res.ok) throw new Error(`Flutterwave returned ${res.status}`)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Connection test failed" }
  }
}
