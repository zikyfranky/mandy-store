import "server-only"
// src/lib/orders/reference.ts
// Order reference + guest token generation. Server-only (tokens must not run client-side).
// T-04-06: guest token uses crypto.getRandomValues — never Math.random.
// T-04-09: order reference retries on DB collision.
// D-11: MS-XXXXXX format; D-12: unguessable 64-char hex guest token.

import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // omit O/0 I/1 for readability

/**
 * Generates a single MS-XXXXXX reference (6 chars, 32^6 = 1.07B combinations).
 * Not guaranteed unique — use generateUniqueOrderRef() for DB-checked uniqueness.
 */
export function generateOrderRef(): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => CHARS[b % CHARS.length])
    .join("")
  return `MS-${suffix}`
}

/**
 * Generates an order reference guaranteed unique in the DB.
 * Retries up to 10 times before throwing (T-04-09).
 *
 * @throws Error after 10 failed attempts (astronomically unlikely at small order volumes)
 */
export async function generateUniqueOrderRef(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const ref = generateOrderRef()
    const existing = await db.query.orders.findFirst({
      where: eq(orders.reference, ref),
      columns: { id: true },
    })
    if (!existing) return ref
  }
  throw new Error("Failed to generate unique order reference after 10 attempts")
}

/**
 * Generates a 64-char hex guest token (256 bits entropy) for IDOR-safe order access.
 * Uses crypto.getRandomValues — never Math.random (T-04-06, D-12).
 */
export function generateGuestToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")
}
