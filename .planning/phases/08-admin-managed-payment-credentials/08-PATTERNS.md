# Phase 8: Admin-Managed Payment Credentials - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 21 (7 new, 14 modified)
**Analogs found:** 21 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/payments/crypto.ts` | utility | transform | `src/lib/orders/reference.ts` (crypto import convention) + Node `crypto` docs in RESEARCH.md Pattern 2 | partial (no in-repo encryption analog; RESEARCH.md gives the full exact implementation) |
| `src/lib/payments/gateway-credentials.ts` | service | CRUD (batched read) | `src/lib/payments/store-settings.ts` (`getStoreSettingsMap`) | exact (same `React.cache` batched-loader shape) |
| `src/lib/actions/gateway-credentials.ts` (`saveGatewayCredentials`) | controller (Server Action) | request-response / CRUD | `src/lib/actions/admin-settings.ts` (`toggleStoreSetting`) | exact |
| `gateway_credentials` table — `src/lib/db/schema.ts` | model | CRUD | `storeSettings` pgTable (same file, lines 98-102) | exact (same file, adjacent table) |
| `src/scripts/apply-gateway-credentials-schema.mjs` | migration | batch | `src/scripts/apply-store-settings-schema.mjs` | exact |
| `src/scripts/apply-gateway-credentials-schema-to-test-db.mjs` | migration | batch | `src/scripts/apply-store-settings-schema-to-test-db.mjs` | exact |
| `src/components/admin/GatewayCredentialCard.tsx` (+ per-field form) | component | request-response (form submit) | `src/components/admin/ProductForm.tsx` (RHF+Zod+useTransition shape) for the form; `PaymentToggleRow.tsx` for the write-only/masked-value + server-computed-boolean discipline | role-match (two analogs combined) |
| `FIELD_MANIFEST` constant (inside `gateway-credentials.ts`) | config | transform | RESEARCH.md §Code Examples "Per-Gateway Field Manifest" table (28 fields, fully enumerated) | exact (already authored in RESEARCH.md) |
| `src/lib/payments/config.ts` (`hasEnvAndCredentials` → async, resolver-backed) | service | CRUD | itself (existing file — modify in place) | exact (self) |
| `src/lib/payments/stripe.ts` (`getStripe()`) | service | CRUD | itself (existing file — modify in place) | exact (self) |
| `src/lib/payments/gateways/paystack.ts` | service | request-response | itself (existing file — modify in place) | exact (self) |
| `src/lib/payments/gateways/flutterwave.ts` | service | request-response | itself (existing file — modify in place) | exact (self) |
| `src/lib/payments/gateways/interswitch.ts` | service | request-response | itself (existing file — modify in place) | exact (self) |
| `src/lib/payments/gateways/gtpay.ts` | service | request-response | `interswitch.ts` (same WebPayConfig shape) | exact |
| `src/lib/payments/gateways/remita.ts` | service | request-response | itself (existing file — modify in place) | exact (self) |
| `src/lib/payments/gateways/webpay-core.ts` | service | transform (pure hooks) | itself (existing file — modify in place, params-not-async refactor) | exact (self) |
| `src/app/api/webhooks/stripe/route.ts` | route (webhook) | event-driven | itself (existing file — modify in place) | exact (self) |
| `src/app/api/webhooks/paystack/route.ts` | route (webhook) | event-driven | itself (existing file — modify in place) | exact (self) |
| `src/app/api/webhooks/flutterwave/route.ts` | route (webhook) | event-driven | `paystack/route.ts` (same HMAC-then-resolve shape) | exact |
| `src/app/api/webhooks/gtpay/route.ts` | route (webhook) | event-driven | `paystack/route.ts` (plain-hash variant) | role-match |
| `src/app/api/webhooks/remita/route.ts` | route (webhook) | event-driven | `paystack/route.ts` (plain-hash variant) | role-match |
| `src/app/admin/settings/page.tsx` | component (Server Component page) | request-response | itself (existing file — extend in place) | exact (self) |

## Pattern Assignments

### `src/lib/payments/crypto.ts` (utility, transform)

**Analog:** No in-repo encryption module exists yet. Closest structural precedent is `src/lib/orders/reference.ts` for the "server-only, `crypto`-import, never `Math.random`" discipline; the full implementation is already fully specified in `08-RESEARCH.md` §Architecture Pattern 2 (verified against Node.js docs this research session) — **use that code verbatim**, it is not a placeholder.

**Server-only + crypto import convention** (`src/lib/orders/reference.ts` lines 1-19):
```typescript
// T-04-06: guest token uses crypto.getRandomValues — never Math.random.
...
const suffix = Array.from(crypto.getRandomValues(new Uint8Array(6)))
```
(Confirms the project's existing convention of using Web Crypto / Node crypto directly rather than a userland random/crypto shim — same discipline applies to AES-GCM here, just via `node:crypto`'s `Cipher`/`Decipher` classes instead of `getRandomValues`.)

**Exact implementation to use** — copy verbatim from `08-RESEARCH.md` lines 232-276 (`getKey()`, `encryptSecret()`, `decryptSecret()` with the `v1:iv:tag:ciphertext` envelope, `IV_LENGTH = 12`, `getAuthTag()`/`setAuthTag()` call-order). Must start with:
```typescript
import "server-only"
import crypto from "crypto"
```
Never catch `decryptSecret`'s throw inside this module — D-07 requires it to propagate to the resolver/call-site boundary uncaught (see Shared Patterns → Fail-Closed Resolver below).

---

### `src/lib/payments/gateway-credentials.ts` (service, CRUD/batched-read)

**Analog:** `src/lib/payments/store-settings.ts` (full file, 17 lines)

**Full analog file (copy this shape exactly):**
```typescript
import "server-only"
import { cache } from "react"
import { db } from "@/lib/db/client"
import { storeSettings } from "@/lib/db/schema"

export const getStoreSettingsMap = cache(async (): Promise<Record<string, boolean>> => {
  const rows = await db.select().from(storeSettings)
  return Object.fromEntries(rows.map((r) => [r.method, r.enabled]))
})
```

**New file replicates this exactly** but returns a nested `Record<provider, Record<field, RawRow>>` instead of a flat boolean map (because `gateway_credentials` has a compound `(provider, field)` PK vs. `store_settings`'s single `method` PK). Full target shape already drafted in `08-RESEARCH.md` lines 282-349 (`getGatewayCredentialsMap` + `getGatewayConfig(provider)` + `getGatewayCredential(provider, field)`) — use that as the implementation, just:
- import `decryptSecret` from `./crypto`
- import `gatewayCredentials` from `@/lib/db/schema` (new table, see Pattern below)
- `FIELD_MANIFEST` sourced from the 28-row table in `08-RESEARCH.md` §Code Examples

**Critical correctness detail (Pitfall 3, locked D-03):** treat `dbRow.value !== ""` as the DB-hit condition, NOT mere row existence — an empty-string DB row must fall through to the env var, never suppress it.

---

### `src/lib/actions/gateway-credentials.ts` (`saveGatewayCredentials`) (controller/Server Action, CRUD)

**Analog:** `src/lib/actions/admin-settings.ts` (full file, 42 lines)

**Imports pattern** (lines 1-18):
```typescript
"use server"
import "server-only"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { storeSettings } from "@/lib/db/schema"
```

**Auth-first pattern** (lines 20-33) — `verifyAdminSession()` is the literal first statement inside the exported action, before any Zod parse:
```typescript
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
```

**New action extends this exact shape** (closed per-provider Zod schema derived from `FIELD_MANIFEST` instead of a flat enum, `onConflictDoUpdate` upsert instead of `update...where`, encrypt-before-persist for `isSecret` fields, skip-on-empty-submit semantics, stamp `updated_by: admin.email`). Full target implementation already drafted in `08-RESEARCH.md` lines 490-541 — use it verbatim as the baseline, adjusting only import paths.

**Return contract:** same minimal `{ success: true } | { success: false, error: string }` union — never echo any field value, secret or public (mirrors `toggleStoreSetting`'s return exactly).

---

### `gateway_credentials` table (`src/lib/db/schema.ts`)

**Analog:** `storeSettings` (same file, lines 98-102) and `processedWebhookEvents` (lines 85-92, for the compound-key precedent via `accounts`/`variantOptionValues`)

**Analog excerpt** (lines 94-102):
```typescript
// Phase 5 (D-11 / ADMN-04): store_settings — one row per DB-backed payment method.
// A method is enabled only when BOTH this flag is true AND env credentials are present
// (see src/lib/payments/config.ts). Mirrors processedWebhookEvents: small text-PK lookup
// table, no relations.
export const storeSettings = pgTable("store_settings", {
  method:    text("method").primaryKey(),
  enabled:   boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
})
```

**Compound-PK precedent** — `accounts` table (lines 43-59) uses the `(table) => ({ compoundKey: primaryKey({ columns: [...] }) })` builder form for a two-column PK; `variantOptionValues` (lines 186-193) does the same. Use this exact form for `(provider, field)`:
```typescript
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
```
Place immediately after `storeSettings` in `schema.ts`, matching the file's existing grouping-by-phase comment style (`// Phase 5 (D-11 / ADMN-04): ...`).

---

### `src/scripts/apply-gateway-credentials-schema.mjs` (+ `-to-test-db.mjs`) (migration, batch)

**Analog:** `src/scripts/apply-store-settings-schema.mjs` (full file, 57 lines) — copy structure exactly:
```javascript
import { neon } from "@neondatabase/serverless"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const sql = neon(databaseUrl)

async function applyStoreSettingsSchema() {
  console.log("Applying store_settings schema to Neon (DATABASE_URL)...")
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "store_settings" (
        "method" text PRIMARY KEY NOT NULL,
        "enabled" boolean DEFAULT false NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `
    console.log("✓ Created table: store_settings")
    // seed rows...
    const result = await sql`SELECT method, enabled FROM store_settings ORDER BY method`
    console.log("Verification — rows found:", JSON.stringify(result))
    if (result.length >= 3) {
      console.log("SUCCESS: ...")
    } else {
      console.error("ERROR: ...")
      process.exit(1)
    }
  } catch (err) {
    console.error("Error applying schema:", err)
    process.exit(1)
  }
}
applyStoreSettingsSchema()
```

**New script differences:**
- `CREATE TABLE IF NOT EXISTS "gateway_credentials" ("provider" text NOT NULL, "field" text NOT NULL, "value" text NOT NULL, "is_secret" boolean NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL, "updated_by" text, PRIMARY KEY ("provider", "field"))`
- **No secret seeding** — unlike `store_settings` (which seeds 3 enabled-flag rows), do NOT seed any `gateway_credentials` rows; the table ships empty so env fallback reproduces current behavior exactly (D-09's "safe to ship before migrating any deployment").
- The `-to-test-db.mjs` counterpart reads `TEST_DATABASE_URL` instead of `DATABASE_URL` — mirror `apply-store-settings-schema-to-test-db.mjs` for that variable swap.
- Run command convention: `node --env-file=.env.local src/scripts/apply-gateway-credentials-schema.mjs`.

---

### `src/components/admin/GatewayCredentialCard.tsx` (component, request-response form)

**Two analogs combined:**

**1. Write-only/masked-value + server-boolean discipline** — `src/components/admin/PaymentToggleRow.tsx` (full file, 122 lines). Key excerpt (props + optimistic-update pattern, lines 26-60):
```typescript
interface PaymentToggleRowProps {
  method: ToggleableMethod
  label: string
  description: string
  icon: React.ReactNode
  enabled: boolean
  credentialsPresent: boolean   // ← ONLY a boolean crosses from server; never the secret value
  envVarName: string
}

export function PaymentToggleRow({ method, label, ..., credentialsPresent, envVarName }: PaymentToggleRowProps) {
  const [checked, setChecked] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const next = !checked
    setError(null)
    setChecked(next) // optimistic
    startTransition(async () => {
      const result = await toggleStoreSetting(method, next)
      if (!result.success) {
        setChecked(!next) // snap back
        setError("Couldn't update this setting. Try again.")
      }
    })
  }
  ...
}
```
The amber "credentials missing" warning block (lines 72-79) is the pattern to reuse for "Configured ••••" vs "not configured" states.

**2. Multi-field RHF+Zod form scaffold** — `src/components/admin/ProductForm.tsx` (imports + schema + useTransition shape, lines 1-90):
```typescript
"use client"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { inputClass } from "@/components/admin/formStyles"
import { createProduct, updateProduct, deactivateProduct } from "@/lib/actions/admin-products"

const ProductFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ...
})
type ProductFormValues = z.infer<typeof ProductFormSchema>

export function ProductForm({ mode, product, categories, brands }: ProductFormProps) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { register, handleSubmit, ... } = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    ...
  })
  ...
}
```

**Shared input styling** — `src/components/admin/formStyles.ts` (full file, 19 lines):
```typescript
export const inputClass = (hasError?: boolean) =>
  [
    "w-full rounded-lg border bg-surface px-3 py-2.5",
    "text-sm text-foreground placeholder:text-muted",
    "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand",
    "transition-colors",
    hasError ? "border-stock-out ring-2 ring-stock-out" : "border-border",
  ].filter(Boolean).join(" ")
```
Reuse `inputClass` from `@/components/admin/formStyles` verbatim — do not reimplement.

**New component combines both:** per-gateway card, each secret field rendered as `Configured ••••` + last-updated + "Replace" button (toggles to an empty, RHF-registered text input) when `credentialsPresent[field]` is true; a plain always-editable input for public/URL fields. Submit calls `saveGatewayCredentials(provider, fields)` inside `startTransition`, empty-string fields for untouched secrets are simply omitted/blank (server-side skip-on-empty is the actual "leave unchanged" enforcement — D-04).

---

### `src/lib/payments/config.ts` (MODIFY — `hasEnvAndCredentials` → resolver-backed)

**This is the file's own existing pattern** (lines 27-51) — the `switch` structure stays, only the body of each `case` changes from `process.env.X` reads to `await getGatewayConfig(provider)` reads:
```typescript
function hasEnvAndCredentials(method: PaymentMethod): boolean {
  switch (method) {
    case "stripe":
      return process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY
    ...
  }
}
```
Becomes `async function hasEnvAndCredentials(method): Promise<boolean>` with each case doing `const cfg = await getGatewayConfig(method); return process.env.ENABLE_X === "true" && !!cfg.secret_key` (the `ENABLE_X` store-settings-independent toggle stays a direct env read — D-03/D-03a scope is credential VALUES only, not the separate `ENABLE_*` feature flags). Call site `isPaymentMethodEnabled` (lines 60-65) already `await`s `hasEnvAndCredentials`-equivalent logic inline — add the `await` at the one call site inside `isPaymentMethodEnabled`.

---

### `src/lib/payments/stripe.ts` (MODIFY — `getStripe()`)

**Existing pattern** (lines 15-22) — lazy singleton reading `process.env.STRIPE_SECRET_KEY` directly:
```typescript
let _stripe: Stripe | undefined

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured")
    _stripe = new Stripe(key, { typescript: true })
  }
  return _stripe
}
```
**Migration:** `getStripe()` must become `async` (breaking change — check all call sites), sourcing `key` from `await getGatewayConfig("stripe")).secret_key` instead of `process.env` directly, while keeping the lazy-singleton caching. Per RESEARCH.md Anti-Patterns: keep the lazy-singleton SHAPE, only change where the key comes from.

---

### `src/lib/payments/gateways/{paystack,flutterwave,remita}.ts` (MODIFY)

**Analog:** each file is its own analog (already `async` throughout) — `paystack.ts` full pattern (lines 27-59, 71-79, 116-127, 150-165):
```typescript
export async function paystackInitialize(params: {...}): Promise<{...}> {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,   // ← replace with resolved value
      "Content-Type": "application/json",
    },
    ...
  })
  ...
}
```
**Migration:** at the top of each already-`async` function (`paystackInitialize`, `paystackVerify`, `paystackRefund`, and the `paystackAdapter.initPayment`), add `const { secret_key, public_key } = await getGatewayConfig("paystack")` and replace the inline `process.env.PAYSTACK_SECRET_KEY` / `process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` reads with the resolved values. Same shape for `flutterwave.ts` (`secret_key`, `public_key`, `webhook_hash`) and `remita.ts` (`merchant_id`, `api_key`, `service_type_id`, `base_url`). No new async-coloring — every touched function is already `async`.

---

### `src/lib/payments/gateways/interswitch.ts` / `gtpay.ts` + `webpay-core.ts` (MODIFY — params-not-async refactor)

**Analog:** `interswitch.ts` itself (full file, 103 lines) — the current pattern reads env at the TOP of each `WebPayConfig` hook via module-scope arrow functions and inline `process.env.X` calls:
```typescript
const PAY_URL = () =>
  process.env.INTERSWITCH_PAY_URL ?? "https://sandbox.interswitchng.com/collections/w/pay"

const interswitchConfig: WebPayConfig = {
  provider: "interswitch",
  get payUrl() { return PAY_URL() },
  buildRequestHash(p: WebPayInitParams): string {
    const productId = process.env.INTERSWITCH_PRODUCT_ID ?? ""
    const macKey = (process.env.INTERSWITCH_MAC_KEY ?? "").trim()
    return sha512(p.txnRef + productId + payItemId + p.amountKobo + p.redirectUrl + macKey)
  },
  ...
}

export const interswitchAdapter: GatewayAdapter = {
  async initPayment(params): Promise<InitResult> {
    return buildWebPayRedirect(interswitchConfig, { txnRef: params.reference, ... })
  },
  ...
}
```

**Required refactor (Pitfall 1, locked in RESEARCH.md — do NOT make `webpay-core.ts` hooks async):**
1. `webpay-core.ts`'s `WebPayConfig` interface, `buildWebPayRedirect()`, `verifyWebPay()`, and the hook function signatures (`buildRequestHash`, `buildFields`, `buildRequeryRequest`, `parseRequery`) stay **synchronous** and **unchanged in shape** — they must not read `process.env` (they already don't) and must not become `async`.
2. In `interswitch.ts`/`gtpay.ts`, resolve all needed fields via `await getGatewayConfig("interswitch")` at the TOP of `initPayment`/`verifyTransaction` (already `async`), then either (a) build a fresh per-call `WebPayConfig` object closing over the resolved values instead of `process.env`, or (b) extend `WebPayInitParams` to carry the resolved values through to the hooks. Either approach keeps `webpay-core.ts` provider-agnostic and pure.
3. `gtpay.ts` mirrors `interswitch.ts`'s exact structure (confirmed via the shared `WebPayConfig` type) — apply the identical refactor pattern to both.

---

### `src/app/api/webhooks/{stripe,paystack,flutterwave,gtpay,remita}/route.ts` (MODIFY — signing-secret resolution)

**Analog A — Stripe** (`src/app/api/webhooks/stripe/route.ts` lines 26-38):
```typescript
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text()               // raw body FIRST — before any parse
  const sig = req.headers.get("stripe-signature") ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)  // ← replace
  } catch {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }
  ...
}
```
**Migration (per RESEARCH.md Pattern 4):** insert `const { webhook_secret: webhookSecret } = await getGatewayConfig("stripe")` immediately after reading `body`/`sig`, then `if (!webhookSecret) return NextResponse.json({ error: "Gateway not configured" }, { status: 400 })` BEFORE calling `constructEvent`, passing `webhookSecret` (not `process.env.STRIPE_WEBHOOK_SECRET!`) into `constructEvent`.

**Analog B — HMAC-family (Paystack)** (`src/app/api/webhooks/paystack/route.ts` lines 22-46):
```typescript
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isPaymentMethodEnabled("paystack"))) {
    return NextResponse.json({ error: "Gateway disabled" }, { status: 400 })
  }
  const body = await req.text()                       // raw body FIRST (Pitfall 4)
  const signature = req.headers.get("x-paystack-signature") ?? ""
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)   // ← replace with resolved value
    .update(body)
    .digest("hex")
  if (expected !== signature) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
  }
  ...
}
```
**Migration:** resolve `const { secret_key: secretKey } = await getGatewayConfig("paystack")` right after the toggle check, `if (!secretKey) return NextResponse.json({ error: "Gateway not configured" }, { status: 400 })`, then use `secretKey` in `createHmac`. Flutterwave uses `webhook_hash` (a distinct field from `secret_key` — see FIELD_MANIFEST) with the same shape. GTPay/Remita use a plain-hash scheme (`crypto.createHash`) over concatenated fields including `hash_key`/`api_key` — same resolve-then-guard placement, but their "reject" convention is a 200-no-op (matching their existing "stop retries" pattern per RESEARCH.md Pattern 4 closing note) rather than Stripe/Paystack's 400.

---

### `src/app/admin/settings/page.tsx` (MODIFY — mount credential cards)

**Existing pattern** (full file, 135 lines) — Suspense-wrapped async Server Component, server-computed booleans passed as props, zero secret values crossing to client:
```typescript
async function SettingsContent() {
  const settings = await getStoreSettingsMap()
  const stripeEnabled = settings["stripe"] ?? true
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <div className="rounded-2xl bg-surface border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-2">Payment methods</h2>
        <div>
          <PaymentToggleRow method="stripe" ... enabled={stripeEnabled} credentialsPresent={stripeCredentialsPresent()} envVarName="STRIPE_SECRET_KEY" />
          ...
        </div>
      </div>
    </div>
  )
}

function SettingsSkeleton() { /* animate-pulse skeleton */ }

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  )
}
```
**Extension:** add a second `rounded-2xl bg-surface border border-border p-6` card section below/alongside the payment-methods toggle card, one `GatewayCredentialCard` per gateway (8 total, including PayPal/bank_transfer for schema completeness even though PayPal stays OFF). Compute presence booleans + public-field values server-side via `getGatewayConfig(provider)` inside `SettingsContent` (an `async` Server Component — no new async-boundary issue), pass only booleans + `updatedAt` + public values as props, mirroring the existing `stripeCredentialsPresent()` local-helper pattern (lines 46-65) but resolver-backed instead of raw `process.env` reads.

---

## Shared Patterns

### Server-only discipline
**Source:** every existing file in `src/lib/payments/` and `src/lib/dal.ts` (e.g. `src/lib/payments/store-settings.ts` line 1, `src/lib/payments/config.ts` line 1, `src/lib/dal.ts` line 1)
**Apply to:** `crypto.ts`, `gateway-credentials.ts`, `gateway-credentials.ts` (actions file) — every new server-only module.
```typescript
import "server-only"
```
This is a structural build-time guard (importing in a client component is a compile error) — always the first non-comment line.

### `verifyAdminSession()`-first Server Action shape
**Source:** `src/lib/actions/admin-settings.ts` lines 27-28
**Apply to:** `saveGatewayCredentials` (and any new `testGatewayConnection` action per RESEARCH.md Open Question 1)
```typescript
export async function toggleStoreSetting(method: string, enabled: boolean): Promise<ToggleStoreSettingResult> {
  await verifyAdminSession() // D-02 — first statement
  ...
}
```
Literal first statement, before any Zod parse, before any DB or crypto call.

### React.cache batched-loader shape
**Source:** `src/lib/payments/store-settings.ts` lines 13-16
**Apply to:** `getGatewayCredentialsMap()` in `gateway-credentials.ts`
```typescript
export const getStoreSettingsMap = cache(async (): Promise<Record<string, boolean>> => {
  const rows = await db.select().from(storeSettings)
  return Object.fromEntries(rows.map((r) => [r.method, r.enabled]))
})
```
Request-scoped only — no `revalidateTag`/`revalidatePath` needed after writes (Pitfall 6, confirmed `toggleStoreSetting` also does neither).

### Direct-SQL schema-push fallback
**Source:** `src/scripts/apply-store-settings-schema.mjs` (full file) + its `-to-test-db.mjs` counterpart
**Apply to:** `apply-gateway-credentials-schema.mjs` / `-to-test-db.mjs`
```javascript
import { neon } from "@neondatabase/serverless"
const databaseUrl = process.env.DATABASE_URL
const sql = neon(databaseUrl)
await sql`CREATE TABLE IF NOT EXISTS "..." (...)`
```
Always go straight to this pattern for new tables — `drizzle-kit push` hits a TTY prompt in this environment (documented 3x already: cart tables, order tables, store_settings).

### Fail-closed resolver / never coerce a thrown decrypt error into "not configured"
**Source:** RESEARCH.md Pitfall 4 + D-07 (locked decision)
**Apply to:** `gateway-credentials.ts` (`getGatewayConfig`), every webhook route, `config.ts`
- `decryptSecret`'s throw (bad/rotated key, tampered ciphertext) must propagate uncaught out of `getGatewayConfig`.
- Catch it ONLY at the Server Action / Route Handler boundary to produce a clean error response — never fold it into the same code path as "credential genuinely absent."
- Never log a decrypted value or raw envelope — only presence/absence booleans and field/provider names (Pitfall 5).

### Test mocking conventions
**Source:** `tests/payments/config.test.ts` lines 1-27
```typescript
vi.mock("server-only", () => ({}))
vi.mock("@/lib/payments/store-settings", () => ({
  getStoreSettingsMap: vi.fn(),
}))
import { isPaymentMethodEnabled, enabledPaymentMethods } from "@/lib/payments/config"
import { getStoreSettingsMap } from "@/lib/payments/store-settings"

beforeEach(() => {
  vi.mocked(getStoreSettingsMap).mockResolvedValue({})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(getStoreSettingsMap).mockReset()
})
```
**Apply to:** `tests/payments/crypto.test.ts`, `tests/payments/gateway-credentials.test.ts` (mock the db client + mock `getGatewayCredentialsMap` the same way `getStoreSettingsMap` is mocked here), `tests/actions/gateway-credentials.test.ts` (mirror `tests/admin/settings.test.ts`'s `vi.hoisted` db-chain mock + `vi.mock("@/lib/dal")`).

## No Analog Found

None — every file in scope has at least a role-match analog in the existing codebase, or (for `crypto.ts`, which has no encryption precedent in-repo) a fully-specified, Node-docs-verified implementation already drafted in `08-RESEARCH.md` §Architecture Pattern 2.

## Metadata

**Analog search scope:** `src/lib/payments/`, `src/lib/actions/`, `src/lib/db/schema.ts`, `src/lib/dal.ts`, `src/scripts/`, `src/components/admin/`, `src/app/admin/settings/`, `src/app/api/webhooks/`, `tests/payments/`, `tests/admin/`
**Files scanned:** 24 (store-settings.ts, admin-settings.ts, settings/page.tsx, PaymentToggleRow.tsx, config.ts, schema.ts, dal.ts, apply-store-settings-schema.mjs, stripe.ts, paystack.ts, webpay-core.ts, interswitch.ts, flutterwave.ts, gtpay.ts, remita.ts, stripe/route.ts, paystack/route.ts, orders/reference.ts, formStyles.ts, ProductForm.tsx, config.test.ts, plus grep sweeps over gtpay/remita/flutterwave env reads)
**Pattern extraction date:** 2026-07-11
