# Phase 4: Checkout & Payments — Pattern Map

**Mapped:** 2026-06-29
**Files analyzed:** 22 new/modified files
**Analogs found:** 20 / 22

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `src/lib/db/schema.ts` (extend) | model | CRUD | `src/lib/db/schema.ts` (self — cart section) | exact |
| `src/lib/actions/checkout.ts` | service | request-response | `src/lib/actions/cart.ts` | exact |
| `src/lib/payments/config.ts` | utility | request-response | `src/lib/actions/auth.ts` (ADMIN_EMAILS pattern) | role-match |
| `src/lib/payments/stripe.ts` | utility | request-response | `src/lib/db/client.ts` (singleton pattern) | role-match |
| `src/lib/orders/queries.ts` | service | CRUD | `src/lib/cart/queries.ts` | exact |
| `src/lib/orders/reference.ts` | utility | transform | `src/lib/cart/logic.ts` (pure helpers) | role-match |
| `src/lib/orders/shipping.ts` | config | transform | `src/lib/cart/logic.ts` (CART_COOKIE / MAX_AGE constants) | role-match |
| `src/lib/email/send-order-confirmation.ts` | service | request-response | `src/lib/email/send-verification.ts` | exact |
| `src/lib/email/send-bank-transfer-instructions.ts` | service | request-response | `src/lib/email/send-verification.ts` | exact |
| `src/emails/OrderConfirmationEmail.tsx` | component | transform | `src/emails/VerificationEmail.tsx` | exact |
| `src/emails/BankTransferInstructionsEmail.tsx` | component | transform | `src/emails/VerificationEmail.tsx` | exact |
| `src/app/api/webhooks/stripe/route.ts` | route | event-driven | `src/app/api/auth/[...nextauth]/route.ts` (structure) | partial |
| `src/app/api/order/status/[token]/route.ts` | route | request-response | `src/app/api/auth/[...nextauth]/route.ts` (structure) | partial |
| `src/app/checkout/page.tsx` | component | request-response | `src/app/cart/page.tsx` | exact |
| `src/app/order/[token]/page.tsx` | component | request-response | `src/app/products/[slug]/page.tsx` | exact |
| `src/components/checkout/CheckoutForm.tsx` | component | request-response | `src/components/auth/LoginForm.tsx` | exact |
| `src/components/checkout/PaymentMethodSelector.tsx` | component | event-driven | `src/components/cart/CartStepper.tsx` | role-match |
| `src/components/checkout/StripePaymentPanel.tsx` | component | event-driven | `src/components/cart/CartStepper.tsx` | role-match |
| `src/components/checkout/OrderSummaryPanel.tsx` | component | transform | `src/app/cart/page.tsx` (order summary section) | role-match |
| `tests/helpers/db.ts` (extend) | test | CRUD | `tests/helpers/db.ts` (self) | exact |
| `tests/webhooks/stripe.test.ts` | test | event-driven | `tests/cart/cart-db.test.ts` | role-match |
| `.env.local.example` (extend) | config | — | `.env.local.example` (self) | exact |

---

## Pattern Assignments

### `src/lib/db/schema.ts` — extend (model, CRUD)

**Analog:** `src/lib/db/schema.ts` — cart and cart_item table definitions, lines 187–268

**Table definition pattern** (lines 191–214 for `cart` table; replicate for `orders`):
```typescript
export const orders = pgTable("order", {
  id:          text("id").primaryKey(),          // crypto.randomUUID()
  reference:   text("reference").notNull().unique(),  // MS-XXXXXX
  guestToken:  text("guest_token").notNull().unique(), // 64-char hex
  status:      orderStatusEnum("status").notNull().default("pending_payment"),
  userId:      text("user_id").references(() => users.id),
  customerEmail: text("customer_email").notNull(),
  subtotalKobo: integer("subtotal_kobo").notNull(),
  shippingKobo: integer("shipping_kobo").notNull(),
  totalKobo:   integer("total_kobo").notNull(),
  shippingName:    text("shipping_name").notNull(),
  shippingPhone:   text("shipping_phone").notNull(),
  shippingStreet:  text("shipping_street").notNull(),
  shippingCity:    text("shipping_city").notNull(),
  shippingState:   text("shipping_state").notNull(),
  shippingLandmark: text("shipping_landmark"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paypalOrderId:   text("paypal_order_id"),
  createdAt:   timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  paidAt:      timestamp("paid_at", { mode: "date" }),
}, (table) => [
  index("order_user_idx").on(table.userId),
  index("order_guest_token_idx").on(table.guestToken),
  index("order_stripe_pi_idx").on(table.stripePaymentIntentId),
])
```

**Index pattern** (lines 121–127, products table — use same style):
```typescript
}, (table) => [
  index("product_category_idx").on(table.categoryId),
  index("product_brand_idx").on(table.brandId),
  index("product_slug_idx").on(table.slug),
])
```

**Unique constraint pattern** (lines 197–200, cart table):
```typescript
  unique("cart_user_unique").on(table.userId),
```

**Relations pattern** (lines 260–268, cartRelations):
```typescript
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user:  one(users,      { fields: [orders.userId],  references: [users.id] }),
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order:   one(orders,   { fields: [orderItems.orderId],   references: [orders.id] }),
  variant: one(variants, { fields: [orderItems.variantId], references: [variants.id] }),
}))
```

**Enum pattern** (lines 16–25, orderStatusEnum — already exists, do NOT redefine):
```typescript
// orderStatusEnum already defined at lines 16–25 — import and reuse
// "pending_payment" | "awaiting_bank_transfer" | "payment_confirmed" | ...
```

---

### `src/lib/actions/checkout.ts` (service, request-response)

**Analog:** `src/lib/actions/cart.ts` — full file

**Top-of-file directives and imports pattern** (lines 1–19):
```typescript
"use server"
import "server-only"
// ...security contract comment block

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { orders, orderItems, variants } from "@/lib/db/schema"
import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"
import { getCart } from "@/lib/cart/queries"
```

**Zod validation pattern** (lines 22–26, VariantId + Qty schemas):
```typescript
// Define address schema at the top:
const AddressSchema = z.object({
  fullName: z.string().min(1),
  phone:    z.string().min(1),
  street:   z.string().min(1),
  city:     z.string().min(1),
  state:    z.enum([/* 36 states + FCT */]),
  landmark: z.string().optional(),
})
const CheckoutSchema = z.object({
  email:   z.string().email(),
  address: AddressSchema,
})
```

**Return type pattern** (line 29):
```typescript
export type CheckoutActionResult =
  | { success: true; guestToken: string; clientSecret?: string }
  | { error: string }
```

**safeParse guard pattern** (lines 92–100):
```typescript
const parsed = CheckoutSchema.safeParse(input)
if (!parsed.success) {
  return { error: "Invalid input: " + parsed.error.issues[0]?.message }
}
```

**Session-based auth pattern** (line 111 — `const session = await auth()`):
```typescript
// For checkout: session may be null (guest) — do NOT redirect; prefill email from session
const session = await auth()
const customerEmail = session?.user?.email ?? parsed.data.email
```

**getCart() + total recompute pattern** (lines 128–132, from queries.ts usage in cart.ts):
```typescript
// CLAUDE.md: never trust client prices — recompute from DB
const cart = await getCart()
if (cart.items.length === 0) return { error: "Cart is empty" }
if (cart.hasOOS) return { error: "Remove out-of-stock items before checkout" }
const totalKobo = cart.subtotalKobo + FLAT_SHIPPING_KOBO
```

**revalidatePath pattern** (line 157):
```typescript
revalidatePath("/", "layout")
```

**crypto.randomUUID() ID generation** (line 78, getOrCreateCartId):
```typescript
const orderId = crypto.randomUUID()
const guestToken = generateGuestToken()   // from src/lib/orders/reference.ts
const orderRef   = await generateUniqueOrderRef()
```

---

### `src/lib/payments/config.ts` (utility, request-response)

**Analog:** `src/lib/actions/auth.ts` — ADMIN_EMAILS server-only env pattern, lines 72–76

**Server-only env check pattern** (lines 72–76, auth.ts):
```typescript
// Pattern: read process.env directly — no NEXT_PUBLIC_ — server-only
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean)
const role = adminEmails.includes(email) ? "admin" : "customer"
```

**Apply to `isPaymentMethodEnabled`:**
```typescript
import "server-only"

type PaymentMethod = "stripe" | "paypal" | "bank_transfer"

export function isPaymentMethodEnabled(method: PaymentMethod): boolean {
  switch (method) {
    case "stripe":
      return process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY
    case "paypal":
      return process.env.ENABLE_PAYPAL === "true"
    case "bank_transfer":
      return process.env.ENABLE_BANK_TRANSFER === "true"
          && !!process.env.BANK_ACCOUNT_NUMBER
  }
}
```

---

### `src/lib/payments/stripe.ts` (utility, request-response)

**Analog:** `src/lib/db/client.ts` — singleton export pattern, lines 1–11

**Singleton module pattern** (lines 4–11, client.ts):
```typescript
// src/lib/db/client.ts pattern:
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle({ client: sql, schema })
```

**Apply to stripe.ts:**
```typescript
import "server-only"
import Stripe from "stripe"

// Singleton — instantiated once per cold start (server-only module)
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30",  // verify current API version at stripe.com/docs
  typescript: true,
})
```

---

### `src/lib/orders/queries.ts` (service, CRUD)

**Analog:** `src/lib/cart/queries.ts` — full file

**Server-only header + imports pattern** (lines 1–17, queries.ts):
```typescript
import "server-only"
// src/lib/orders/queries.ts

import { db } from "@/lib/db/client"
import { orders, orderItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
```

**findFirst with relations pattern** (lines 95–107, getDbRaw):
```typescript
export async function getOrderByToken(token: string) {
  return db.query.orders.findFirst({
    where: eq(orders.guestToken, token),
    with: { items: true },
  })
}

export async function getOrderByStripePaymentIntentId(piId: string) {
  return db.query.orders.findFirst({
    where: eq(orders.stripePaymentIntentId, piId),
    with: { items: true },
  })
}
```

**Early return on empty** (lines 29–30):
```typescript
if (variantIds.length === 0) return []
```

---

### `src/lib/orders/reference.ts` (utility, transform)

**Analog:** `src/lib/cart/logic.ts` — pure helper pattern, lines 1–14 (no server-only, pure functions)

**Module pattern for pure utilities** (logic.ts lines 1–14 — note: logic.ts is NOT server-only):
```typescript
// logic.ts pattern: no "server-only"; pure functions, safe for server + tests
export const CART_COOKIE = "ms_cart"
export const MAX_AGE = 30 * 24 * 60 * 60
```

**Apply to reference.ts — but ADD server-only (tokens must not run client-side):**
```typescript
import "server-only"
// src/lib/orders/reference.ts

import { db } from "@/lib/db/client"
import { orders } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // omit O/0 I/1

export function generateOrderRef(): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => CHARS[b % CHARS.length])
    .join("")
  return `MS-${suffix}`
}

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

export function generateGuestToken(): string {
  // crypto.getRandomValues() — never Math.random() (RESEARCH Pattern 5)
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")
}
```

---

### `src/lib/orders/shipping.ts` (config, transform)

**Analog:** `src/lib/cart/logic.ts` — exported constants pattern (lines 9–12)

```typescript
// logic.ts constants pattern:
export const CART_COOKIE = "ms_cart"
export const MAX_AGE = 30 * 24 * 60 * 60

// Apply to shipping.ts:
import "server-only"

export const FLAT_SHIPPING_KOBO = parseInt(
  process.env.FLAT_SHIPPING_KOBO ?? "200000",
  10
)
```

---

### `src/lib/email/send-order-confirmation.ts` (service, request-response)

**Analog:** `src/lib/email/send-verification.ts` — full file (34 lines)

**Exact pattern to copy** (lines 1–33, send-verification.ts):
```typescript
import "server-only"
// Header comment with threat model reference

import { Resend } from "resend"
import { OrderConfirmationEmail } from "@/emails/OrderConfirmationEmail"

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendOrderConfirmationEmail(
  order: { customerEmail: string; reference: string; guestToken: string; /* etc */ }
): Promise<void> {
  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/order/${order.guestToken}`

  const { error } = await resend.emails.send({
    from: "Mandy Store <onboarding@resend.dev>",
    to: order.customerEmail,
    subject: `Order confirmed — ${order.reference}`,
    react: OrderConfirmationEmail({ /* props */ }),
  })

  if (error) {
    throw new Error(`Failed to send order confirmation email: ${error.message}`)
  }
}
```

**Key difference from verification email:** In the webhook handler, this is called with `.catch(console.error)` — non-blocking (RESEARCH Pattern 2 anti-pattern note: do not fail the webhook on email error).

---

### `src/lib/email/send-bank-transfer-instructions.ts` (service, request-response)

**Analog:** `src/lib/email/send-verification.ts` — identical pattern

Same pattern as `send-order-confirmation.ts` above. Key additions:
- Includes bank details from server-only env (`process.env.BANK_NAME`, `process.env.BANK_ACCOUNT_NUMBER`, `process.env.BANK_ACCOUNT_NAME`)
- Called synchronously in the bank-transfer checkout action (not in a webhook — must succeed before redirect)
- Subject: `"Bank transfer instructions — ${order.reference}"`

---

### `src/emails/OrderConfirmationEmail.tsx` (component, transform)

**Analog:** `src/emails/VerificationEmail.tsx` — full file (115 lines)

**Imports pattern** (lines 1–14, VerificationEmail.tsx):
```typescript
import {
  Html, Body, Container, Heading, Text, Button, Hr, Preview,
} from "@react-email/components"
```

**Props interface pattern** (lines 16–18):
```typescript
interface OrderConfirmationEmailProps {
  orderRef: string
  orderToken: string
  customerEmail: string
  items: Array<{ productName: string; variantLabel: string; quantity: number; lineTotalKobo: number }>
  subtotalKobo: number
  shippingKobo: number
  totalKobo: number
}
```

**Component structure pattern** (lines 20–53, VerificationEmail):
```typescript
export function OrderConfirmationEmail({ orderRef, orderToken, items, totalKobo, ... }: OrderConfirmationEmailProps) {
  const orderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/order/${orderToken}`
  return (
    <Html lang="en">
      <Preview>Order {orderRef} confirmed — Mandy Store</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>Order confirmed!</Heading>
          {/* line items table, totals using formatNGN(), CTA button to orderUrl */}
          <Button href={orderUrl} style={buttonStyle}>View your order</Button>
          <Hr style={hrStyle} />
          <Text style={footerStyle}>Reference: {orderRef}</Text>
        </Container>
      </Body>
    </Html>
  )
}
```

**Inline styles pattern** (lines 56–114 — copy bodyStyle, containerStyle, headingStyle, textStyle, buttonStyle, hrStyle, footerStyle verbatim; adjust button color if needed):
```typescript
// Copy all style objects from VerificationEmail.tsx lines 56–114.
// buttonStyle backgroundColor: "#2563eb" matches the brand indigo.
const buttonStyle = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  // ... same as VerificationEmail.tsx
}
```

**Use `formatNGN` for all money amounts:**
```typescript
import { formatNGN } from "@/lib/catalog/format"
// formatNGN(lineTotalKobo) in item rows, formatNGN(totalKobo) in total row
```

---

### `src/emails/BankTransferInstructionsEmail.tsx` (component, transform)

**Analog:** `src/emails/VerificationEmail.tsx` — full file

Same pattern as `OrderConfirmationEmail.tsx`. Key additions:
- Props include `bankName`, `bankAccountNumber`, `bankAccountName`, `orderRef` for the narration instruction
- No "View order" CTA is needed — show the order reference prominently with `<Heading>` and `<Text>` for account details
- Still include the `orderUrl` link as a secondary action ("Check your order status")

---

### `src/app/api/webhooks/stripe/route.ts` (route, event-driven)

**Analog (structure):** `src/app/api/auth/[...nextauth]/route.ts` — App Router Route Handler export pattern (line 5–7)

```typescript
// nextauth route pattern:
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

**Route Handler export pattern** — for the Stripe webhook:
```typescript
// MUST be nodejs runtime — never edge (no crypto.subtle timing-safe compare in edge)
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { stripe } from "@/lib/payments/stripe"
import { db } from "@/lib/db/client"
import { processedWebhookEvents, orders, variants } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { sendOrderConfirmationEmail } from "@/lib/email/send-order-confirmation"

export async function POST(req: NextRequest): Promise<NextResponse> {
  // CRITICAL: req.text() before anything else — Stripe signature requires raw body
  const body = await req.text()
  const sig  = req.headers.get("stripe-signature") ?? ""
  // ...constructEvent, batch, email
}
```

**DB interaction pattern — use Drizzle batch (RESEARCH Pitfall 4):**

The existing `db` client (`drizzle-orm/neon-http`) does NOT support `db.transaction()`. Use `db.batch([...])` which is documented as atomic for Neon HTTP. Pattern from RESEARCH.md Pattern 2:
```typescript
// Idempotency-first: insert the event; if conflict → already processed → 200
const [idempotencyResult] = await db.batch([
  db.insert(processedWebhookEvents)
    .values({ id: event.id, provider: "stripe" })
    .onConflictDoNothing(),
])
// Check rowCount to short-circuit duplicates
```

**No analog exists in codebase for webhook Route Handlers.** Use RESEARCH.md Pattern 2 as the reference (verified against Stripe docs). The nextauth route is structural only.

---

### `src/app/api/order/status/[token]/route.ts` (route, request-response)

**Analog (structure):** `src/app/api/auth/[...nextauth]/route.ts`

**GET handler pattern:**
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getOrderByToken } from "@/lib/orders/queries"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params
  const order = await getOrderByToken(token)
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ status: order.status })
}
```

**Async params pattern** — Note Next.js 16 uses `params: Promise<{...}>` (same as `src/app/products/[slug]/page.tsx` lines 31–34, generateMetadata pattern):
```typescript
// products/[slug]/page.tsx line 44–45:
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
```

---

### `src/app/checkout/page.tsx` (component, request-response)

**Analog:** `src/app/cart/page.tsx` — full file (134 lines)

**Page metadata pattern** (lines 14–17, cart/page.tsx):
```typescript
export const metadata: Metadata = {
  title: "Checkout — Mandy Store",
  description: "Complete your purchase.",
}
```

**Suspense + skeleton pattern** (lines 19–40, CartSkeleton + lines 127–133, CartPage):
```typescript
// Outer page: not async; wraps async content in Suspense
export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutContent />
    </Suspense>
  )
}
```

**Async server component pattern** (lines 44–55, CartContent):
```typescript
async function CheckoutContent() {
  const cart = await getCart()

  if (cart.items.length === 0) {
    // Redirect empty carts back to /products
  }

  const session = await auth()
  // Pass cart + session to client islands
}
```

**Two-column layout pattern** (lines 61–119 — left content + right sticky summary):
```typescript
<div className="lg:grid lg:grid-cols-3 lg:gap-8 space-y-8 lg:space-y-0">
  {/* Left: address + payment (2/3) */}
  <div className="col-span-2 ...">
    <CheckoutForm session={session} />
  </div>
  {/* Right: sticky order summary (1/3) */}
  <div className="col-span-1">
    <div className="... sticky top-24">
      <OrderSummaryPanel cart={cart} />
    </div>
  </div>
</div>
```

**formatNGN usage** (line 83, cart/page.tsx):
```typescript
<span>{formatNGN(cart.subtotalKobo)}</span>
// Also: formatNGN(FLAT_SHIPPING_KOBO), formatNGN(totalKobo)
```

---

### `src/app/order/[token]/page.tsx` (component, request-response)

**Analog:** `src/app/products/[slug]/page.tsx` — full file (244 lines)

**Async params pattern** (lines 40–60, generateMetadata):
```typescript
interface OrderPageProps {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const order = await getOrderByToken(token)
  if (!order) return {}
  return { title: `Order ${order.reference} — Mandy Store` }
}
```

**notFound() pattern** (lines 77–78):
```typescript
const order = await getOrderByToken(token)
if (!order) notFound()
```

**Suspense split for dynamic data** (lines 238–243):
```typescript
export default function OrderPage({ params }: OrderPageProps) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Suspense fallback={<OrderSkeleton />}>
        <OrderContent params={params} />
      </Suspense>
    </main>
  )
}
```

**Key difference from products page:** No `'use cache'` — order status is dynamic and must always be fresh (like stock/price). The confirmation page client island polls `/api/order/status/:token` if status is `pending_payment`.

---

### `src/components/checkout/CheckoutForm.tsx` (component, request-response)

**Analog:** `src/components/auth/LoginForm.tsx` — full file (95 lines)

**"use client" + useActionState pattern** (lines 1–23, LoginForm.tsx):
```typescript
"use client"
import { useActionState } from "react"
import { createBankTransferOrder } from "@/lib/actions/checkout"

type CheckoutState = { error: string } | { clientSecret: string } | null

export function CheckoutForm({ session, cart }: CheckoutFormProps) {
  const [state, formAction, isPending] = useActionState<CheckoutState, FormData>(
    async (_prev, formData) => {
      const result = await createBankTransferOrder(formData)
      if ("error" in result) return result
      return null  // redirect handled inside action
    },
    null,
  )
```

**Form field pattern with label + input** (lines 31–48, LoginForm.tsx):
```typescript
<div>
  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    Full name
  </label>
  <input
    id="fullName"
    name="fullName"
    type="text"
    required
    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm ..."
  />
</div>
```

**Error display pattern** (lines 69–71, LoginForm.tsx):
```typescript
{state?.error && (
  <p className="text-sm text-red-600 dark:text-red-400" role="alert">
    {state.error}
  </p>
)}
```

**Disabled-while-pending submit pattern** (lines 75–80):
```typescript
<button
  type="submit"
  disabled={isPending}
  className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition-colors"
>
  {isPending ? "Placing order…" : "Place order"}
</button>
```

**react-hook-form integration** — For the address form specifically, use react-hook-form + @hookform/resolvers (new install). The `useActionState` pattern from LoginForm is for the top-level submission; react-hook-form manages per-field state:
```typescript
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(AddressSchema),
})
```

---

### `src/components/checkout/PaymentMethodSelector.tsx` (component, event-driven)

**Analog:** `src/components/cart/CartStepper.tsx` — useTransition + startTransition pattern, lines 18–32

```typescript
"use client"
import { useTransition } from "react"

interface PaymentMethodSelectorProps {
  enabledMethods: string[]  // from server: ["stripe", "bank_transfer"]
  selected: string
  onChange: (method: string) => void
}
```

**useTransition pending state pattern** (lines 19–32, CartStepper):
```typescript
const [isPending, startTransition] = useTransition()
// isPending drives disabled state and animate-pulse on the quantity display
```

---

### `src/components/checkout/StripePaymentPanel.tsx` (component, event-driven)

**Analog:** `src/components/cart/CartStepper.tsx` (structure), `src/components/product/ProductDetailClient.tsx` (client island with external SDK)

**"use client" client island pattern:**
```typescript
"use client"
// This component loads the Stripe Payment Element.
// Must be a client component — stripe-js runs in the browser only.
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
```

**No analog for Stripe React Elements in this codebase.** Use RESEARCH.md Pattern 1 and Stripe's official `@stripe/react-stripe-js` documentation.

---

### `src/components/checkout/OrderSummaryPanel.tsx` (component, transform)

**Analog:** `src/app/cart/page.tsx` — order summary section, lines 69–119

**Summary panel pattern** (lines 69–119, cart/page.tsx):
```typescript
<div className="rounded-2xl bg-surface border border-border p-6 space-y-4 sticky top-24">
  <h2 className="text-2xl font-semibold text-foreground">Order summary</h2>
  <hr className="border-t border-border" />

  {/* Subtotal row */}
  <div className="flex justify-between text-sm font-semibold">
    <span className="text-muted">Subtotal ({cart.totalQty} items)</span>
    <span className="text-foreground">{formatNGN(cart.subtotalKobo)}</span>
  </div>

  {/* ADD shipping row for checkout: */}
  <div className="flex justify-between text-sm font-semibold">
    <span className="text-muted">Shipping</span>
    <span className="text-foreground">{formatNGN(shippingKobo)}</span>
  </div>

  <hr className="border-t border-border" />

  {/* Total row */}
  <div className="flex justify-between text-base font-semibold">
    <span className="text-foreground">Total</span>
    <span className="text-foreground">{formatNGN(totalKobo)}</span>
  </div>
</div>
```

---

### `tests/helpers/db.ts` — extend (test, CRUD)

**Analog:** `tests/helpers/db.ts` — self (existing structure)

**Truncate helper pattern** (lines 59–66, truncateCartTables):
```typescript
export async function truncateOrderTables() {
  assertTestDatabase()
  const { db } = await import("@/lib/db/client")
  const schema = await import("@/lib/db/schema")

  // FK-safe order: order_item (child) before order (parent)
  await db.delete(schema.orderItems)
  await db.delete(schema.orders)
  // processedWebhookEvents has no FK to orders; safe to delete either order
  await db.delete(schema.processedWebhookEvents)
}
```

---

### `tests/webhooks/stripe.test.ts` (test, event-driven)

**Analog:** `tests/cart/cart-db.test.ts` — full file (537 lines)

**Top-of-file mocks pattern** (lines 6–29, cart-db.test.ts):
```typescript
import { describe, it, expect, afterEach, vi } from "vitest"
import { hasDatabase, truncateOrderTables } from "../helpers/db"

vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
// For webhook tests, also mock stripe:
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: vi.fn(),
    },
    refunds: {
      create: vi.fn().mockResolvedValue({}),
    },
  })),
}))
```

**hasDatabase skip pattern** (line 31, cart-db.test.ts):
```typescript
const skip = !hasDatabase
// Used as: it.skipIf(skip)("...", async () => { ... })
```

**afterEach cleanup pattern** (lines 45–78, cart-db.test.ts):
```typescript
afterEach(async () => {
  if (!hasDatabase) return
  await truncateOrderTables()
  vi.clearAllMocks()
})
```

**DB import-inside-test pattern** (lines 47–49):
```typescript
// Lazy import to avoid connection at module load:
const { db }   = await import("@/lib/db/client")
const schema   = await import("@/lib/db/schema")
const { eq }   = await import("drizzle-orm")
```

**vi.mocked auth override pattern** (lines 242–247, cart-db.test.ts):
```typescript
const { auth } = await import("@/lib/auth")
vi.mocked(auth).mockResolvedValue({
  user: { id: userId, email: "test@example.com", name: "Test" },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as unknown as Awaited<ReturnType<typeof auth>>)
```

**Fixture seeding pattern** (lines 87–161, seedCartFixture):
```typescript
// Create seed helpers for order tests:
async function seedOrderFixture() {
  // user → category → brand → product → variant → order → order_items
  // Return all IDs for assertions and cleanup
}
```

---

## Shared Patterns

### 1. Server-Only Guard
**Source:** `src/lib/cart/queries.ts` line 1; `src/lib/dal.ts` line 1; `src/lib/email/send-verification.ts` line 1
**Apply to:** All new files under `src/lib/` (actions, payments, orders, email)
```typescript
import "server-only"
// First line of every server-side module that must never run in a client bundle
```

### 2. Server Action File Directive
**Source:** `src/lib/actions/cart.ts` line 1; `src/lib/actions/auth.ts` line 1
**Apply to:** `src/lib/actions/checkout.ts`
```typescript
"use server"
// First line of every Server Actions file (enables the Next.js action transport)
```

### 3. Zod Validation Before DB Touch
**Source:** `src/lib/actions/cart.ts` lines 92–100; `src/lib/actions/auth.ts` lines 44–47
**Apply to:** All Server Action functions in `checkout.ts`
```typescript
const parsed = SomeSchema.safeParse(input)
if (!parsed.success) {
  return { error: "Invalid input: " + parsed.error.issues[0]?.message }
}
```

### 4. crypto.randomUUID() for IDs
**Source:** `src/lib/actions/cart.ts` line 125; `src/lib/actions/auth.ts` line 78
**Apply to:** Order ID generation in checkout action
```typescript
const id = crypto.randomUUID()
// Never use Math.random() or sequential integers for IDs
```

### 5. Session from auth() — Never from Client
**Source:** `src/lib/actions/cart.ts` line 111; `src/lib/cart/queries.ts` line 124
**Apply to:** `checkout.ts`, `orders/queries.ts`
```typescript
const session = await auth()
// userId ALWAYS from session — never from formData or URL params (IDOR-safe)
```

### 6. verifySession() for Protected Mutations
**Source:** `src/lib/dal.ts` lines 30–42
**Apply to:** Any future admin-only checkout endpoints (bank-transfer confirmation is Phase 5)
```typescript
// For guest checkout: do NOT call verifySession() — checkout is guest-allowed
// For admin actions (Phase 5): call verifyAdminSession() from dal.ts
```

### 7. revalidatePath After Mutations
**Source:** `src/lib/actions/cart.ts` line 157
**Apply to:** Checkout actions that modify cart or order state
```typescript
revalidatePath("/", "layout")
// Clears RSC cache for all routes after order creation
```

### 8. Resend Client Singleton
**Source:** `src/lib/email/send-verification.ts` line 10
**Apply to:** Both new email sender files
```typescript
const resend = new Resend(process.env.RESEND_API_KEY!)
// Module-level singleton — instantiated once per cold start
```

### 9. Client Component Pending Pattern
**Source:** `src/components/auth/LoginForm.tsx` lines 13–23 (useActionState) and `src/components/cart/CartStepper.tsx` lines 19–32 (useTransition)
**Apply to:** `CheckoutForm.tsx`, `PaymentMethodSelector.tsx`, `StripePaymentPanel.tsx`
```typescript
// For Server Action wrappers: useActionState
const [state, formAction, isPending] = useActionState(...)
// For event handlers calling actions: useTransition
const [isPending, startTransition] = useTransition()
// Both: disabled={isPending} on interactive elements
```

### 10. formatNGN for All Money Display
**Source:** `src/lib/catalog/format.ts` — `formatNGN(kobo: number): string`
**Apply to:** `OrderSummaryPanel.tsx`, `OrderConfirmationEmail.tsx`, `BankTransferInstructionsEmail.tsx`, `src/app/order/[token]/page.tsx`
```typescript
import { formatNGN } from "@/lib/catalog/format"
// Always pass kobo integer; formatNGN divides by 100 internally
// e.g. formatNGN(200000) → "₦2,000.00"
```

### 11. Drizzle Query Pattern (relational API)
**Source:** `src/lib/cart/queries.ts` lines 33–48 (findMany with nested with); `src/lib/actions/cart.ts` lines 40–43 (findFirst with columns)
**Apply to:** `src/lib/orders/queries.ts`
```typescript
// Prefer db.query.tableName.findFirst over db.select().from() for relations
const order = await db.query.orders.findFirst({
  where: eq(orders.guestToken, token),
  with: { items: true },
  columns: { id: true, status: true, reference: true }, // project only needed columns
})
```

### 12. ON CONFLICT DO NOTHING for Idempotency
**Source:** `src/lib/actions/cart.ts` line 63 (cart creation); `src/lib/db/schema.ts` lines 85–92 (processedWebhookEvents unique constraint)
**Apply to:** Stripe webhook handler — idempotency insert
```typescript
await db.insert(processedWebhookEvents)
  .values({ id: event.id, provider: "stripe" })
  .onConflictDoNothing()
// Unique constraint is the true guard (lines 91–92 in schema.ts)
```

### 13. Inline Styles for React Email Templates
**Source:** `src/emails/VerificationEmail.tsx` lines 56–114
**Apply to:** `OrderConfirmationEmail.tsx`, `BankTransferInstructionsEmail.tsx`
```typescript
// All styles must be inline objects (email clients strip <style> tags)
// Copy bodyStyle, containerStyle, headingStyle, textStyle, buttonStyle, hrStyle, footerStyle
// from VerificationEmail.tsx — same brand colors (indigo #2563eb)
```

### 14. Test Mock Setup Order
**Source:** `tests/cart/cart-db.test.ts` lines 6–29; `tests/auth/login.test.ts` lines 8–31
**Apply to:** All Phase 4 test files
```typescript
// Always mock in this order:
vi.mock("server-only", () => ({}))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock("@/lib/auth", () => ({ signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn().mockResolvedValue(null), handlers: {} }))
// Then external SDKs (stripe, resend) as needed
```

---

## No Analog Found

Files with no close codebase match — planner must use RESEARCH.md patterns as the primary reference:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/app/api/webhooks/stripe/route.ts` | route | event-driven | No webhook Route Handlers exist in the codebase. The `nextauth` route is a thin re-export, not a real handler. Use RESEARCH.md Pattern 2 (Stripe Webhook) as the reference. |
| `src/components/checkout/StripePaymentPanel.tsx` | component | event-driven | No Stripe React SDK usage exists in the codebase. Use Stripe's `@stripe/react-stripe-js` `<Elements>` + `<PaymentElement>` docs and RESEARCH.md Pattern 1. |

---

## Metadata

**Analog search scope:** `src/` (all subdirectories), `tests/`
**Files scanned:** 55 source files + 15 test files
**Pattern extraction date:** 2026-06-29
