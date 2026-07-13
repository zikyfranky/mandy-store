"use server"
import "server-only"
// src/lib/actions/admin-settings.ts
// Admin store-settings Server Actions (ADMN-04 write half, D-11).
//
// Security contracts:
//   - verifyAdminSession() is the literal FIRST statement, before Zod parsing or DB access
//     (D-02, T-05-14).
//   - method is restricted to the closed set of all 8 payment methods (owner decision
//     2026-07-13: every gateway is admin-toggleable, T-05-18).
//   - Secrets never move through here — this only flips store_settings.enabled; credentials
//     are entered via saveGatewayCredentials and checked separately by isPaymentMethodEnabled.

import { z } from "zod"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { storeSettings } from "@/lib/db/schema"
import { PAYMENT_METHODS } from "@/lib/payments/config"

const ToggleSchema = z.object({
  method: z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]),
  enabled: z.boolean(),
})

export type ToggleStoreSettingResult = { success: true } | { success: false; error: string }

export async function toggleStoreSetting(method: string, enabled: boolean): Promise<ToggleStoreSettingResult> {
  await verifyAdminSession() // D-02 — first statement

  const parsed = ToggleSchema.safeParse({ method, enabled })
  if (!parsed.success) {
    return { success: false, error: "Invalid input" }
  }

  // Upsert: the 5 NG-gateway methods have no seeded row, so a plain UPDATE would no-op.
  // store_settings.method is the primary key.
  await db
    .insert(storeSettings)
    .values({ method: parsed.data.method, enabled: parsed.data.enabled })
    .onConflictDoUpdate({
      target: storeSettings.method,
      set: { enabled: parsed.data.enabled, updatedAt: new Date() },
    })

  return { success: true }
}
