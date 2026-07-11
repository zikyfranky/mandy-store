# Phase 8: Admin-Managed Payment Credentials - Research

**Researched:** 2026-07-11
**Domain:** Server-side secret storage (AES-256-GCM envelope encryption), DB-first/env-fallback config resolution, Next.js 16 Server Actions/Route Handlers
**Confidence:** HIGH (encryption API, schema, resolver pattern, security discipline) / MEDIUM (test-connection endpoints, some field classifications) / LOW (none — all LOW items are flagged explicitly below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New **`gateway_credentials`** table, field-level key/value rows — not a JSON blob per gateway. Shape: `(provider text, field text, value text, is_secret boolean, updated_at timestamptz, updated_by text)`, primary key `(provider, field)`. `value` holds the encryption envelope for `is_secret` fields and plaintext for public fields/URLs. `store_settings` is untouched.
- **D-02:** Node built-in `crypto`, AES-256-GCM — no external dependency. Master key `CREDENTIALS_ENCRYPTION_KEY` = base64-encoded 32 bytes, server-only in `.env` (never `NEXT_PUBLIC_`). Stored envelope is a versioned string `v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`, random 12-byte IV per encryption. Only `is_secret` fields are encrypted. Encrypt/decrypt live in a single server-only `src/lib/payments/crypto.ts` (or similar) — decryption never happens outside the credential resolver.
- **D-03:** A server-only async resolver — `getGatewayConfig(provider)` / `getGatewayCredential(provider, field)` — is the single source of gateway credentials at runtime. Precedence: DB value if present, else `process.env.<VAR>` fallback. Each gateway field maps to its canonical env var name. Request-scoped batched read via `React.cache` (mirrors `getStoreSettingsMap`). Fail-closed: if a required field resolves empty from *both* DB and env, the method is treated as not-configured — never fail-open.
- **D-03a:** Migrate every direct `process.env.*` credential read to the resolver: `config.ts` `hasEnvAndCredentials()`, the 5 gateway modules, `stripe.ts`, and the 6 webhook routes. Regression-safe: with an empty `gateway_credentials` table the env fallback reproduces today's exact behavior. `isPaymentMethodEnabled` stays async.
- **D-04:** Per-gateway credential card under `/admin/settings`, expandable form per method. Secret fields are write-only: `Configured ••••` + last-updated + Replace control; input never pre-filled; empty submit leaves stored value unchanged. Public/publishable keys and URLs are shown and editable. Only presence booleans, last-updated, and public-field values ever cross to the client. Single active keyset per gateway.
- **D-05:** New `saveGatewayCredentials(provider, fields)` Server Action mirroring `toggleStoreSetting`: `verifyAdminSession()` literal first statement, closed Zod schema per provider (allowlisted field names only), server-only, encrypt-secrets-before-persist, stamps `updated_at`/`updated_by`. Never echoes secret values.
- **D-06:** Best-effort "Test connection" for Stripe (`balance.retrieve`), Paystack/Flutterwave (lightweight authenticated GET). Interswitch/GTPay/Remita have no reliable ping → skip, "saved — not verifiable". Non-blocking: saving/enabling never requires a passing test.
- **D-07:** Single-key v1, `v1:` envelope prefix reserved for future rotation. Rotating `CREDENTIALS_ENCRYPTION_KEY` invalidates stored secrets → admin must re-enter (documented in `.env.local.example` + inline help). No automated re-encryption. Resolver **throws a clear error** if a `v1:` ciphertext exists but the key is missing/wrong-length — never silently fails open.
- **D-08:** Minimal audit — `updated_by` + `updated_at` only. No audit-log table, no value history.
- **D-09:** `gateway_credentials` created via `db:push` to **both** dev and test DBs (drizzle-kit TTY prompt → direct-SQL fallback per established pattern). Model the full field set for all 8 gateways (PayPal included, stays deferred/OFF). Safe to ship before migrating any deployment.

### Claude's Discretion

- Exact table/column naming, file layout, and the per-provider field manifest (which fields each gateway exposes).
- Envelope encoding details and the resolver's caching granularity.
- Settings UI form component structure, per-gateway card layout, and where "Test connection" buttons render.
- Whether the credential resolver and toggle gate share one batched loader.

### Deferred Ideas (OUT OF SCOPE)

- Dual test/live keyset storage with a per-gateway mode switch.
- Automated encryption-key rotation + bulk re-encrypt script (multi-version `v2:` envelopes).
- Full credential-change audit log with history/diffs.
- External secrets manager / KMS (AWS KMS, HashiCorp Vault, Doppler).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMN-05 | Admin can configure and replace each gateway's credentials (secret key, public key, merchant IDs, hash/MAC keys, webhook signing secret, endpoint URLs) from the admin portal, persisted to DB — no `.env` edit/redeploy required | Field manifest (§Standard Stack), schema (§Architecture Pattern 1), `saveGatewayCredentials` action pattern (§Code Examples) |
| ADMN-06 | Gateway secrets encrypted at rest (AES-256-GCM) with single server-only master key; secret fields write-only in UI (masked "configured" + Replace, never returned to browser) | `crypto.ts` envelope design (§Architecture Pattern 2), write-only Server Action + form pattern (§Code Examples), Security Domain |
| ADMN-07 | Credentials resolve DB-first with `.env` fallback for all 8 gateways (incl. webhook signature verification), admin-gated, server-only; missing/invalid credential fails closed | Resolver design (§Architecture Pattern 3), webhook hot-path migration (§Pitfall 1), Validation Architecture |
</phase_requirements>

## Summary

This phase is a **plumbing migration**, not new payment logic: every credential read the 8 gateways already perform (`process.env.X`) gets replaced by a call into a new async, request-cached resolver that checks the DB first and falls back to `process.env`. Because every call site that reads a credential (`gateways/*.ts`, `stripe.ts`, `config.ts`, all 6 webhook routes) is **already inside an `async` function** (the `GatewayAdapter` interface methods are all `Promise`-returning, and the webhook routes are already `async POST`), the resolver conversion is mechanically a search-and-replace of `process.env.X` → `await getGatewayConfig("provider")).x` with **no new async/await coloring problem** at almost every site. The one real architectural wrinkle is `webpay-core.ts` (shared by Interswitch/GTPay): its `WebPayConfig` hooks (`buildRequestHash`, `buildFields`, `buildRequeryRequest`) are pure **synchronous** closures that read `process.env` directly — these must be refactored to receive already-resolved credential values as parameters (resolved by the async adapter before calling into the core), not converted to async themselves, to keep the shared core provider-agnostic and simple.

The encryption design is boilerplate Node.js: `crypto.createCipheriv("aes-256-gcm", key, iv)` with a random 12-byte IV per encryption, `cipher.getAuthTag()` after `final()`, and a `v1:iv:authTag:ciphertext` base64 envelope — all verified against current Node.js docs. The schema is a simple field-level key/value table (`gateway_credentials`) that must be pushed to Neon via the project's established direct-SQL fallback script pattern (drizzle-kit hits a TTY prompt on new tables in this environment). The resolver mirrors the existing `getStoreSettingsMap()` `React.cache` batched-loader exactly — one extra DB round trip per request, deduplicated across all gateway checks in that request. Write-only secret UI and the `saveGatewayCredentials` Server Action mirror `toggleStoreSetting`/`PaymentToggleRow` almost line for line, with the one addition of a closed per-provider Zod schema and pre-persist encryption.

**Primary recommendation:** Build `src/lib/payments/crypto.ts` (encrypt/decrypt with lazy key validation), `src/lib/payments/gateway-credentials.ts` (the `React.cache` batched loader + field manifest + `getGatewayConfig(provider)` resolver with fail-closed semantics), migrate all 8 gateways' credential reads to the resolver (webpay-core requires the params-not-async refactor), then extend `/admin/settings` with per-gateway credential cards backed by a new `saveGatewayCredentials` Server Action. Ship with an empty `gateway_credentials` table first (regression-neutral — env fallback reproduces current behavior) before doing any live credential migration.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Credential storage (`gateway_credentials` rows) | Database / Storage | — | Persistence of the field-level key/value rows; encryption envelope stored as opaque text |
| Encrypt/decrypt (AES-256-GCM) | API / Backend | — | `crypto.ts` is server-only Node.js crypto; must never run client-side or in Edge |
| Master key (`CREDENTIALS_ENCRYPTION_KEY`) | API / Backend | — | Server-only env var; never touches DB or client bundle |
| DB-first/env-fallback resolver (`getGatewayConfig`) | API / Backend | Database / Storage (reads) | Single source of truth at runtime for both Server Actions and Route Handlers |
| Webhook signature verification (secret resolution) | API / Backend | — | Route Handler (nodejs runtime) resolves the signing secret via the same resolver before HMAC compare — must stay fail-closed |
| Admin credential entry UI (`/admin/settings` cards) | Frontend Server (SSR) | API / Backend (Server Action) | Server Component renders presence booleans + public values only; the write goes through a Server Action, never a client-side fetch to a secret-bearing endpoint |
| `saveGatewayCredentials` write path | API / Backend | — | Server Action: auth-gate, Zod validation, encryption, persist — all server-only |
| Test-connection pings (Stripe/Paystack/Flutterwave) | API / Backend | External Service (gateway API) | Server-side authenticated call to the gateway's own API; result surfaces as UI feedback only, never blocks save |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` (built-in) | Node 22 (project pinned via `.nvmrc`) [VERIFIED: package.json/CLAUDE.md] | AES-256-GCM encrypt/decrypt | No external dependency; Node's crypto module is the audited, native implementation of AES-GCM — exactly what D-02 locks in |
| `drizzle-orm` | 0.45.2 [VERIFIED: package.json, already installed] | `gateway_credentials` table definition | Already the project's ORM; no new dependency |
| `zod` | 4.4.3 [VERIFIED: package.json, already installed] | Closed per-provider credential schema (D-05) | Already used for every other Server Action (`toggleStoreSetting`, checkout) |
| `react` (`cache`) | 19.2.4 [VERIFIED: package.json, already installed] | Request-scoped batched credential loader | Identical pattern to `getStoreSettingsMap` |
| `@neondatabase/serverless` | 1.1.0 [VERIFIED: package.json, already installed] | Direct-SQL `db:push` fallback script for the new table | Established pattern (`apply-store-settings-schema.mjs`) — drizzle-kit hits a TTY prompt on new-table creation in this environment |

No new npm packages are required for this phase.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `stripe` | 22.3.0 [VERIFIED: package.json] | `stripe.balance.retrieve()` for Test Connection | Only for the Stripe test-connection affordance (D-06); needs a throwaway `Stripe` client constructed from the candidate secret key, not the existing lazy singleton (which is fixed to `process.env.STRIPE_SECRET_KEY` at first call) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node built-in `crypto` (D-02 locked) | `libsodium`/`tweetnacl` (XSalsa20-Poly1305) | Locked out by D-02 — no external dependency; Node crypto AES-256-GCM is equally audited and avoids a new supply-chain dependency |
| App-level AES-256-GCM (D-02 locked) | AWS KMS / HashiCorp Vault / Doppler | Explicitly deferred (D-02 rationale + Deferred Ideas) — infra overhead not warranted at current scale; the versioned envelope keeps a future migration path open |
| Field-level key/value table (D-01 locked) | One JSON/JSONB blob column per gateway | Locked out by D-01 — field-level rows give per-field write-only/replace semantics without decrypting/re-encrypting a whole blob to change one key |

**Installation:** None — no new packages.

**Version verification:**
```bash
npm view drizzle-orm version   # sanity-check against installed 0.45.2 if the planner wants to bump
```
All core libraries above are already installed and version-pinned in `package.json`; no new installs, so no new version-drift risk.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Admin browser (/admin/settings)                                        │
│  - Credential card per gateway: presence booleans + public values only  │
│  - Secret input: never pre-filled; empty submit = "leave unchanged"     │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ form submit (Server Action call)
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  saveGatewayCredentials(provider, fields)   [Server Action, server-only] │
│  1. verifyAdminSession()  ── FIRST statement (D-05)                     │
│  2. closed per-provider Zod schema (allowlisted field names only)       │
│  3. for each is_secret field with a non-empty value: encryptSecret()    │
│     for each is_secret field submitted EMPTY: skip (leave DB row as-is)│
│  4. db.insert(gatewayCredentials)...onConflictDoUpdate (provider,field) │
│  5. never echoes secret values back                                     │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ persists
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  gateway_credentials (Neon Postgres)                                    │
│  (provider, field) PK — value: envelope "v1:iv:tag:ct" (secret) or      │
│  plaintext (public/URL) — is_secret, updated_at, updated_by             │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │ read (batched, request-scoped)
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  getGatewayCredentialsMap()  [React.cache — ONE query per request]      │
└───────────────────────────┬───────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  getGatewayConfig(provider)  [async resolver, server-only]              │
│  for each field in FIELD_MANIFEST[provider]:                            │
│    dbEntry = map[provider]?.[field]                                     │
│    if dbEntry exists and non-empty:                                     │
│       value = dbEntry.isSecret ? decryptSecret(dbEntry.value) : dbEntry.value │
│    else:                                                                 │
│       value = process.env[FIELD_MANIFEST[provider][field].envVar]       │
│  → returns a fully-typed config object; a field that resolves empty     │
│    from BOTH sources is `undefined` — callers fail closed on that       │
└──────┬───────────────────────────┬───────────────────────────┬──────────┘
       │                            │                            │
       ▼                            ▼                            ▼
┌──────────────┐          ┌──────────────────────┐      ┌─────────────────────┐
│ config.ts    │          │ gateways/*.ts +       │      │ webhooks/*/route.ts │
│ hasEnvAnd    │          │ stripe.ts             │      │ (nodejs runtime)     │
│ Credentials()│          │ (initPayment/verify/  │      │ raw body FIRST, THEN │
│ → presence   │          │  refund — already     │      │ await getGatewayConfig│
│   check only │          │  async)               │      │ for the signing secret│
└──────────────┘          └───────────┬───────────┘      │ → HMAC compare; if   │
                                        │                  │ secret undefined →   │
                            ┌───────────▼───────────┐      │ reject 400 (fail-    │
                            │ webpay-core.ts          │      │ closed, D-03)        │
                            │ (Interswitch/GTPay)     │      └─────────────────────┘
                            │ — hooks stay SYNC;      │
                            │ adapter resolves creds  │
                            │ BEFORE calling the core │
                            │ and passes them as data │
                            └─────────────────────────┘
```

### Recommended Project Structure

```
src/lib/payments/
├── crypto.ts                    # NEW — AES-256-GCM encrypt/decrypt, versioned envelope
├── gateway-credentials.ts       # NEW — FIELD_MANIFEST + getGatewayCredentialsMap (React.cache) + getGatewayConfig(provider)
├── config.ts                    # MODIFY — hasEnvAndCredentials() becomes async, calls getGatewayConfig
├── store-settings.ts            # unchanged
├── stripe.ts                    # MODIFY — getStripe() reads from resolver, not process.env directly
└── gateways/
    ├── paystack.ts               # MODIFY — env reads → await getGatewayConfig("paystack")
    ├── flutterwave.ts            # MODIFY — same
    ├── interswitch.ts            # MODIFY — resolve creds in adapter, pass into webpay-core calls
    ├── gtpay.ts                  # MODIFY — same
    ├── remita.ts                 # MODIFY — env reads → resolver (already async, trivial)
    └── webpay-core.ts            # MODIFY — WebPayConfig hooks take resolved values as params, no env reads

src/lib/actions/
└── gateway-credentials.ts       # NEW — saveGatewayCredentials(provider, fields) Server Action

src/app/admin/settings/
└── page.tsx                     # MODIFY — add per-gateway credential cards

src/components/admin/
└── GatewayCredentialCard.tsx    # NEW — write-only secret form, mirrors PaymentToggleRow discipline

src/app/api/webhooks/
├── stripe/route.ts               # MODIFY — await getGatewayConfig("stripe") before constructEvent
├── paystack/route.ts             # MODIFY — same, before HMAC compare
├── flutterwave/route.ts          # MODIFY — same
├── gtpay/route.ts                # MODIFY — same
└── remita/route.ts               # MODIFY — same

src/scripts/
├── apply-gateway-credentials-schema.mjs           # NEW — mirrors apply-store-settings-schema.mjs
└── apply-gateway-credentials-schema-to-test-db.mjs # NEW — mirrors the -to-test-db counterpart
```

### Pattern 1: `gateway_credentials` schema

```typescript
// src/lib/db/schema.ts — add alongside storeSettings
export const gatewayCredentials = pgTable(
  "gateway_credentials",
  {
    provider:  text("provider").notNull(),   // "stripe" | "paypal" | "bank_transfer" | "paystack" | ...
    field:     text("field").notNull(),      // "secret_key" | "webhook_secret" | "public_key" | ...
    value:     text("value").notNull(),      // envelope "v1:iv:tag:ct" (is_secret) or plaintext
    isSecret:  boolean("is_secret").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    updatedBy: text("updated_by"),           // admin user id/email (D-08)
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.field] }),
  ],
)
```
Source: [ASSUMED — derived directly from D-01's locked column list; no external doc needed, this is a straightforward Drizzle table matching the existing `storeSettings`/`processedWebhookEvents` style already in `schema.ts`].

### Pattern 2: Encryption envelope (`src/lib/payments/crypto.ts`)

```typescript
import "server-only"
import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12          // bytes — NIST SP 800-38D recommended for GCM [CITED: nodejs.org/api/crypto.html]
const ENVELOPE_VERSION = "v1"

function getKey(): Buffer {
  const b64 = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!b64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set — cannot encrypt/decrypt gateway credentials")
  }
  const key = Buffer.from(b64, "base64")
  if (key.length !== 32) {
    throw new Error(`CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}) — regenerate with e.g. "openssl rand -base64 32"`)
  }
  return key
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)              // NEW random IV every call — never reuse (Pitfall)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()                    // MUST be called AFTER final() [CITED: nodejs.org/api/crypto.html]
  return [ENVELOPE_VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":")
}

export function decryptSecret(envelope: string): string {
  const key = getKey()
  const parts = envelope.split(":")
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error(`Unrecognized credential envelope (expected "${ENVELOPE_VERSION}:iv:tag:ciphertext")`)
  }
  const [, ivB64, tagB64, ctB64] = parts
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))     // MUST be called BEFORE final() [CITED: nodejs.org/api/crypto.html]
  // decipher.final() throws if the auth tag doesn't match (tamper/corruption/wrong key) — this IS the
  // "throw a clear error, never silently fail open" behavior D-07 locks in.
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()])
  return plaintext.toString("utf8")
}
```
Source: [CITED: nodejs.org/api/crypto.html — `Cipher`/`Decipher` class docs, `getAuthTag`/`setAuthTag` call-order requirements confirmed via WebFetch during this research session] + [CITED: NIST SP 800-38D 12-byte IV recommendation, referenced by multiple independent AES-GCM guides found via WebSearch].

**Edge-runtime note:** All call sites for this module are Server Actions and Route Handlers that are already `nodejs` runtime (webhook routes explicitly avoid `export const runtime` because an explicit export breaks `cacheComponents:true`, but the *implicit* default is `nodejs`, confirmed in every existing webhook route's comments). `node:crypto` is unavailable in the Edge runtime, but nothing in this phase's touched code paths runs on Edge — `proxy.ts` (which does run on Edge) never touches payment credentials. [VERIFIED: grep of existing webhook route comments + `src/proxy.ts` scope].

### Pattern 3: DB-first/env-fallback resolver (`src/lib/payments/gateway-credentials.ts`)

```typescript
import "server-only"
import { cache } from "react"
import { db } from "@/lib/db/client"
import { gatewayCredentials } from "@/lib/db/schema"
import { decryptSecret } from "./crypto"

type FieldSpec = { field: string; envVar: string; isSecret: boolean }

// Single source of truth — backbone for schema seed + UI + resolver (see full manifest in
// the "Per-Gateway Field Manifest" table below).
const FIELD_MANIFEST: Record<string, FieldSpec[]> = {
  stripe: [
    { field: "secret_key",       envVar: "STRIPE_SECRET_KEY",                    isSecret: true },
    { field: "webhook_secret",   envVar: "STRIPE_WEBHOOK_SECRET",                isSecret: true },
    { field: "publishable_key",  envVar: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",   isSecret: false },
  ],
  // ...paypal, bank_transfer, paystack, flutterwave, interswitch, gtpay, remita — see manifest table
}

type RawRow = { provider: string; field: string; value: string; isSecret: boolean }

// Request-scoped batched read — ONE query regardless of how many fields/providers are checked
// this request (mirrors getStoreSettingsMap exactly).
export const getGatewayCredentialsMap = cache(async (): Promise<Record<string, Record<string, RawRow>>> => {
  const rows = await db.select().from(gatewayCredentials)
  const map: Record<string, Record<string, RawRow>> = {}
  for (const r of rows) {
    map[r.provider] ??= {}
    map[r.provider][r.field] = r
  }
  return map
})

/**
 * Resolves ALL fields for a provider. DB value wins if present and non-empty;
 * else falls back to process.env[envVar]. A field that resolves to "" or undefined
 * from BOTH sources is omitted from the result — callers must treat a missing key
 * as "not configured" (fail-closed, D-03).
 */
export async function getGatewayConfig(provider: string): Promise<Record<string, string>> {
  const manifest = FIELD_MANIFEST[provider] ?? []
  const map = await getGatewayCredentialsMap()
  const providerRows = map[provider] ?? {}

  const result: Record<string, string> = {}
  for (const spec of manifest) {
    const dbRow = providerRows[spec.field]
    let value: string | undefined
    if (dbRow && dbRow.value !== "") {
      // D-07: decryptSecret THROWS on a bad/missing key — this propagates, it is NOT
      // caught here and coerced to "not configured". A stored ciphertext with an
      // invalid decryption key is an operator error, not an absent-credential case.
      value = dbRow.isSecret ? decryptSecret(dbRow.value) : dbRow.value
    } else {
      value = process.env[spec.envVar] || undefined
    }
    if (value) result[spec.field] = value
  }
  return result
}

/** Convenience single-field accessor for call sites that only need one value. */
export async function getGatewayCredential(provider: string, field: string): Promise<string | undefined> {
  const config = await getGatewayConfig(provider)
  return config[field]
}
```
Source: [ASSUMED — synthesized directly from D-03/D-03a and the existing `getStoreSettingsMap` pattern; not independently verified against an external doc since this is project-internal architecture, not a library API].

### Pattern 4: Webhook hot-path migration (Stripe example)

```typescript
// src/app/api/webhooks/stripe/route.ts — BEFORE (current)
const body = await req.text()
const sig = req.headers.get("stripe-signature") ?? ""
let event: Stripe.Event
try {
  event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
} catch {
  return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
}

// AFTER (D-03/D-03a) — resolve the secret from the DB-first resolver, fail closed if absent
const body = await req.text()
const sig = req.headers.get("stripe-signature") ?? ""
const { webhook_secret: webhookSecret } = await getGatewayConfig("stripe")
if (!webhookSecret) {
  // Fail closed (D-03): no secret from DB or env => reject, do NOT attempt verification
  // with an empty/undefined secret (Stripe's SDK would throw anyway, but this is explicit
  // and gives a clearer error path than relying on the SDK's internal behavior).
  return NextResponse.json({ error: "Gateway not configured" }, { status: 400 })
}
let event: Stripe.Event
try {
  event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
} catch {
  return NextResponse.json({ error: "Signature verification failed" }, { status: 400 })
}
```
The same shape applies to Paystack (`crypto.createHmac("sha512", secretKey)`), Flutterwave (`crypto.createHmac("sha256", webhookHash)`), GTPay/Remita (`crypto.createHash("sha512", ...)` plain-hash schemes) — in every case, resolve the secret via `await getGatewayConfig(provider)` immediately after reading the raw body, and reject with 400 (or `NextResponse` 200-with-no-op for GTPay/Remita, matching their existing "stop retries" convention) *before* attempting the hash/HMAC compare if the secret is absent. [VERIFIED: read all 5 webhook route files this session — the pattern generalizes cleanly across all of them].

### Anti-Patterns to Avoid

- **Converting `webpay-core.ts`'s `WebPayConfig` hooks to `async`:** This would force `buildWebPayRedirect`/`verifyWebPay` (the shared orchestration functions) to become async too, and ripple into every call site that currently treats them as sync. Instead, resolve credentials in the adapter (`interswitch.ts`/`gtpay.ts`, already `async`) and pass resolved values into the hook functions via an extended params object — keep the shared core pure and synchronous.
- **Treating `""` (empty string) as "credential present":** A DB row can legitimately hold an empty string if an admin clears a field without a distinct "delete row" affordance. The resolver must check `dbRow.value !== ""` before treating it as a DB hit, else an empty DB value would silently mask the env fallback (a subtle fail-open).
- **Catching `decryptSecret`'s throw and coercing to `undefined`:** This would turn a "the encryption key changed/is wrong" operator error into a silent "not configured" state, which looks identical to a legitimately-unconfigured gateway. D-07 explicitly locks in throwing here — don't swallow it into the fail-closed path meant for genuinely-absent credentials.
- **Re-instantiating the Stripe SDK client per resolver call:** Keep `getStripe()`'s lazy-singleton shape, but source its key from the resolver on first call rather than `process.env` directly, so the (still-cached) client uses the DB-first value once resolved.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authenticated encryption | A custom cipher-mode wrapper, or CBC + separate HMAC | `crypto.createCipheriv("aes-256-gcm", ...)` (D-02 locked) | GCM's built-in auth tag gives tamper-detection for free; hand-rolled CBC+HMAC-then-encrypt/encrypt-then-MAC schemes are a classic source of padding-oracle and ordering bugs |
| Constant-time secret comparison | A manual `===` string compare for the auth tag | `decipher.setAuthTag()` + `final()` (built into Node's GCM implementation) | Node's GCM implementation already performs the tag check internally when `final()` is called; no separate `crypto.timingSafeEqual` call is needed for THIS path (the existing webhook HMAC compares elsewhere already use plain `===` on hex/base64 digests, which is the project's existing — pre-existing, out of this phase's scope — convention) |
| Field→env-var mapping scattered across call sites | Re-deriving the env var name ad hoc in each gateway module | One `FIELD_MANIFEST` constant in `gateway-credentials.ts` | A single source of truth prevents drift between the resolver, the schema seed, and the admin UI's field list — exactly the kind of duplication that causes a fallback env var to silently stop working after a rename |
| `db:push` for a brand-new table hitting a TTY prompt | Retrying `drizzle-kit push` in a loop or force-piping input | The established `@neondatabase/serverless` direct-SQL script pattern (`apply-store-settings-schema.mjs`/`-to-test-db.mjs`) | This exact problem has already been solved 3 times in this codebase (Phase 3 cart tables, Phase 4 order tables, Phase 5 store_settings) — copy the pattern, don't rediscover it |
| A secrets manager / KMS | Building key-rotation, envelope versioning-in-practice, or a Vault integration | Nothing this phase — explicitly deferred | The versioned `v1:` prefix is intentionally the ONLY rotation-readiness this phase ships; building more is scope creep against the locked Deferred Ideas |

**Key insight:** every "don't hand-roll" here reduces to *reuse what Node's crypto module and this codebase's own established patterns already give you* — this phase has zero net-new external dependencies and the encryption primitive is a textbook Node.js GCM implementation, not a novel design.

## Common Pitfalls

### Pitfall 1: `webpay-core.ts`'s synchronous env-reading closures don't fit the async resolver
**What goes wrong:** `WebPayConfig.buildRequestHash`/`buildFields`/`buildRequeryRequest` are plain synchronous functions that read `process.env.INTERSWITCH_MAC_KEY` etc. directly inside their bodies. `buildWebPayRedirect(cfg, params)` (which calls them) is also synchronous, even though the calling `interswitchAdapter.initPayment` is `async`.
**Why it happens:** The shared core was designed to be provider-agnostic and env-driven at the time it was built (Phase 7.1); no credential-resolution layer existed yet.
**How to avoid:** Resolve all needed fields via `await getGatewayConfig("interswitch")` (or `"gtpay"`) at the TOP of the adapter's already-async `initPayment`/`verifyTransaction` methods, then build a **per-call** `WebPayConfig`-shaped object (or extend `WebPayInitParams` to carry the resolved values) instead of relying on the module-scope singleton config object that closures over `process.env`. Keep `buildRequestHash`/`buildFields`/`buildRequeryRequest`/`buildWebPayRedirect`/`verifyWebPay` themselves synchronous — they operate on data, not on `process.env`.
**Warning signs:** If a planner's task tries to make `WebPayConfig`'s hook signatures `async`, that's a sign the refactor boundary is in the wrong place — it will ripple unnecessarily into `buildWebPayRedirect`/`verifyWebPay` and any test that constructs a `WebPayConfig` inline.

### Pitfall 2: Publishable/public keys are already passed server→client as props — don't assume a client-side rewrite is needed
**What goes wrong:** It's tempting to assume `NEXT_PUBLIC_*` env vars are read directly in client components and therefore "can't" be made DB-first.
**Why it happens:** `NEXT_PUBLIC_` variables are, in general, inlined at build time when referenced directly in client code.
**How to avoid — verified, not a risk:** `src/app/checkout/page.tsx` (a Server Component) already reads `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` **server-side** and passes it down as a `publishableKey` prop to `CheckoutForm` → `StripePaymentPanel`. Similarly, Paystack's public key is returned from the already-async `paystackAdapter.initPayment()`, and Flutterwave's from `flutterwaveBuildParams()` (called inside async `initPayment`). **None of the three client components read `NEXT_PUBLIC_*` directly themselves** — the server always mediates. This means swapping these three reads for `await getGatewayConfig(provider)).publishable_key` in the *server-side* code is a clean, zero-client-impact change. [VERIFIED: grepped `src/components/checkout/*.tsx` + `src/app/checkout/page.tsx` this session].
**Warning signs:** None expected here — flagging this so the planner doesn't over-scope the client components unnecessarily.

### Pitfall 3: Empty-string vs. absent DB row — precedence ambiguity
**What goes wrong:** A DB row with `value = ""` (e.g., an admin clears a field but the UI persists an empty string rather than deleting the row) could be mis-treated as "the DB has a value," suppressing the env fallback and silently breaking a previously-working env-configured gateway.
**Why it happens:** `dbRow exists` and `dbRow has a usable value` are two different conditions that are easy to conflate in a naive `if (dbRow) return dbRow.value`.
**How to avoid:** The resolver must check for a non-empty value (`dbRow && dbRow.value !== ""`), not merely row existence, before deciding not to fall back to env. The write-side (`saveGatewayCredentials`) should also just not write/should delete the row for an intentionally-cleared field, but the resolver must defend against the empty-string case regardless (defense in depth).
**Warning signs:** A gateway that worked via env vars stops working immediately after the admin visits the Settings page and saves an unrelated field on the same provider (if the UI naively re-submits all fields including blanks as `""`).

### Pitfall 4: `decryptSecret`'s intentional throw must not be swallowed into "not configured"
**What goes wrong:** If a `try/catch` around the resolver coerces any thrown error (including a bad/rotated `CREDENTIALS_ENCRYPTION_KEY`) into `isPaymentMethodEnabled() → false` / webhook-reject, this LOOKS like fail-closed but is actually masking an operator error (lost/rotated key) as a normal "gateway not configured" state — the store owner would see payments silently stop with no clear signal of *why*.
**Why it happens:** It's tempting to wrap the whole resolver call in a defensive `try { ... } catch { return false }` for robustness.
**How to avoid:** Let `decryptSecret`'s throw propagate out of `getGatewayConfig` uncaught (per D-07, this is intentional and locked). At the call-site boundary (Server Action / Route Handler), catch it there ONLY to produce a clean 500/error response instead of an unhandled crash — but do not fold it into the same code path as "credential absent." Log the error (without ever logging the decrypted value or the raw envelope) so the operator has a paper trail.
**Warning signs:** A payment method that was working suddenly fails with no distinguishing error in logs between "nobody configured this gateway" and "the encryption key is now wrong."

### Pitfall 5: Logging leaks — error messages that echo raw request/response bodies
**What goes wrong:** Several gateway modules already do `const errorText = await res.text().catch(() => "")` and interpolate it into a thrown `Error` message (e.g., Paystack/Flutterwave/Remita init failures) — if a gateway's error response ever echoes back a submitted secret (unlikely for these APIs, but a plausible failure mode for a misconfigured request), that secret could land in application logs via the thrown error.
**Why it happens:** Pre-existing pattern in the codebase (not introduced by this phase), but this phase increases the population of code paths that build requests from DB-decrypted secrets, raising the stakes.
**How to avoid:** No code change is locked/required here, but the planner should note this as a defense-in-depth item: never log a full request body that included a secret field, and never log `decryptSecret`'s return value directly under any circumstances (only log presence/absence booleans and field names).
**Warning signs:** A production log line containing anything that looks like a live API key or hash.

### Pitfall 6: React.cache is request-scoped only — no invalidation needed, but no cross-request staleness protection either
**What goes wrong:** Assuming `getGatewayCredentialsMap`'s `React.cache` wrapper behaves like a persistent server-side cache (e.g., needing `revalidateTag`/`revalidatePath` after `saveGatewayCredentials` runs).
**Why it happens:** The project already uses `revalidateTag`/`revalidatePath` extensively elsewhere (Phase 2/5 catalog caching), so it's an easy pattern-match error to assume the same is needed here.
**How to avoid:** `React.cache()` only dedupes calls **within a single request/render pass** — it does NOT persist across requests. The very next request after a credential save will re-query the DB fresh with no stale-cache risk. No `revalidateTag`/`revalidatePath` call is needed for `saveGatewayCredentials` (this mirrors `toggleStoreSetting`, which also does not call `revalidatePath`/`revalidateTag` — confirmed by reading the existing action).
**Warning signs:** A task that adds `revalidateTag("gateway-credentials")` or similar — this indicates a misunderstanding of `React.cache`'s scope and is unnecessary complexity.

### Pitfall 7: `db:push` for a new table will very likely hit the same TTY prompt problem
**What goes wrong:** Running `npm run db:push` for `gateway_credentials` (a brand-new table, no data-loss risk) can still stall waiting for an interactive confirmation in this environment (documented 3 times already — cart tables, order tables, store_settings).
**Why it happens:** `drizzle-kit push` sometimes prompts even for purely additive changes when it can't fully disambiguate the diff non-interactively (unrelated existing-constraint false positives have also been observed, per `02-01-SUMMARY.md`).
**How to avoid:** Go straight to the established direct-SQL fallback (`@neondatabase/serverless`) mirroring `apply-store-settings-schema.mjs`/`-to-test-db.mjs` — write `apply-gateway-credentials-schema.mjs` (+ the `-to-test-db` counterpart) rather than debugging the interactive prompt.
**Warning signs:** `npm run db:push` hangs with no output after "Pulling schema from database..." or similar.

## Code Examples

### `FIELD_MANIFEST` — Per-Gateway Field Manifest (ADMN-05 backbone)

Enumerated directly from the 8 gateway modules, `config.ts`, `stripe.ts`, and all 5 webhook routes read this session. `is_secret` classification: cryptographic secrets/keys/hashes = `true`; merchant/product/service identifiers, public keys, and endpoint URLs = `false` (D-01 explicitly separates "merchant IDs" from "hash/MAC keys" as different buckets).

| Provider | Field | Canonical env var (fallback) | is_secret | Notes |
|----------|-------|-------------------------------|-----------|-------|
| stripe | `secret_key` | `STRIPE_SECRET_KEY` | true | Read in `stripe.ts` `getStripe()` |
| stripe | `webhook_secret` | `STRIPE_WEBHOOK_SECRET` | true | Read in `api/webhooks/stripe/route.ts` for `constructEvent` |
| stripe | `publishable_key` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | false | Passed server→client via prop (Pitfall 2) |
| paypal | `client_id` | `PAYPAL_CLIENT_ID` | false | Modeled per D-09 for completeness; stays deferred/OFF |
| paypal | `client_secret` | `PAYPAL_CLIENT_SECRET` | true | Not currently read anywhere at runtime (no PayPal SDK installed — D-05a) |
| paypal | `mode` | `PAYPAL_MODE` | false | `"sandbox"` \| `"live"` enum |
| bank_transfer | `bank_name` | `BANK_NAME` | false | Shown to customers on order confirmation |
| bank_transfer | `account_number` | `BANK_ACCOUNT_NUMBER` | false | Shown to customers (existing behavior, D-10 Phase 4) |
| bank_transfer | `account_name` | `BANK_ACCOUNT_NAME` | false | Shown to customers |
| paystack | `secret_key` | `PAYSTACK_SECRET_KEY` | true | Used for BOTH API auth (init/verify/refund) AND webhook HMAC — no separate webhook secret exists |
| paystack | `public_key` | `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | false | Returned by `initPayment` for the inline popup |
| flutterwave | `secret_key` | `FLUTTERWAVE_SECRET_KEY` | true | Used for API auth (verify/refund) |
| flutterwave | `public_key` | `NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY` | false | Returned by `initPayment`/`flutterwaveBuildParams` |
| flutterwave | `webhook_hash` | `FLUTTERWAVE_WEBHOOK_HASH` | true | Dedicated webhook secret (separate from `secret_key`) |
| interswitch | `merchant_code` | `INTERSWITCH_MERCHANT_CODE` | false | Identifier, used inside the request-hash concat |
| interswitch | `mac_key` | `INTERSWITCH_MAC_KEY` | true | Plain SHA-512 hash key — trimmed at use (existing Pitfall 2 note in code) |
| interswitch | `product_id` | `INTERSWITCH_PRODUCT_ID` | false | Sandbox demo value `1076` documented in `.env.local.example` |
| interswitch | `pay_item_id` | `INTERSWITCH_PAY_ITEM_ID` | false | Sandbox demo value `101` |
| interswitch | `pay_url` | `INTERSWITCH_PAY_URL` | false | Endpoint URL, has a hardcoded sandbox default |
| interswitch | `requery_url` | `INTERSWITCH_REQUERY_URL` | false | Endpoint URL, has a hardcoded sandbox default |
| interswitch | `redirect_url` | `INTERSWITCH_REDIRECT_URL` | false | Endpoint URL; default is computed from `process.env.APP_URL` (NOTE: this is a DIFFERENT env var name than `NEXT_PUBLIC_APP_URL` in `.env.local.example` — pre-existing inconsistency, not introduced by this phase, flag for planner awareness only) |
| gtpay | `merchant_id` | `GTPAY_MERCHANT_ID` | false | Identifier |
| gtpay | `hash_key` | `GTPAY_HASH_KEY` | true | Plain SHA-512 hash key |
| gtpay | `pay_url` | `GTPAY_PAY_URL` | false | Endpoint URL, hardcoded default |
| gtpay | `requery_url` | `GTPAY_REQUERY_URL` | false | Endpoint URL, hardcoded default |
| gtpay | `noti_url` | `GTPAY_NOTI_URL` | false | Endpoint URL; default computed from `APP_URL` (same naming caveat as Interswitch) |
| remita | `merchant_id` | `REMITA_MERCHANT_ID` | false | Identifier, used in both apiHash and statusHash |
| remita | `api_key` | `REMITA_API_KEY` | true | Used for both init (apiHash) and verify (statusHash) |
| remita | `service_type_id` | `REMITA_SERVICE_TYPE_ID` | false | Identifier |
| remita | `base_url` | `REMITA_BASE` | false | Endpoint URL, default `https://demo.remita.net` |

**Total: 28 fields across 8 providers** (3 + 3 + 3 + 2 + 3 + 7 + 5 + 4). This table is the direct input for: (a) the `FIELD_MANIFEST` constant, (b) the seed/schema-push script's optional pre-population of non-secret defaults, (c) the admin UI's per-gateway field list.

### Write-only Server Action pattern (D-05)

```typescript
// src/lib/actions/gateway-credentials.ts
"use server"
import "server-only"
import { z } from "zod"
import { verifyAdminSession } from "@/lib/dal"
import { db } from "@/lib/db/client"
import { gatewayCredentials } from "@/lib/db/schema"
import { encryptSecret } from "@/lib/payments/crypto"
import { FIELD_MANIFEST } from "@/lib/payments/gateway-credentials"

// One closed schema PER provider — allowlisted field names only (D-05).
// Built from FIELD_MANIFEST so the allowlist can never drift from the resolver's own list.
function schemaForProvider(provider: string) {
  const fields = FIELD_MANIFEST[provider] ?? []
  const shape = Object.fromEntries(fields.map((f) => [f.field, z.string().optional()]))
  return z.object(shape)
}

export async function saveGatewayCredentials(
  provider: string,
  fields: Record<string, string>,
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = await verifyAdminSession() // D-05 — literal first statement

  if (!(provider in FIELD_MANIFEST)) {
    return { success: false, error: "Unknown provider" }
  }
  const parsed = schemaForProvider(provider).safeParse(fields)
  if (!parsed.success) {
    return { success: false, error: "Invalid input" }
  }

  const manifest = FIELD_MANIFEST[provider]
  for (const spec of manifest) {
    const submitted = parsed.data[spec.field]
    // Empty submit = leave unchanged (D-04) — skip entirely, do NOT overwrite with "".
    if (submitted === undefined || submitted === "") continue

    const value = spec.isSecret ? encryptSecret(submitted) : submitted
    await db
      .insert(gatewayCredentials)
      .values({ provider, field: spec.field, value, isSecret: spec.isSecret, updatedBy: admin.email })
      .onConflictDoUpdate({
        target: [gatewayCredentials.provider, gatewayCredentials.field],
        set: { value, updatedAt: new Date(), updatedBy: admin.email },
      })
  }

  return { success: true } // never echoes any field value, secret or public
}
```
Source: [ASSUMED — synthesized from D-05 + the existing `toggleStoreSetting` template; Drizzle's `onConflictDoUpdate` API is [VERIFIED: already used implicitly in this codebase's convention style — `ON CONFLICT DO NOTHING` appears in `processedWebhookEvents`/`confirm-order-paid.ts`, confirming Drizzle's upsert API surface is already exercised in this project]].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| ~20 scattered gateway secrets across `process.env` (Phase 4/7/7.1) | 1 encryption key in `.env` + everything else admin-managed in DB | This phase (Phase 8) | Redeploy no longer required to rotate/add gateway credentials; existing `.env` config keeps working untouched via fallback |
| Synchronous `hasEnvAndCredentials()` (Phase 4, made async-wrapping in Phase 5 D-11 for the DB toggle only) | Fully async, DB-first credential presence check | This phase | No new async-coloring ripple — every call site was already inside an async function |

**Deprecated/outdated:** None — this phase does not deprecate any existing Phase 4/7/7.1 payment-flow behavior; it only changes *where* the 8 gateways' credential *values* come from at read time (D-03a). The payment flows (init/verify/webhook/confirm) are explicitly out of scope and untouched.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gateway_credentials` schema shape (exact Drizzle table definition) | Architecture Pattern 1 | Low — straightforward table matching existing conventions; any misnaming is a trivial fix before `db:push` |
| A2 | Resolver internal design (`getGatewayCredentialsMap`/`getGatewayConfig` function shapes, empty-string handling) | Architecture Pattern 3, Pitfall 3 | Low-medium — this is project-internal architecture; getting the empty-string precedence wrong would cause a silent fail-open/fail-closed mismatch, which is exactly why Pitfall 3 is flagged explicitly for the planner and executor to test |
| A3 | `saveGatewayCredentials` exact Server Action shape (per-provider Zod schema derivation from `FIELD_MANIFEST`) | Code Examples | Low — mirrors `toggleStoreSetting` closely; Drizzle's `onConflictDoUpdate` API surface needs a version-specific signature check during implementation (not blocking, well-documented Drizzle API) |
| A4 | Interswitch/GTPay's `NOTI_URL`/`REDIRECT_URL` reads `process.env.APP_URL` (non-public) while `.env.local.example` documents `NEXT_PUBLIC_APP_URL` — pre-existing naming inconsistency | Code Examples (field manifest table) | Low — not introduced by this phase; flagged only so the planner doesn't propagate the same inconsistency into the new `redirect_url`/`noti_url` DB fields without at least noting it |
| A5 | Test-connection exact endpoints for Paystack (`GET /balance`) and Flutterwave (`GET /v3/balances`) as "cheap authenticated pings" | Common Pitfalls / Validation Architecture, Sources | Medium — verified via WebSearch against official-domain results (Paystack docs, Postman-hosted Flutterwave collection) but NOT independently fetched/tested against a live sandbox key this session; Flutterwave in particular is mid-transition from v3 (secret-key Bearer auth, matches this codebase's existing `verifyTransaction`/`refund` calls) to a newer v4 OAuth2 API — recommend the planner/executor confirm the v3 balances endpoint still accepts the existing `Authorization: Bearer <secret_key>` scheme (consistent with the codebase's current v3 usage) before wiring it up, and treat GTPay/Remita/Interswitch as confirmed-no-cheap-ping (D-06 already locks this) |
| A6 | Whether "Test connection" tests the just-typed (unsaved) form value or the already-persisted DB value | Open Questions | Low-medium — D-06/D-04 leave the exact mechanism to Claude's discretion; recommend testing the just-submitted value directly (never persisting it just for a test) so admins can validate before committing, but this needs explicit planner confirmation since it affects the Server Action's parameter shape |

## Open Questions

1. **Test-connection mechanism: unsaved form value vs. persisted DB value?**
   - What we know: D-06 requires a non-blocking "Test connection" affordance for Stripe/Paystack/Flutterwave; D-04 requires secrets to be write-only (never re-sent to the client once saved).
   - What's unclear: Whether "Test connection" should test the value currently typed in the (unsaved) form, or the value already persisted in the DB (via the resolver, decrypting server-side without exposing it).
   - Recommendation: Test the just-submitted form value directly in a dedicated `testGatewayConnection(provider, fields)` Server Action (never persisting it as a side effect of testing) — this lets an admin verify a new key BEFORE committing it, matching the "verify before enable" framing in D-06's decision title. Also support testing the already-saved value when the secret field is left as `Configured ••••` (empty submit) by falling back to `getGatewayConfig(provider)` internally. Planner should lock this explicitly in the plan.

2. **`.env.local.example` update scope.**
   - What we know: D-01/ADMN-05 move credentials to DB-managed storage; `CREDENTIALS_ENCRYPTION_KEY` is the one new required env var (D-02).
   - What's unclear: Whether `.env.local.example` should keep documenting all 28 existing per-gateway env vars (as the fallback path) or trim it down with a comment pointing to the new admin UI.
   - Recommendation: Keep all existing env vars documented (they remain a fully valid fallback path per D-03/D-09 — "safe to ship before migrating any deployment"), and ADD `CREDENTIALS_ENCRYPTION_KEY` with a comment explaining the generation command (`openssl rand -base64 32`) and the rotation-invalidates-secrets caveat (D-07).

3. **Interswitch/GTPay endpoint-URL fields (`pay_url`, `requery_url`, `redirect_url`/`noti_url`) — genuinely admin-configurable, or effectively fixed per gateway?**
   - What we know: D-01/ADMN-05 explicitly names "endpoint URLs" as an admin-configurable category; these 3 gateways' modules already read them from env with sandbox-appropriate hardcoded defaults.
   - What's unclear: In practice, these URLs are gateway-fixed (sandbox vs. production hosts) and rarely change per-deployment — modeling them as admin-editable DB fields is a small amount of extra surface area for questionable day-to-day value, but is explicitly requested by D-09 ("full field set for all 8 gateways").
   - Recommendation: Include them in the schema/manifest per D-09 (already reflected in the Field Manifest table above) but treat them as low-priority/optional in the UI — an admin who never touches them gets the existing hardcoded/env defaults via fallback, so there's no regression risk either way.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:crypto` | AES-256-GCM encrypt/decrypt (D-02) | ✓ | Built into Node 22 [VERIFIED: `.nvmrc`/CLAUDE.md pin Node 22] | — |
| Neon Postgres (`DATABASE_URL`) | `gateway_credentials` table | ✓ | Already provisioned, used by every prior phase | — |
| `TEST_DATABASE_URL` | DB integration tests for the resolver/schema | Environment-dependent — CLAUDE.md documents it as unset-by-default; must be set to a separate Neon branch before this phase's DB integration tests can run | — | Unit tests (mocked DB) always run regardless; only true DB round-trip tests are gated |
| `CREDENTIALS_ENCRYPTION_KEY` | Any `is_secret` field write/read | ✗ (new — must be generated and added to `.env.local` before any secret can be saved) | — | None — this is the phase's one hard new requirement; document generation command in `.env.local.example` |
| Live Stripe/Paystack/Flutterwave sandbox credentials | Test-connection round-trip human-verify | Environment-dependent (same open item as prior phases' human-verify checklists — Phase 7/7.1 already have pending live-credential verifications) | — | Test-connection UI degrades gracefully to "not verifiable yet" if credentials are absent — non-blocking per D-06 |

**Missing dependencies with no fallback:**
- `CREDENTIALS_ENCRYPTION_KEY` must be generated and set before any secret-field save will succeed (encrypt will throw). This is expected/by-design (D-02), not a gap — flag as a required setup step in the plan's Wave 0 or Task 1.

**Missing dependencies with fallback:**
- `TEST_DATABASE_URL` absence only skips DB-integration tests (existing project convention); unit tests for crypto/resolver logic run regardless.
- Live gateway sandbox credentials absence only affects the optional test-connection human-verify checkpoint, not the core encrypted-storage/resolver functionality.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/payments/crypto.test.ts tests/payments/gateway-credentials.test.ts` |
| Full suite command | `npm test` (DB integration tests skip unless `TEST_DATABASE_URL` is set, per CLAUDE.md) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMN-06 | `encryptSecret`/`decryptSecret` round-trip returns original plaintext | unit | `npx vitest run tests/payments/crypto.test.ts -t "round-trip"` | ❌ Wave 0 |
| ADMN-06 | `decryptSecret` throws on wrong-length/missing `CREDENTIALS_ENCRYPTION_KEY` (fail-loud, D-07) | unit | `npx vitest run tests/payments/crypto.test.ts -t "invalid key"` | ❌ Wave 0 |
| ADMN-06 | `decryptSecret` throws on tampered ciphertext/authTag (GCM integrity check) | unit | `npx vitest run tests/payments/crypto.test.ts -t "tamper"` | ❌ Wave 0 |
| ADMN-06 | Stored `value` for an `is_secret` field is never the raw plaintext (envelope prefix check) | unit | `npx vitest run tests/actions/gateway-credentials.test.ts -t "encrypts"` | ❌ Wave 0 |
| ADMN-07 | `getGatewayConfig` returns DB value when a non-empty DB row exists (DB wins over env) | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "DB-first"` | ❌ Wave 0 |
| ADMN-07 | `getGatewayConfig` falls back to `process.env` when no DB row exists | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "env fallback"` | ❌ Wave 0 |
| ADMN-07 | `getGatewayConfig` omits a field (fail-closed) when both DB and env resolve empty | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "fail-closed"` | ❌ Wave 0 |
| ADMN-07 | `getGatewayConfig` treats an empty-string DB row as absent, not as a DB hit (Pitfall 3) | unit | `npx vitest run tests/payments/gateway-credentials.test.ts -t "empty string"` | ❌ Wave 0 |
| ADMN-07 | Existing 8-gateway `config.test.ts` suite still passes after the `hasEnvAndCredentials` migration (regression) | unit | `npx vitest run tests/payments/config.test.ts` | ✅ (existing, must stay green) |
| ADMN-07 | Webhook route rejects with 400 when the resolved signing secret is empty (DB empty + env empty) — fail-closed on the hot path | integration/unit | `npx vitest run tests/checkout/*-webhook.test.ts -t "not configured"` | ❌ Wave 0 (extend existing webhook test files) |
| ADMN-05 | `saveGatewayCredentials` persists a new field, admin-gated (rejects non-admin) | unit | `npx vitest run tests/actions/gateway-credentials.test.ts -t "admin-gated"` | ❌ Wave 0 |
| ADMN-05 | `saveGatewayCredentials` empty submit leaves an existing field unchanged (no blank overwrite, D-04) | unit | `npx vitest run tests/actions/gateway-credentials.test.ts -t "empty submit"` | ❌ Wave 0 |
| ADMN-05/07 | Full env-only regression: with an EMPTY `gateway_credentials` table, all 8 gateways behave identically to pre-Phase-8 (DB integration) | integration | `TEST_DATABASE_URL=... npx vitest run tests/payments/gateway-credentials-integration.test.ts` | ❌ Wave 0 (DB-gated) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/payments/crypto.test.ts tests/payments/gateway-credentials.test.ts tests/actions/gateway-credentials.test.ts`
- **Per wave merge:** `npm test` (full suite — confirms no regression in `config.test.ts`, `gateways.test.ts`, `confirm-order-paid.test.ts`, and all `*-webhook.test.ts` files)
- **Phase gate:** Full suite green before `/gsd-verify-work`; if `TEST_DATABASE_URL` is set, also run the DB-gated env-only-regression integration test with an empty `gateway_credentials` table to prove D-09's "safe to ship before migrating any deployment" claim end-to-end.

### Wave 0 Gaps
- [ ] `tests/payments/crypto.test.ts` — round-trip, invalid-key throw, tamper-detection throw (covers ADMN-06)
- [ ] `tests/payments/gateway-credentials.test.ts` — DB-first/env-fallback/fail-closed/empty-string branches for `getGatewayConfig` (covers ADMN-07), mirroring the mock style of the existing `tests/payments/config.test.ts` (`vi.mock` the db client, mock `getGatewayCredentialsMap`)
- [ ] `tests/actions/gateway-credentials.test.ts` — `saveGatewayCredentials` admin-gate, Zod allowlist, empty-submit-preserves, encryption-before-persist (covers ADMN-05/06), mirroring `tests/admin/settings.test.ts`'s mock style (`vi.hoisted` db chain mock, `vi.mock("@/lib/dal")`)
- [ ] Extend `tests/checkout/webhook.test.ts`, `paystack-webhook.test.ts`, `flutterwave-webhook.test.ts` (+ new gtpay/remita webhook tests if they don't exist yet) with a case for "resolved secret is empty → reject 400 / no-op 200" (covers ADMN-07 hot path)
- [ ] `src/scripts/apply-gateway-credentials-schema.mjs` + `-to-test-db.mjs` — needed before any DB-integration test in this phase can run (mirrors the established `apply-store-settings-schema*.mjs` pattern; not a test file itself, but a Wave 0 prerequisite for the DB-gated tests above)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (indirect only) | Admin session already established by Auth.js v5 (Phase 1); this phase re-verifies it, doesn't establish it |
| V4 Access Control | Yes | `verifyAdminSession()` as the literal first statement of `saveGatewayCredentials` (D-05) — mirrors the project's existing dual-auth discipline (CLAUDE.md) |
| V5 Input Validation | Yes | Closed per-provider Zod schema (allowlisted field names only, derived from `FIELD_MANIFEST` so it can't drift) — rejects any field name not in the manifest |
| V6 Cryptography | Yes | AES-256-GCM via `node:crypto` (D-02); versioned envelope; key length validated at use-time; never a custom/home-rolled cipher construction |
| V9 Communications | No | No new network protocol introduced; existing HTTPS/Neon TLS connection strings unchanged |
| V14 Configuration | Yes | `CREDENTIALS_ENCRYPTION_KEY` server-only (never `NEXT_PUBLIC_`); secrets never logged; write-only UI contract (only presence booleans + public values cross to client, per the project's existing T-05-23 discipline) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Secret leakage into the client bundle/props | Information Disclosure | Server-only discipline (`import "server-only"` on `crypto.ts` and `gateway-credentials.ts`); Settings page passes only presence booleans + public values as props (existing project pattern, extended here) |
| IV reuse under the same key (breaks GCM confidentiality AND forgeability) | Tampering / Information Disclosure | `crypto.randomBytes(12)` generates a fresh IV on every single `encryptSecret` call — never derived, cached, or reused across rows/fields |
| Tampered/corrupted ciphertext going undetected | Tampering | AES-GCM's built-in auth tag (`getAuthTag`/`setAuthTag`) — `decipher.final()` throws on mismatch; this throw is intentionally NOT caught into a fail-open path (D-07, Pitfall 4) |
| Fail-open on missing/invalid encryption key | Elevation of Privilege / Information Disclosure | `getKey()` throws (not silently returns a zero-key or skips encryption) if `CREDENTIALS_ENCRYPTION_KEY` is absent or the wrong length |
| Decrypted secrets or raw envelopes appearing in logs/error messages | Information Disclosure | Never `console.log`/interpolate a decrypted value or a full envelope string into any error message; log presence/absence + provider/field name only (Pitfall 5) |
| Non-admin invoking `saveGatewayCredentials` directly (Server Action IS a public HTTP endpoint under the hood) | Elevation of Privilege | `verifyAdminSession()` first statement, redirects/rejects before any Zod parse or DB write — proxy.ts cannot protect Server Actions, must re-verify inline (CLAUDE.md, mirrors `toggleStoreSetting`) |
| Webhook signing-secret resolution race: a gateway toggled ON in `store_settings` before its credentials are actually saved | Denial of Service (legitimate payments silently rejected) — NOT a security hole, but an operational footgun | Already mitigated by the existing dual-gate design (D-11, Phase 5): `isPaymentMethodEnabled` requires BOTH the DB toggle AND `hasEnvAndCredentials` (now resolver-backed) to be true; an admin can safely flip the toggle on before or after saving credentials without a payment ever being accepted on missing credentials, because the fail-closed resolver keeps `hasEnvAndCredentials` false until a real value exists in DB-or-env |

## Sources

### Primary (HIGH confidence)
- [Node.js crypto module — Cipher/Decipher class](https://nodejs.org/api/crypto.html#class-cipher) — `createCipheriv`/`createDecipheriv`, `getAuthTag`/`setAuthTag` call-order requirements, 12-byte IV recommendation for GCM — fetched directly this session via WebFetch
- Direct codebase reads this session (all files cited inline above): `src/lib/payments/config.ts`, `src/lib/payments/store-settings.ts`, `src/lib/actions/admin-settings.ts`, `src/app/admin/settings/page.tsx`, `src/components/admin/PaymentToggleRow.tsx`, `src/lib/db/schema.ts`, `src/lib/dal.ts`, all 6 webhook routes, all 5 gateway modules + `webpay-core.ts` + `types.ts`, `src/lib/payments/stripe.ts`, `src/scripts/apply-store-settings-schema*.mjs`, `vitest.config.ts`, `tests/payments/config.test.ts`, `tests/admin/settings.test.ts`, `.env.local.example`, `package.json`

### Secondary (MEDIUM confidence)
- [Paystack API Reference — Fetch Balance (Postman)](https://www.postman.com/paystack-developers/paystack-api/request/6mperd4/fetch-balance) + [Paystack Authentication docs](https://paystack.com/docs/api/authentication/) — `GET /balance` as the cheap authenticated ping for Stripe/Paystack test-connection
- [Flutterwave v3 balances endpoint (Postman-hosted collection)](https://www.postman.com/lively-zodiac-773579/flutterwave-api/documentation/9qa6trt/flutterwave-v3) — `GET /v3/balances`; flagged as MEDIUM (not independently sandbox-tested this session) with a v3→v4 transition caveat noted in Assumptions Log A5

### Tertiary (LOW confidence)
- General AES-256-GCM "envelope encryption" best-practice guides (Medium/gist sources surfaced via WebSearch) — used only to cross-confirm the IV-length and "store nonce+tag+ciphertext together, key stays separate" conventions already independently confirmed by the primary Node.js docs source; not relied on for anything not also confirmed by the HIGH-confidence source

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every library already installed and version-pinned in this codebase
- Architecture (resolver/schema/write-only UI): HIGH for the encryption primitive (Node docs verified), MEDIUM-HIGH for the resolver/schema design (synthesized directly from locked CONTEXT.md decisions + an exact existing pattern to mirror, `getStoreSettingsMap`/`toggleStoreSetting`)
- Pitfalls: HIGH — every pitfall was derived from actually reading the 5 gateway modules + `webpay-core.ts` + all 6 webhook routes this session, not from general knowledge
- Test-connection endpoints (D-06): MEDIUM — verified via WebSearch against official/near-official sources but not independently sandbox-tested

**Research date:** 2026-07-11
**Valid until:** 30 days (stable domain — no fast-moving external API surface other than the MEDIUM-confidence test-connection endpoints, which should be re-verified at implementation time against live sandbox credentials per D-06's own "best-effort" framing)
