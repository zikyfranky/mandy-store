"use server"
import "server-only"
// src/lib/actions/checkout.ts
// Checkout Server Actions: createBankTransferOrder, createStripePaymentIntent.
// CHKT-01 / CHKT-02 / CHKT-03 / CHKT-04 / PAY-01 / PAY-03 / PAY-04 / ORD-02
//
// Security contracts:
//   - Server-side total ALWAYS recomputed from getCart() + FLAT_SHIPPING_KOBO — client amount never used (CLAUDE.md, T-04-10)
//   - userId ALWAYS from auth() session — never from client input (IDOR-safe, T-04-12)
//   - Payment method toggle enforced as FIRST statement — each action checks isPaymentMethodEnabled (PAY-04, D-13, T-04-11)
//   - Stock is NOT decremented here (D-09) — atomic decrement happens in webhook (Phase 4) or admin-confirm (Phase 5)
//   - Address validated by Zod (36 NG states + FCT enum) before any DB write (T-04-14)
//   - Bank transfer order status hardcoded as "awaiting_bank_transfer" — NOT paid (D-11, Pitfall 8, T-04-13)

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { getCart } from "@/lib/cart/queries"
import { computeOrderTotal } from "@/lib/orders/shipping"
import { generateUniqueOrderRef, generateGuestToken } from "@/lib/orders/reference"
import { isPaymentMethodEnabled } from "@/lib/payments/config"
import { stripe } from "@/lib/payments/stripe"
import { sendBankTransferInstructionsEmail } from "@/lib/email/send-bank-transfer-instructions"

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

// D-04: 36 NG states + FCT — closed enum prevents invalid state strings (T-04-14)
const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const

const AddressSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  phone:    z.string().min(7, "A valid phone number is required"),
  street:   z.string().min(1, "Street address is required"),
  city:     z.string().min(1, "City is required"),
  state:    z.enum(NG_STATES, { message: "Select a valid state" }),
  landmark: z.string().optional(),
})

const CheckoutSchema = z.object({
  email:   z.string().email("A valid email is required"),
  address: AddressSchema,
})

// ─── Exported Types ───────────────────────────────────────────────────────────

export type CheckoutInput = z.infer<typeof CheckoutSchema>
export type StripeIntentResult = { clientSecret: string; guestToken: string } | { error: string }
export type BankTransferResult = { guestToken: string } | { error: string }

// ─── Private helper ───────────────────────────────────────────────────────────

type OrderContext = {
  parsed: z.infer<typeof CheckoutSchema>
  userId: string | null
  customerEmail: string
  cart: Awaited<ReturnType<typeof getCart>>
  totals: ReturnType<typeof computeOrderTotal>
  orderId: string
  guestToken: string
  reference: string
  items: Array<{
    id: string
    orderId: string
    variantId: string
    quantity: number
    priceKobo: number
    productName: string
    variantLabel: string
    lineTotalKobo: number
  }>
}

/**
 * Shared order-context builder: validates input, reads session, recomputes totals from DB,
 * and generates IDs/reference. Returns all data needed by the caller to insert the order.
 *
 * CLAUDE.md: totals are ALWAYS derived from getCart() (server-side DB read + price join),
 * never from any client-supplied value. PaymentIntent amount is set from here.
 */
async function buildOrderContext(input: unknown): Promise<{ error: string } | OrderContext> {
  // 1. Validate address + email (Zod; rejects bad states, invalid emails, missing required fields)
  const parsed = CheckoutSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Invalid input: " + (parsed.error.issues[0]?.message ?? "validation failed") }
  }

  // 2. Session — nullable (guests allowed, CHKT-01). Email from session for logged-in users (D-02).
  const session = await auth()
  const userId: string | null = session?.user?.id ?? null
  const customerEmail: string = session?.user?.email ?? parsed.data.email

  // 3. Recompute cart server-side — never trust client amounts (CLAUDE.md, T-04-10)
  const cart = await getCart()
  if (cart.items.length === 0) {
    return { error: "Cart is empty" }
  }
  if (cart.hasOOS) {
    return { error: "Remove out-of-stock items before checkout" }
  }

  // 4. Server-side totals: subtotal + FLAT_SHIPPING_KOBO (CHKT-03/04)
  const totals = computeOrderTotal({ subtotalKobo: cart.subtotalKobo })

  // 5. IDs + reference
  const orderId = crypto.randomUUID()
  const guestToken = generateGuestToken()
  const reference = await generateUniqueOrderRef()

  // 6. Build order_item rows — all values are snapshots from the hydrated cart (immutable record)
  const items = cart.items.map((item) => ({
    id: crypto.randomUUID(),
    orderId,
    variantId: item.variantId,
    quantity: item.quantity,
    priceKobo: item.priceKobo,
    productName: item.productName,
    variantLabel: item.variantLabel,
    lineTotalKobo: item.lineTotalKobo,
  }))

  return {
    parsed: parsed.data,
    userId,
    customerEmail,
    cart,
    totals,
    orderId,
    guestToken,
    reference,
    items,
  }
}

// ─── createBankTransferOrder ──────────────────────────────────────────────────

/**
 * Create a bank-transfer order.
 *
 * PAY-03 / D-11 / ORD-02:
 *   - Order status is hardcoded "awaiting_bank_transfer" — NOT paid (Pitfall 8, T-04-13)
 *   - Generates MS-XXXXXX reference for the narration
 *   - Sends bank instructions email synchronously (must succeed before return)
 *   - Does NOT decrement stock (D-09 — admin confirms in Phase 5)
 *
 * Returns { guestToken } on success; the page redirects to /order/{guestToken}.
 */
export async function createBankTransferOrder(
  input: CheckoutInput
): Promise<BankTransferResult> {
  // PAY-04 / D-13 — disabled method rejected server-side before any other work (T-04-11)
  if (!isPaymentMethodEnabled("bank_transfer")) {
    return { error: "Bank transfer is not available" }
  }

  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx

  const { parsed, userId, customerEmail, totals, orderId, guestToken, reference, items } = ctx

  // Insert order + items atomically via db.batch (neon-http; note: db.transaction not available)
  await db.batch([
    db.insert(orders).values({
      id: orderId,
      reference,
      guestToken,
      status: "awaiting_bank_transfer",  // D-11, Pitfall 8 — NOT paid
      userId,
      customerEmail,
      subtotalKobo: totals.subtotalKobo,
      shippingKobo: totals.shippingKobo,
      totalKobo: totals.totalKobo,
      shippingName:     parsed.address.fullName,
      shippingPhone:    parsed.address.phone,
      shippingStreet:   parsed.address.street,
      shippingCity:     parsed.address.city,
      shippingState:    parsed.address.state,
      shippingLandmark: parsed.address.landmark ?? null,
      createdAt: new Date(),
    }),
    ...(items.length > 0
      ? [db.insert(orderItems).values(items)]
      : []
    ),
  ])

  // D-09: variant.stock is NOT modified here — atomic decrement in admin-confirm (Phase 5)

  // ORD-02: send bank transfer instructions email (synchronous — propagates on failure)
  await sendBankTransferInstructionsEmail({
    customerEmail,
    reference,
    guestToken,
    items: items.map((i) => ({
      productName:   i.productName,
      variantLabel:  i.variantLabel,
      quantity:      i.quantity,
      lineTotalKobo: i.lineTotalKobo,
    })),
    subtotalKobo: totals.subtotalKobo,
    shippingKobo: totals.shippingKobo,
    totalKobo:    totals.totalKobo,
  })

  revalidatePath("/", "layout")
  return { guestToken }
}

// ─── createStripePaymentIntent ────────────────────────────────────────────────

/**
 * Create a Stripe PaymentIntent and a pending_payment order.
 *
 * PAY-01 / CHKT-03/04:
 *   - Amount is server-recomputed kobo total (CLAUDE.md — never client price, T-04-10)
 *   - Currency "ngn" (A1 — Stripe represents NGN in kobo)
 *   - Does NOT decrement stock (D-09 — webhook does it on payment_confirmed)
 *
 * Returns { clientSecret, guestToken } on success.
 */
export async function createStripePaymentIntent(
  input: CheckoutInput
): Promise<StripeIntentResult> {
  // PAY-04 / D-13 — disabled method rejected server-side (T-04-11)
  if (!isPaymentMethodEnabled("stripe")) {
    return { error: "Card payment is not available" }
  }

  const ctx = await buildOrderContext(input)
  if ("error" in ctx) return ctx

  const { parsed, userId, customerEmail, totals, orderId, guestToken, reference, items } = ctx

  // Insert order + items atomically (pending_payment; stripePaymentIntentId updated after PI creation)
  await db.batch([
    db.insert(orders).values({
      id: orderId,
      reference,
      guestToken,
      status: "pending_payment",
      userId,
      customerEmail,
      subtotalKobo: totals.subtotalKobo,
      shippingKobo: totals.shippingKobo,
      totalKobo: totals.totalKobo,
      shippingName:     parsed.address.fullName,
      shippingPhone:    parsed.address.phone,
      shippingStreet:   parsed.address.street,
      shippingCity:     parsed.address.city,
      shippingState:    parsed.address.state,
      shippingLandmark: parsed.address.landmark ?? null,
      createdAt: new Date(),
    }),
    ...(items.length > 0
      ? [db.insert(orderItems).values(items)]
      : []
    ),
  ])

  // D-09: variant.stock is NOT modified here — atomic decrement in webhook (Phase 4)

  // Create Stripe PaymentIntent with SERVER-COMPUTED totalKobo (T-04-10)
  // amount = kobo (NGN minor unit); currency must be "ngn" (A1 from RESEARCH.md)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totals.totalKobo,
    currency: "ngn",
    automatic_payment_methods: { enabled: true },
    metadata: { orderId, reference },
  })

  // Store the PaymentIntent ID so the webhook can look up the order
  await db
    .update(orders)
    .set({ stripePaymentIntentId: paymentIntent.id })
    .where(eq(orders.id, orderId))

  revalidatePath("/", "layout")
  return { clientSecret: paymentIntent.client_secret!, guestToken }
}
