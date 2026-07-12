// WAVE 0 RED SCAFFOLD — customers.test.ts goes green after Task 3 (listCustomersForAdmin exists).
// tests/admin/customers.test.ts
// ADMN-08 (admin views searchable/paginated all-customers list). Verifies the
// minimal no-PII DTO (D-06), ilike search, pagination, and per-user order count (D-02).
// DB-gated tests run only with TEST_DATABASE_URL; the truncate helpers refuse to run otherwise.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { hasDatabase, getDb, truncateAuthTables, truncateOrderTables } from "../helpers/db"

vi.mock("server-only", () => ({}))

import { listCustomersForAdmin, ADMIN_PAGE_SIZE } from "@/lib/catalog/admin-queries"

async function insertUser(overrides: Record<string, unknown> = {}) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  const id = crypto.randomUUID()
  await db.insert(schema.users).values({
    id,
    name: (overrides.name as string) ?? "Test User",
    email: (overrides.email as string) ?? `user-${id.slice(0, 8)}@example.com`,
    passwordHash: "argon2-hash-should-never-leak",
    role: (overrides.role as "customer" | "admin") ?? "customer",
    ...overrides,
  })
  return id
}

async function insertOrder(userId: string | null) {
  const db = await getDb()
  const schema = await import("@/lib/db/schema")
  await db.insert(schema.orders).values({
    id: crypto.randomUUID(),
    reference: "MS-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    guestToken: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 32),
    status: "payment_confirmed",
    userId,
    customerEmail: "buyer@example.com",
    subtotalKobo: 1_000_000,
    shippingKobo: 200_000,
    totalKobo: 1_200_000,
    shippingName: "Test",
    shippingPhone: "08000000000",
    shippingStreet: "1 Test St",
    shippingCity: "Lagos",
    shippingState: "Lagos",
  })
}

beforeEach(async () => {
  if (hasDatabase) {
    await truncateOrderTables()
    await truncateAuthTables()
  }
})

afterEach(async () => {
  if (hasDatabase) {
    await truncateOrderTables()
    await truncateAuthTables()
  }
  vi.clearAllMocks()
})

describe("listCustomersForAdmin — DTO / no-PII (D-06, T-09-06)", () => {
  it.skipIf(!hasDatabase)("returns exactly the minimal DTO keys and never passwordHash/token", async () => {
    await insertUser({ email: "dto@example.com" })
    const { rows } = await listCustomersForAdmin({})
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["createdAt", "email", "emailVerified", "id", "name", "orderCount", "role"],
    )
    expect(Object.keys(rows[0])).not.toContain("passwordHash")
    expect(Object.keys(rows[0])).not.toContain("token")
    expect(rows[0].emailVerified).toBe(false) // unverified user → boolean, not a Date
  })
})

describe("listCustomersForAdmin — search (ilike, T-09-01)", () => {
  it.skipIf(!hasDatabase)("matches by email substring", async () => {
    await insertUser({ email: "alice@shop.com", name: "Alice" })
    await insertUser({ email: "bob@other.com", name: "Bob" })
    const { rows, total } = await listCustomersForAdmin({ q: "shop.com" })
    expect(total).toBe(1)
    expect(rows[0].email).toBe("alice@shop.com")
  })

  it.skipIf(!hasDatabase)("matches by name substring, case-insensitively", async () => {
    await insertUser({ email: "c@example.com", name: "Charlie" })
    await insertUser({ email: "d@example.com", name: "Dana" })
    const { rows, total } = await listCustomersForAdmin({ q: "CHARL" })
    expect(total).toBe(1)
    expect(rows[0].name).toBe("Charlie")
  })
})

describe("listCustomersForAdmin — pagination", () => {
  it.skipIf(!hasDatabase)("pages at ADMIN_PAGE_SIZE with correct total/pageCount", async () => {
    for (let i = 0; i < ADMIN_PAGE_SIZE + 2; i++) {
      await insertUser({ email: `p${i}@example.com` })
    }
    const p1 = await listCustomersForAdmin({ page: 1 })
    expect(p1.rows).toHaveLength(ADMIN_PAGE_SIZE)
    expect(p1.total).toBe(ADMIN_PAGE_SIZE + 2)
    expect(p1.pageCount).toBe(2)
    const p2 = await listCustomersForAdmin({ page: 2 })
    expect(p2.rows).toHaveLength(2)
  })
})

describe("listCustomersForAdmin — order count (D-02)", () => {
  it.skipIf(!hasDatabase)("counts a user's orders and excludes guest (userId NULL) orders", async () => {
    const userId = await insertUser({ email: "counted@example.com" })
    await insertOrder(userId)
    await insertOrder(userId)
    await insertOrder(null) // guest order — attributes to nobody
    const { rows } = await listCustomersForAdmin({ q: "counted@example.com" })
    expect(rows).toHaveLength(1)
    expect(rows[0].orderCount).toBe(2)
  })

  it.skipIf(!hasDatabase)("reports 0 for a user with no orders", async () => {
    await insertUser({ email: "noorders@example.com" })
    const { rows } = await listCustomersForAdmin({ q: "noorders@example.com" })
    expect(rows[0].orderCount).toBe(0)
  })
})
