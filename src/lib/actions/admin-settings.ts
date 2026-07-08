"use server"
import "server-only"
// src/lib/actions/admin-settings.ts
// Admin store-settings Server Actions (ADMN-04 write half, D-11).
//
// Security contracts:
//   - verifyAdminSession() is the literal FIRST statement, before Zod parsing or DB access
//     (D-02, T-05-14).
//   - method is restricted to a closed Zod enum (stripe/paypal/bank_transfer — SC5 scope;
//     NG gateways stay server-env toggled per D-11 scope note, T-05-18).
//   - Secrets never move into DB/UI — this only flips store_settings.enabled; credentials
//     stay in server-only env (checked separately by isPaymentMethodEnabled).

import { z } from "zod"
import { eq } from "drizzle-orm"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { storeSettings } from "@/lib/db/schema"

const ToggleSchema = z.object({
  method: z.enum(["stripe", "paypal", "bank_transfer"]),
  enabled: z.boolean(),
})

export type ToggleStoreSettingResult = { success: true } | { success: false; error: string }

export async function toggleStoreSetting(method: string, enabled: boolean): Promise<ToggleStoreSettingResult> {
  await verifyAdminSession() // D-02 — first statement

  const parsed = ToggleSchema.safeParse({ method, enabled })
  if (!parsed.success) {
    return { success: false, error: "Invalid input" }
  }

  await db
    .update(storeSettings)
    .set({ enabled: parsed.data.enabled, updatedAt: new Date() })
    .where(eq(storeSettings.method, parsed.data.method))

  return { success: true }
}
