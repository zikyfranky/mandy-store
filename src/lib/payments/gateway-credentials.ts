import "server-only"
// src/lib/payments/gateway-credentials.ts
// Phase 8 (D-03 / ADMN-07): the single DB-first / env-fallback / fail-closed credential
// resolver. Every gateway module, config.ts, and webhook route calls this instead of
// reading process.env directly. Precedence: a NON-EMPTY DB value wins; otherwise fall back
// to process.env[envVar]; a field empty from BOTH sources is OMITTED (callers treat a
// missing key as "not configured" — fail-closed). decryptSecret's throw (bad/rotated key,
// tampered ciphertext) propagates OUT uncaught (D-07) — never swallowed here.
import { cache } from "react"
import { db } from "@/lib/db/client"
import { gatewayCredentials } from "@/lib/db/schema"
import { decryptSecret } from "./crypto"

export type FieldSpec = { field: string; envVar: string; isSecret: boolean }

// Single source of truth for all 8 gateways' credential fields (08-RESEARCH.md Field
// Manifest). Backbone for: this resolver, saveGatewayCredentials' Zod allowlist, and the
// Settings UI's per-gateway field list.
export const FIELD_MANIFEST: Record<string, FieldSpec[]> = {
  stripe: [
    { field: "secret_key",      envVar: "STRIPE_SECRET_KEY",                  isSecret: true },
    { field: "webhook_secret",  envVar: "STRIPE_WEBHOOK_SECRET",              isSecret: true },
    { field: "publishable_key", envVar: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", isSecret: false },
  ],
  paypal: [
    { field: "client_id",     envVar: "PAYPAL_CLIENT_ID",     isSecret: false },
    { field: "client_secret", envVar: "PAYPAL_CLIENT_SECRET", isSecret: true },
    { field: "mode",          envVar: "PAYPAL_MODE",          isSecret: false },
  ],
  bank_transfer: [
    { field: "bank_name",      envVar: "BANK_NAME",           isSecret: false },
    { field: "account_number", envVar: "BANK_ACCOUNT_NUMBER", isSecret: false },
    { field: "account_name",   envVar: "BANK_ACCOUNT_NAME",   isSecret: false },
  ],
  paystack: [
    { field: "secret_key", envVar: "PAYSTACK_SECRET_KEY",             isSecret: true },
    { field: "public_key", envVar: "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", isSecret: false },
  ],
  flutterwave: [
    { field: "secret_key",   envVar: "FLUTTERWAVE_SECRET_KEY",             isSecret: true },
    { field: "public_key",   envVar: "NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY", isSecret: false },
    { field: "webhook_hash", envVar: "FLUTTERWAVE_WEBHOOK_HASH",           isSecret: true },
  ],
  interswitch: [
    { field: "merchant_code", envVar: "INTERSWITCH_MERCHANT_CODE", isSecret: false },
    { field: "mac_key",      envVar: "INTERSWITCH_MAC_KEY",       isSecret: true },
    { field: "product_id",   envVar: "INTERSWITCH_PRODUCT_ID",    isSecret: false },
    { field: "pay_item_id",  envVar: "INTERSWITCH_PAY_ITEM_ID",   isSecret: false },
    { field: "pay_url",      envVar: "INTERSWITCH_PAY_URL",       isSecret: false },
    { field: "requery_url",  envVar: "INTERSWITCH_REQUERY_URL",   isSecret: false },
    { field: "redirect_url", envVar: "INTERSWITCH_REDIRECT_URL",  isSecret: false },
  ],
  gtpay: [
    { field: "merchant_id", envVar: "GTPAY_MERCHANT_ID", isSecret: false },
    { field: "hash_key",    envVar: "GTPAY_HASH_KEY",    isSecret: true },
    { field: "pay_url",     envVar: "GTPAY_PAY_URL",     isSecret: false },
    { field: "requery_url", envVar: "GTPAY_REQUERY_URL", isSecret: false },
    { field: "noti_url",    envVar: "GTPAY_NOTI_URL",    isSecret: false },
  ],
  remita: [
    { field: "merchant_id",     envVar: "REMITA_MERCHANT_ID",     isSecret: false },
    { field: "api_key",         envVar: "REMITA_API_KEY",         isSecret: true },
    { field: "service_type_id", envVar: "REMITA_SERVICE_TYPE_ID", isSecret: false },
    { field: "base_url",        envVar: "REMITA_BASE",            isSecret: false },
  ],
}

// Includes updatedAt/updatedBy (Phase 8 Plan 09) — the Settings UI needs these two metadata
// fields per secret for the "Last updated {relative date} by {email}" caption; the resolved
// VALUE is never exposed past this module for isSecret fields (see getGatewayConfig below).
type RawRow = { provider: string; field: string; value: string; isSecret: boolean; updatedAt: Date; updatedBy: string | null }

// Request-scoped batched read — ONE query regardless of how many fields/providers are checked
// this request (mirrors getStoreSettingsMap). React.cache is request-scoped only — no
// revalidateTag/revalidatePath needed after writes (Pitfall 6).
export const getGatewayCredentialsMap = cache(async (): Promise<Record<string, Record<string, RawRow>>> => {
  const rows = await db.select().from(gatewayCredentials)
  const map: Record<string, Record<string, RawRow>> = {}
  for (const r of rows) {
    map[r.provider] ??= {}
    map[r.provider][r.field] = r
  }
  return map
})

/**
 * Resolves ALL fields for a provider. DB value wins if present and NON-EMPTY; else falls back
 * to process.env[envVar]. A field that resolves to "" or undefined from BOTH sources is
 * OMITTED from the result — callers must treat a missing key as "not configured" (fail-closed,
 * D-03). decryptSecret's throw propagates OUT of this function uncaught (D-07).
 */
export async function getGatewayConfig(provider: string): Promise<Record<string, string>> {
  const manifest = FIELD_MANIFEST[provider] ?? []
  const map = await getGatewayCredentialsMap()
  const providerRows = map[provider] ?? {}

  const result: Record<string, string> = {}
  for (const spec of manifest) {
    const dbRow = providerRows[spec.field]
    let value: string | undefined
    if (dbRow && dbRow.value !== "") {
      value = dbRow.isSecret ? decryptSecret(dbRow.value) : dbRow.value
    } else {
      value = process.env[spec.envVar] || undefined
    }
    if (value) result[spec.field] = value
  }
  return result
}

/** Convenience single-field accessor for call sites that only need one value. */
export async function getGatewayCredential(provider: string, field: string): Promise<string | undefined> {
  const config = await getGatewayConfig(provider)
  return config[field]
}
