// src/scripts/seed.ts
// Admin seed script — D-10b: repeatable admin provisioning per environment.
// Run: npx tsx src/scripts/seed.ts   (also: npm run seed)
// Source: RESEARCH.md §Open Question 3, CONTEXT.md D-10b, PLAN 01-03 Task 3

import { db } from "@/lib/db/client"
import { users } from "@/lib/db/schema"
import * as argon2 from "argon2"
import { eq } from "drizzle-orm"

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Read the list of admin emails from the ADMIN_EMAILS env var (server-only —
 * never NEXT_PUBLIC_), falling back to the project's default admin email.
 * T-01-13: role derived from server-only env; never from user input.
 */
function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "isaac@leisurepay.io"
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
}

/**
 * Derive a username from an email address.
 * e.g. "isaac@leisurepay.io" → "isaac"
 * Sanitizes to alphanum + underscores only; truncates at 30 chars.
 */
function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "admin"
  return local
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 30)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  const adminEmails = getAdminEmails()
  console.log(`Seeding ${adminEmails.length} admin email(s): ${adminEmails.join(", ")}`)

  for (const email of adminEmails) {
    // Check if a user with this email already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (existing) {
      // Idempotent update: ensure role=admin and emailVerified is set
      // so the seeded admin can log in without the verification email flow
      await db
        .update(users)
        .set({
          role:          "admin",
          emailVerified: existing.emailVerified ?? new Date(),
        })
        .where(eq(users.email, email))

      console.log(`  ✓ Updated existing user ${email} → role=admin, emailVerified set`)
    } else {
      // Create the admin user from scratch
      // T-01-14: argon2id hashing; plaintext never persisted (D-10b)
      const password = process.env.SEED_ADMIN_PASSWORD ?? generatePassword()
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id })

      const username = usernameFromEmail(email)

      // Handle username collision: append a numeric suffix
      const existingUsername = await db.query.users.findFirst({
        where: eq(users.username, username),
      })
      const finalUsername = existingUsername ? `${username}_admin` : username

      await db.insert(users).values({
        id:            crypto.randomUUID(),
        email,
        name:          "Admin",
        username:      finalUsername,
        passwordHash,
        role:          "admin",
        emailVerified: new Date(), // pre-verified so admin can log in immediately
      })

      if (!process.env.SEED_ADMIN_PASSWORD) {
        console.log(`  ✓ Created admin user: ${email}`)
        console.log(`    Username:  ${finalUsername}`)
        console.log(`    Password:  ${password}   ← SAVE THIS; printed only once`)
      } else {
        console.log(`  ✓ Created admin user: ${email} (username: ${finalUsername})`)
      }
    }
  }

  console.log("\nSeed complete.")
}

/**
 * Generates a strong random password (16 chars, alphanumeric + symbols).
 * Used when SEED_ADMIN_PASSWORD is not provided.
 */
function generatePassword(): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  const randomValues = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(randomValues)
    .map((b) => charset[b % charset.length])
    .join("")
}

// ─── Entry point ──────────────────────────────────────────────────────────────

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
