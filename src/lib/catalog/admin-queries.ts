import "server-only"
// src/lib/catalog/admin-queries.ts
// Admin-only read queries (Phase 5, ADMN-01/02/03) — server-only.
// T-05-06: these intentionally IGNORE products.isActive/variants.isActive (the admin
// editor must be able to load and reactivate deactivated products) but always return
// minimal DTOs — no secrets, no payment credentials, no raw Drizzle records leaked.
//
// Callers MUST call verifyAdminSession() before invoking any of these (D-02) — these
// query functions do not verify admin status themselves.

import { db } from "@/lib/db/client"
import {
  products,
  variants,
  orders,
  orderStatusEnum,
  users,
} from "@/lib/db/schema"
import { and, desc, eq, ilike, or, isNotNull, count, sql } from "drizzle-orm"

export const ADMIN_PAGE_SIZE = 24

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number]

// ─── getProductForAdmin ────────────────────────────────────────────────────────
// Loads a product by id regardless of isActive, including inactive variants, so
// the admin editor can view/reactivate a deactivated product (Pitfall 1).

export async function getProductForAdmin(id: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      brand: true,
      category: true,
      images: { orderBy: (i, { asc: a }) => [a(i.position)] },
      options: {
        orderBy: (o, { asc: a }) => [a(o.position)],
        with: {
          values: { orderBy: (v, { asc: a }) => [a(v.position)] },
        },
      },
      // NO isActive filter — admin editor must see (and be able to reactivate) inactive variants
      variants: {
        with: {
          optionValues: {
            with: {
              optionValue: {
                with: { option: true },
              },
            },
          },
        },
      },
    },
  })

  return product ?? null
}

// ─── listProductsForAdmin ──────────────────────────────────────────────────────

export type AdminProductCard = {
  id: string
  slug: string
  name: string
  isActive: boolean
  variantCount: number
  minPriceKobo: number | null
  maxPriceKobo: number | null
  stockTotal: number
}

export type AdminProductListResult = {
  products: AdminProductCard[]
  total: number
  page: number
  pageCount: number
}

export async function listProductsForAdmin(opts: {
  status?: "all" | "active" | "deactivated"
  q?: string
  page?: number
}): Promise<AdminProductListResult> {
  const { status = "all", q, page = 1 } = opts

  const filters = []
  if (status === "active") {
    filters.push(eq(products.isActive, true))
  } else if (status === "deactivated") {
    filters.push(eq(products.isActive, false))
  }
  if (q) {
    // T-02-04-style: ilike is parameterized, not string-concatenated
    filters.push(ilike(products.name, `%${q}%`))
  }
  const where = filters.length > 0 ? and(...filters) : undefined

  // Variant aggregates (count, price range, stock sum) per product
  const variantAggSq = db
    .select({
      productId: variants.productId,
      variantCount: sql<number>`COUNT(*)`.as("variant_count"),
      minPrice: sql<number | null>`MIN(${variants.priceKobo})`.as("min_price"),
      maxPrice: sql<number | null>`MAX(${variants.priceKobo})`.as("max_price"),
      stockTotal: sql<number>`COALESCE(SUM(${variants.stock}), 0)`.as("stock_total"),
    })
    .from(variants)
    .groupBy(variants.productId)
    .as("variant_agg_sq")

  const baseQuery = db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      isActive: products.isActive,
      variantCount: variantAggSq.variantCount,
      minPriceKobo: variantAggSq.minPrice,
      maxPriceKobo: variantAggSq.maxPrice,
      stockTotal: variantAggSq.stockTotal,
    })
    .from(products)
    .leftJoin(variantAggSq, eq(products.id, variantAggSq.productId))
    .where(where)

  const countQuery = db.select({ total: count() }).from(products).where(where)

  const [rows, countResult] = await Promise.all([
    baseQuery
      .orderBy(desc(products.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    countQuery,
  ])

  const total = countResult[0]?.total ?? 0
  const pageCount = Math.ceil(total / ADMIN_PAGE_SIZE)

  return {
    products: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      isActive: r.isActive,
      variantCount: Number(r.variantCount ?? 0),
      minPriceKobo: r.minPriceKobo === null || r.minPriceKobo === undefined ? null : Number(r.minPriceKobo),
      maxPriceKobo: r.maxPriceKobo === null || r.maxPriceKobo === undefined ? null : Number(r.maxPriceKobo),
      stockTotal: Number(r.stockTotal ?? 0),
    })),
    total,
    page,
    pageCount,
  }
}

// ─── listOrdersForAdmin ─────────────────────────────────────────────────────────

export type AdminOrderRow = {
  id: string
  reference: string
  customerEmail: string
  totalKobo: number
  status: OrderStatus
  gatewayProvider: string | null
  hasStripePaymentIntent: boolean
  createdAt: Date
}

export type AdminOrderListResult = {
  orders: AdminOrderRow[]
  total: number
  page: number
  pageCount: number
}

export async function listOrdersForAdmin(opts: {
  status?: OrderStatus
  page?: number
}): Promise<AdminOrderListResult> {
  const { status, page = 1 } = opts

  const where = status ? eq(orders.status, status) : undefined

  const baseQuery = db
    .select({
      id: orders.id,
      reference: orders.reference,
      customerEmail: orders.customerEmail,
      totalKobo: orders.totalKobo,
      status: orders.status,
      gatewayProvider: orders.gatewayProvider,
      stripePaymentIntentId: orders.stripePaymentIntentId,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(where)

  const countQuery = db.select({ total: count() }).from(orders).where(where)

  const [rows, countResult] = await Promise.all([
    baseQuery
      .orderBy(desc(orders.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    countQuery,
  ])

  const total = countResult[0]?.total ?? 0
  const pageCount = Math.ceil(total / ADMIN_PAGE_SIZE)

  return {
    orders: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      customerEmail: r.customerEmail,
      totalKobo: r.totalKobo,
      status: r.status,
      gatewayProvider: r.gatewayProvider,
      hasStripePaymentIntent: !!r.stripePaymentIntentId,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageCount,
  }
}

// ─── listCustomersForAdmin (Phase 9, ADMN-08 / D-02 / D-06) ──────────────────────
// Searchable, paginated all-customers list for /admin/customers. Mirrors
// listOrdersForAdmin (single-table list) + the GROUP-BY aggregate subquery pattern.
// Returns a MINIMAL DTO — never selects passwordHash or any token (D-06, T-09-06).
// Caller MUST have called verifyAdminSession() first (file contract, line 8).
export type AdminCustomerRow = {
  id: string
  name: string | null
  email: string
  role: "customer" | "admin"
  emailVerified: boolean
  createdAt: Date
  orderCount: number
}

export type AdminCustomerListResult = {
  rows: AdminCustomerRow[]
  total: number
  page: number
  pageCount: number
}

export async function listCustomersForAdmin(opts: {
  q?: string
  page?: number
}): Promise<AdminCustomerListResult> {
  const { q, page = 1 } = opts

  // Parameterized ilike (T-09-01) — value is bound, never string-concatenated.
  const where = q
    ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`))
    : undefined

  // Per-user order count; guest orders (userId IS NULL) attribute to nobody.
  const orderAggSq = db
    .select({
      userId: orders.userId,
      orderCount: sql<number>`COUNT(*)`.as("order_count"),
    })
    .from(orders)
    .where(isNotNull(orders.userId))
    .groupBy(orders.userId)
    .as("order_agg_sq")

  const baseQuery = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      orderCount: orderAggSq.orderCount,
    })
    .from(users)
    .leftJoin(orderAggSq, eq(users.id, orderAggSq.userId))
    .where(where)

  const countQuery = db.select({ total: count() }).from(users).where(where)

  const [rows, countResult] = await Promise.all([
    baseQuery
      .orderBy(desc(users.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    countQuery,
  ])

  const total = countResult[0]?.total ?? 0

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      emailVerified: !!r.emailVerified,
      createdAt: r.createdAt,
      orderCount: Number(r.orderCount ?? 0),
    })),
    total,
    page,
    pageCount: Math.ceil(total / ADMIN_PAGE_SIZE),
  }
}

// ─── getOrderForAdmin ────────────────────────────────────────────────────────────
// The ONLY order-detail read for /admin/orders/[id] (Plan 06). Mirrors
// getOrderByToken's `with` shape (src/lib/orders/queries.ts). Returns null (not
// undefined) for an unknown id so admin pages can call notFound() consistently.

export async function getOrderForAdmin(id: string) {
  if (!id) return null
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { items: true },
  })
  return order ?? null
}
