// src/lib/db/schema.ts
// Source: authjs.dev/getting-started/adapters/drizzle (official schema), customized

import {
  pgTable, pgEnum, text, timestamp, integer,
  primaryKey, unique, boolean, index
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
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

// Phase 5 (D-11 / ADMN-04): store_settings — one row per DB-backed payment method.
// A method is enabled only when BOTH this flag is true AND env credentials are present
// (see src/lib/payments/config.ts). Mirrors processedWebhookEvents: small text-PK lookup
// table, no relations.
export const storeSettings = pgTable("store_settings", {
  method:    text("method").primaryKey(),
  enabled:   boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
})

// Phase 8 (D-01 / ADMN-05/06/07): gateway_credentials — field-level key/value rows per
// provider. `value` holds the AES-256-GCM envelope for is_secret fields, plaintext for
// public fields/URLs. Compound PK (provider, field). Ships empty — resolver falls back
// to process.env until an admin saves a field (regression-safe, D-09).
export const gatewayCredentials = pgTable(
  "gateway_credentials",
  {
    provider:  text("provider").notNull(),
    field:     text("field").notNull(),
    value:     text("value").notNull(),
    isSecret:  boolean("is_secret").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    updatedBy: text("updated_by"),
  },
  (table) => ({
    compoundKey: primaryKey({ columns: [table.provider, table.field] }),
  }),
)

// ─── Phase 2: Product Catalog Tables ─────────────────────────────────────────
// Implements the flexible per-product variant model (D-01 through D-05, D-08)
// All IDs: text UUID (crypto.randomUUID()); timestamps: { mode: "date" }

// D-02: brand as its own table
export const brands = pgTable("brand", {
  id:        text("id").primaryKey(),              // crypto.randomUUID()
  name:      text("name").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})

// D-03: seeded table (Electronics, Watches, Phones) — NOT a pgEnum
export const categories = pgTable("category", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull().unique(),
  slug:      text("slug").notNull().unique(),       // "electronics", "watches", "phones"
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
})

export const products = pgTable("product", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),     // D-08: canonical URL key
  description: text("description"),
  categoryId:  text("category_id").notNull().references(() => categories.id),
  brandId:     text("brand_id").notNull().references(() => brands.id),
  isActive:    boolean("is_active").default(true).notNull(),
  createdAt:   timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt:   timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("product_category_idx").on(table.categoryId),
  index("product_brand_idx").on(table.brandId),
  index("product_slug_idx").on(table.slug),
])

// Phase 5 will add Vercel Blob upload; now just URL strings
export const productImages = pgTable("product_image", {
  id:         text("id").primaryKey(),
  productId:  text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url:        text("url").notNull(),               // external URL for seed; Vercel Blob in Phase 5
  altText:    text("alt_text"),
  position:   integer("position").default(0).notNull(), // display order
  isPrimary:  boolean("is_primary").default(false).notNull(),
})

// D-01: each product defines its own option types ("Color", "Storage", "Strap")
export const productOptions = pgTable("product_option", {
  id:        text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),               // e.g. "Color", "Storage"
  position:  integer("position").default(0).notNull(),
}, (table) => [
  unique("product_option_name_unique").on(table.productId, table.name),
])

// e.g. option "Color" has values "Black", "Silver", "Gold"
export const optionValues = pgTable("option_value", {
  id:              text("id").primaryKey(),
  productOptionId: text("product_option_id").notNull().references(() => productOptions.id, { onDelete: "cascade" }),
  value:           text("value").notNull(),          // "Black", "256GB", "Small"
  position:        integer("position").default(0).notNull(),
}, (table) => [
  unique("option_value_unique").on(table.productOptionId, table.value),
])

// D-01/D-04: each variant has its own SKU, price (kobo), stock
// The stock field here is what Phase 4 will atomically decrement
export const variants = pgTable("variant", {
  id:          text("id").primaryKey(),
  productId:   text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sku:         text("sku").unique(),
  priceKobo:   integer("price_kobo").notNull(),     // D-04: NGN minor units
  stock:       integer("stock").default(0).notNull(), // Phase 4: UPDATE ... WHERE stock > 0 RETURNING
  imageUrl:    text("image_url"),                    // optional variant-specific image (D-19)
  isActive:    boolean("is_active").default(true).notNull(),
  createdAt:   timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("variant_product_idx").on(table.productId),
])

// Links each variant to its option value for each option type
// A variant must have exactly one value per option of its product
export const variantOptionValues = pgTable(
  "variant_option_value",
  {
    variantId:     text("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
    optionValueId: text("option_value_id").notNull().references(() => optionValues.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.variantId, table.optionValueId] }),
  ]
)

// ─── Phase 3: Cart Tables ─────────────────────────────────────────────────────
// D-08/D-09: cart and cart_item store only variantId+quantity — NO price columns.
// Prices always joined from variants.priceKobo at query time (CLAUDE.md: never trust client prices).

// DB cart for logged-in users (guests use a cookie — see src/lib/cart/logic.ts)
export const cart = pgTable("cart", {
  id:        text("id").primaryKey(),             // crypto.randomUUID()
  userId:    text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("cart_user_idx").on(table.userId),
  unique("cart_user_unique").on(table.userId),    // one cart per user; upsert on first add
])

// One row per variant per cart — quantity updated on re-add (ON CONFLICT DO UPDATE)
// NO priceKobo column — prices always read from variants.priceKobo (D-09, CLAUDE.md)
export const cartItems = pgTable("cart_item", {
  id:        text("id").primaryKey(),
  cartId:    text("cart_id").notNull().references(() => cart.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
  quantity:  integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("cart_item_variant_unique").on(table.cartId, table.variantId),  // no duplicate variant rows
  index("cart_item_cart_idx").on(table.cartId),
])

// ─── Phase 2: Relations ───────────────────────────────────────────────────────

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}))

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  brand:    one(brands,     { fields: [products.brandId],    references: [brands.id] }),
  options:  many(productOptions),
  variants: many(variants),
  images:   many(productImages),
}))

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}))

export const productOptionsRelations = relations(productOptions, ({ one, many }) => ({
  product: one(products, { fields: [productOptions.productId], references: [products.id] }),
  values:  many(optionValues),
}))

export const optionValuesRelations = relations(optionValues, ({ one, many }) => ({
  option:              one(productOptions, { fields: [optionValues.productOptionId], references: [productOptions.id] }),
  variantOptionValues: many(variantOptionValues),
}))

export const variantsRelations = relations(variants, ({ one, many }) => ({
  product:      one(products, { fields: [variants.productId], references: [products.id] }),
  optionValues: many(variantOptionValues),
}))

export const variantOptionValuesRelations = relations(variantOptionValues, ({ one }) => ({
  variant:     one(variants,     { fields: [variantOptionValues.variantId],     references: [variants.id] }),
  optionValue: one(optionValues, { fields: [variantOptionValues.optionValueId], references: [optionValues.id] }),
}))

// ─── Phase 3: Cart Relations ──────────────────────────────────────────────────

export const cartRelations = relations(cart, ({ one, many }) => ({
  user:  one(users,     { fields: [cart.userId],   references: [users.id] }),
  items: many(cartItems),
}))

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart:    one(cart,     { fields: [cartItems.cartId],    references: [cart.id] }),
  variant: one(variants, { fields: [cartItems.variantId], references: [variants.id] }),
}))

// ─── Phase 4: Order Tables ───────────────────────────────────────────────────
// orders: one row per checkout attempt. Address is a denormalized snapshot (immutable
// order record). Price snapshot lives on order_item (Phase 6 SC2 — total as captured).
export const orders = pgTable("order", {
  id:            text("id").primaryKey(),                         // crypto.randomUUID()
  reference:     text("reference").notNull().unique(),            // MS-XXXXXX (shown to customer)
  guestToken:    text("guest_token").notNull().unique(),         // 64-char hex (guest access URL, IDOR-safe)
  status:        orderStatusEnum("status").notNull().default("pending_payment"),
  userId:        text("user_id").references(() => users.id),      // NULL for guests (CHKT-01)
  customerEmail: text("customer_email").notNull(),
  subtotalKobo:  integer("subtotal_kobo").notNull(),
  shippingKobo:  integer("shipping_kobo").notNull(),
  totalKobo:     integer("total_kobo").notNull(),                 // server-computed; never client (CHKT-03/04)
  shippingName:     text("shipping_name").notNull(),
  shippingPhone:    text("shipping_phone").notNull(),
  shippingStreet:   text("shipping_street").notNull(),
  shippingCity:     text("shipping_city").notNull(),
  shippingState:    text("shipping_state").notNull(),             // one of 36 states + FCT (D-04)
  shippingLandmark: text("shipping_landmark"),                    // optional
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paypalOrderId:         text("paypal_order_id"),                 // reserved (PAY-02 deferred)
  // Phase 7: generalized gateway correlation (Paystack/Flutterwave + future gateways)
  gatewayProvider:   text("gateway_provider"),                    // "paystack" | "flutterwave" | null (Stripe uses stripePaymentIntentId)
  gatewayReference:  text("gateway_reference"),                   // Paystack reference or Flutterwave tx_ref
  refundReason:  text("refund_reason"),                           // set on last-unit-race refund (D-09)
  createdAt:     timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  paidAt:        timestamp("paid_at", { mode: "date" }),          // set when payment_confirmed
}, (table) => [
  index("order_user_idx").on(table.userId),
  index("order_guest_token_idx").on(table.guestToken),
  index("order_stripe_pi_idx").on(table.stripePaymentIntentId),
  index("order_gateway_ref_idx").on(table.gatewayReference),
])

// order_item: one row per line, with price + label snapshot at purchase time
export const orderItems = pgTable("order_item", {
  id:            text("id").primaryKey(),
  orderId:       text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  variantId:     text("variant_id").notNull().references(() => variants.id),
  quantity:      integer("quantity").notNull(),
  priceKobo:     integer("price_kobo").notNull(),                 // snapshot of variants.priceKobo
  productName:   text("product_name").notNull(),                 // snapshot
  variantLabel:  text("variant_label").notNull(),                // snapshot e.g. "Black / 128GB"
  lineTotalKobo: integer("line_total_kobo").notNull(),           // priceKobo * quantity
}, (table) => [
  index("order_item_order_idx").on(table.orderId),
])

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user:  one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order:   one(orders,   { fields: [orderItems.orderId],   references: [orders.id] }),
  variant: one(variants, { fields: [orderItems.variantId], references: [variants.id] }),
}))
