# Phase 8: Admin-Managed Payment Credentials - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning
**Mode:** `--auto` (all gray areas auto-resolved with recommended defaults; see DISCUSSION-LOG.md)

<domain>
## Phase Boundary

Move **all 8 payment gateways'** credentials out of `.env` and into the DB-backed admin portal at `/admin/settings`: secret keys, public/publishable keys, merchant IDs, hash/MAC keys, webhook signing secrets, and endpoint URLs. Secrets are **encrypted at rest** (AES-256-GCM) with a single `CREDENTIALS_ENCRYPTION_KEY` that stays in `.env`. Credentials resolve **DB-first with `.env` fallback** so existing deployments keep working and gateways migrate one at a time.

Gateways in scope: Stripe, PayPal, bank transfer, Paystack, Flutterwave, Interswitch, GTPay, Remita.

**In scope:** credential schema + encryption, an async DB-first credential resolver threaded through the gateway modules and webhook routes, admin Settings UI for entering/replacing credentials (write-only secrets), and admin-gated write actions.

**Out of scope (unchanged):** the payment *flows* themselves (init/verify/webhook/confirm — Phase 4/7/7.1), the enable/disable *toggle* (Phase 5 `store_settings`, kept as-is), and adding any new gateway. This phase changes *where credentials come from*, not *how payments work*.

</domain>

<decisions>
## Implementation Decisions

### Credential storage schema
- **D-01:** New **`gateway_credentials`** table, field-level key/value rows — **not** a JSON blob per gateway. Shape: `(provider text, field text, value text, is_secret boolean, updated_at timestamptz, updated_by text)`, primary key `(provider, field)`. `value` holds the encryption *envelope* for `is_secret` fields and plaintext for public fields/URLs. Field-level rows give per-field write-only/replace semantics and selective encryption without decrypting a whole blob to change one key. The existing **`store_settings`** table (enabled toggles) is untouched.

### Encryption at rest
- **D-02:** **Node built-in `crypto`, AES-256-GCM** — no external dependency. Master key `CREDENTIALS_ENCRYPTION_KEY` = base64-encoded 32 bytes, server-only in `.env` (never `NEXT_PUBLIC_`). Stored envelope is a **versioned** string `v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>`, random 12-byte IV per encryption. Only `is_secret` fields are encrypted; public/publishable keys and endpoint URLs are stored plaintext. Encrypt/decrypt live in a single server-only `src/lib/payments/crypto.ts` (or similar) — decryption never happens outside the credential resolver.

### Runtime resolution (DB-first, env fallback)
- **D-03:** A server-only async resolver — `getGatewayConfig(provider)` / `getGatewayCredential(provider, field)` — is the single source of gateway credentials at runtime. Precedence: **DB value if present, else `process.env.<VAR>` fallback.** Each gateway field maps to its canonical env var name so fallback is deterministic. Request-scoped batched read via `React.cache` (mirrors `getStoreSettingsMap`) to avoid N+1 on the hot path. **Fail-closed:** if a required field resolves empty from *both* DB and env, the method is treated as not-configured (`isPaymentMethodEnabled` → false; webhook verify → reject) — never fail-open.
- **D-03a:** Migrate every direct `process.env.*` credential read to the resolver: `config.ts` `hasEnvAndCredentials()`, the 5 gateway modules (`gateways/{paystack,flutterwave,interswitch,gtpay,remita}.ts`), `stripe.ts`, and the 6 webhook routes (`api/webhooks/*`). Regression-safe: with an empty `gateway_credentials` table the env fallback reproduces today's exact behavior. `isPaymentMethodEnabled` stays async (already is).

### Settings UI — write-only secrets
- **D-04:** Per-gateway credential card under `/admin/settings`, an expandable form per method. **Secret fields are write-only:** show `Configured ••••` + last-updated + a **Replace** control; the input is never pre-filled and an empty submit **leaves the stored value unchanged** (no blank overwrite). Public/publishable keys and URLs are shown and editable. Only *presence booleans*, last-updated, and public-field values ever cross to the client — the current "boolean-only" contract is preserved. **Single active keyset per gateway** — no dual test/live storage this phase (dev-vs-prod separation stays deployment-driven via separate DBs, per Phase 7 D-08).

### Write-action security
- **D-05:** New `saveGatewayCredentials(provider, fields)` Server Action mirroring `toggleStoreSetting`: `verifyAdminSession()` is the **literal first statement**, then a **closed Zod schema per provider** (allowlisted field names only), server-only, encrypt-secrets-before-persist, stamps `updated_at`/`updated_by`. Never echoes secret values. The UI read path returns presence + public values only.

### Test-connection (verify before enable)
- **D-06:** Best-effort **"Test connection"** for gateways with a cheap authenticated check — Stripe (`balance.retrieve`), Paystack/Flutterwave (a lightweight authenticated GET). Redirect-only gateways (Interswitch/GTPay/Remita) have no reliable ping → skip, show "saved — not verifiable". **Non-blocking**: saving/enabling never *requires* a passing test; it's an affordance, not a gate.

### Key rotation & operational safety
- **D-07:** Single-key **v1**, with the versioned `v1:` envelope prefix reserved for future rotation. Rotating `CREDENTIALS_ENCRYPTION_KEY` invalidates stored secrets → admin must **re-enter** them (documented in `.env.local.example` + inline Settings help). No automated re-encryption this phase. The resolver **throws a clear error** if a `v1:` ciphertext exists but the key is missing/wrong-length — never silently fails open.

### Audit trail
- **D-08:** Minimal — `updated_by` + `updated_at` on each credential row. No separate audit-log table, no value history.

### Migration & DB push
- **D-09:** `gateway_credentials` created via `db:push` to **both** dev and test DBs (drizzle-kit TTY prompt → direct-SQL fallback per established pattern). Model the **full field set for all 8 gateways** (secret + public + merchant IDs + hash/MAC + webhook secret + endpoint URLs), PayPal included for completeness (stays deferred/OFF — no NGN). Safe to ship before migrating any deployment: env fallback + OFF-by-default toggles mean existing `.env` config keeps working untouched.

### Claude's Discretion
- Exact table/column naming, file layout, and the per-provider field manifest (which fields each gateway exposes).
- Envelope encoding details and the resolver's caching granularity.
- Settings UI form component structure, per-gateway card layout, and where "Test connection" buttons render.
- Whether the credential resolver and toggle gate share one batched loader.

</decisions>

<specifics>
## Specific Ideas

- User's framing: *"configure the credentials, so not everything is .env — those payment methods could be in the admin portal instead."* Resolved as: **~20 scattered gateway secrets in `.env` → 1 encryption key in `.env`**, everything else managed in the admin UI. The user explicitly accepted keeping one master key in env (encrypted-at-rest posture) over plaintext-in-DB.
- This also unblocks the **pending Phase 7 / 7.1 human-verify**: an admin can paste Paystack/Flutterwave test keys (and the redirect-gateway sandbox creds) into the UI instead of editing `.env` and redeploying.
- Keep the exact server-only + boolean-only-to-client discipline already used on the Settings page — secrets must never appear in a client bundle or props.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 8: Admin-Managed Payment Credentials" — goal + 5 success criteria (the scope anchor).
- `.planning/REQUIREMENTS.md` §"Admin — Payment Credentials (Phase 8)" — ADMN-05 (configurable creds), ADMN-06 (encrypted at rest + write-only UI), ADMN-07 (DB-first w/ env fallback, admin-gated, fail-closed).

### Prior decisions this phase extends
- `.planning/phases/05-admin-panel/05-CONTEXT.md` §D-11 — the `store_settings` DB-backed toggle + dual-gate (DB flag AND credentials) design this phase plugs credentials into; also the db:push-to-both-DBs and sync→async migration precedent.
- `.planning/phases/07-nigerian-payment-gateways/07-CONTEXT.md` §D-02 (gateway-adapter interface), §D-06 (per-gateway server toggle), §D-08 (test-in-dev / live-in-prod key strategy).
- `.planning/phases/07.1-additional-ng-gateways/07.1-CONTEXT.md` §D-16 (`InitResult` discriminated union) — for the redirect gateways touched by the resolver migration.

### Code that must change or be reused (see code_context)
- `src/lib/payments/config.ts`, `src/lib/payments/store-settings.ts`, `src/lib/actions/admin-settings.ts`, `src/app/admin/settings/page.tsx`, `src/lib/payments/gateways/*.ts`, `src/lib/payments/stripe.ts`, `src/app/api/webhooks/*/route.ts`, `src/lib/db/schema.ts`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getStoreSettingsMap()`** (`src/lib/payments/store-settings.ts`) — `React.cache` request-scoped batched DB read. Copy this pattern for a `getGatewayCredentialsMap()` batched loader to keep the credential resolver off the N+1 path.
- **`toggleStoreSetting()`** (`src/lib/actions/admin-settings.ts`) — the exact security template for `saveGatewayCredentials`: `verifyAdminSession()` first statement, closed Zod enum, `"use server"` + `import "server-only"`, boolean/minimal result only.
- **Settings page** (`src/app/admin/settings/page.tsx`) — already computes `credentialsPresent` booleans server-side and passes only booleans to `PaymentToggleRow`. Extend this page with credential cards; reuse the server-only presence pattern for the masked "Configured" state.
- **`isPaymentMethodEnabled()` / `hasEnvAndCredentials()`** (`src/lib/payments/config.ts`) — the single `switch` where every method's credential presence is validated. This is the primary integration seam: swap `process.env.*` reads for resolver calls; the dual-gate (DB toggle AND creds) stays intact.

### Established Patterns
- **Server-only discipline:** `import "server-only"`, no `NEXT_PUBLIC_`, only booleans/public values cross to the client (T-05-23). Secrets must never enter a client bundle.
- **Dual-auth:** `verifyAdminSession()` as the first statement of every admin action/route (D-02, CLAUDE.md).
- **db:push to BOTH dev + test DBs**, drizzle-kit TTY prompt → direct SQL via `@neondatabase/serverless` fallback (01-01/03-01/05-01 precedent).
- **Async credential gate:** `isPaymentMethodEnabled` is already async (Phase 5 D-11 sync→async migration) — no new async-conversion churn at call sites, only inside the gate.
- **Test conventions:** `next/cache` mocked in Server Action tests; integration tests gated on `TEST_DATABASE_URL`; Resend/Stripe constructors mocked via `vi.hoisted`.

### Integration Points
- **Credential reads to migrate** (all `process.env.*` → resolver): `config.ts` (8-case switch), `gateways/{paystack,flutterwave,interswitch,gtpay,remita}.ts`, `stripe.ts`, and webhook signature verification in `api/webhooks/{stripe,paystack,flutterwave,gtpay,remita}/route.ts` (the webhook signing secret becomes a DB-resolved value on the verification hot path — must stay fail-closed).
- **New schema** `gateway_credentials` in `src/lib/db/schema.ts` → migration to both DBs.
- **New Settings surface** — credential cards added to the existing `/admin/settings` page + a new `saveGatewayCredentials` action + a `crypto.ts` encrypt/decrypt module + the resolver module.

</code_context>

<deferred>
## Deferred Ideas

- **Dual test/live keyset storage** with a per-gateway mode switch — this phase stores a single active keyset; dev/prod separation stays deployment-driven (separate DBs). Revisit if the owner wants to flip test↔live from the UI.
- **Automated encryption-key rotation** + a bulk re-encrypt script (multi-version `v2:` envelopes). This phase requires manual re-entry on key change.
- **Full credential-change audit log** with history/diffs — this phase keeps only `updated_by`/`updated_at`.
- **External secrets manager / KMS** (AWS KMS, HashiCorp Vault, Doppler) instead of app-level AES-256-GCM — larger infra decision, not warranted at current scale.

</deferred>

---

*Phase: 08-admin-managed-payment-credentials*
*Context gathered: 2026-07-11*
