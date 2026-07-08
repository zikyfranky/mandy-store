import "server-only"
// src/lib/payments/store-settings.ts
// D-11 / ADMN-04: request-scoped batched loader for store_settings. Avoids N+1 DB reads
// from enabledPaymentMethods() (8 methods checked per request) — see 05-RESEARCH.md
// Pitfall 2. Correctness does not depend on the React.cache() dedupe actually firing;
// worst case without it is a few extra fast indexed reads, never a correctness bug.

import { cache } from "react"
import { db } from "@/lib/db/client"
import { storeSettings } from "@/lib/db/schema"

// Request-scoped batched read — avoids N+1 from enabledPaymentMethods().
export const getStoreSettingsMap = cache(async (): Promise<Record<string, boolean>> => {
  const rows = await db.select().from(storeSettings)
  return Object.fromEntries(rows.map((r) => [r.method, r.enabled]))
})
