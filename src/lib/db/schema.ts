// src/lib/db/schema.ts
// Source: authjs.dev/getting-started/adapters/drizzle (official schema), customized

import {
  pgTable, pgEnum, text, timestamp, integer,
  primaryKey, unique
} from "drizzle-orm/pg-core"
import type { AdapterAccount } from "@auth/core/adapters"

// ─── Enums ───────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["customer", "admin"])

// D-11 + ROADMAP Phase 1 success criterion 5
export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "awaiting_bank_transfer",
  "payment_confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "payment_failed",
])

// ─── Auth Tables (required by @auth/drizzle-adapter) ─────────────────────────

export const users = pgTable("user", {
  // Auth.js adapter required fields
  id:            text("id").primaryKey(),
  name:          text("name"),
  email:         text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image:         text("image"),

  // Project-specific additions (D-03, D-04, D-09)
  username:     text("username").unique(),            // unique username; nullable during OAuth if added later
  passwordHash: text("password_hash"),               // null for future OAuth-only users
  role:         roleEnum("role").default("customer").notNull(),
})

export const accounts = pgTable(
  "account",
  {
    userId:            text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type:              text("type").$type<AdapterAccount["type"]>().notNull(),
    provider:          text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token:     text("refresh_token"),
    access_token:      text("access_token"),
    expires_at:        integer("expires_at"),
    token_type:        text("token_type"),
    scope:             text("scope"),
    id_token:          text("id_token"),
    session_state:     text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId:       text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires:      timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),  // email address
    token:      text("token").notNull(),
    expires:    timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

// ─── Phase 1 Infrastructure Tables (forward-compatibility shells) ─────────────

// Webhook idempotency — Phase 1 creates, Phase 4 enforces (CLAUDE.md)
// STATE.md: "processed_webhook_events idempotency table — Phase 1 schema, enforced in Phase 4"
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id:          text("id").primaryKey(),         // event ID from provider (e.g. Stripe evt_xxx)
  provider:    text("provider").notNull(),      // "stripe" | "paypal"
  processedAt: timestamp("processed_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => ({
  // Unique constraint on event ID — the idempotency guarantee
  eventIdUnique: unique("processed_webhook_events_id_unique").on(table.id),
}))
