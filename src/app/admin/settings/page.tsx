// src/app/admin/settings/page.tsx
// Admin Settings — payment-method toggles (ADMN-04) — UI-SPEC Surface 6, extended by
// Phase 8 (ADMN-05/ADMN-06) with a second "Gateway credentials" section card covering
// all 8 gateways' write-only credential management (08-UI-SPEC.md "Surface 6 extended").
//
// D-11 scope (unchanged): exactly Stripe/PayPal/Bank transfer get a live DB *enable/disable*
// toggle here; the 5 NG gateways (Paystack/Flutterwave/Interswitch/GTPay/Remita) stay
// env-only for the toggle and are intentionally NOT shown in the "Payment methods" card
// (U-12) — but ALL 8 get a credential-management disclosure in the new card below, since
// credential management is a distinct concern from the enable/disable toggle (D-04, V-01).
//
// Credential presence for the three toggle rows is now resolver-backed via
// getGatewayConfig() (Phase 8, D-03) instead of reading process.env directly — this makes
// the dual-gate amber warning reflect DB-saved credentials too, not just env.

import { Suspense } from "react"
import { getStoreSettingsMap } from "@/lib/payments/store-settings"
import { PaymentToggleRow } from "@/components/admin/PaymentToggleRow"
import {
  FIELD_MANIFEST,
  getGatewayConfig,
  getGatewayCredentialsMap,
} from "@/lib/payments/gateway-credentials"
import { GatewayCredentialCard, type FieldPresence, type TestConnectionMode } from "@/components/admin/GatewayCredentialCard"

function CreditCardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-brand" aria-hidden="true">
      <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
      <path fillRule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clipRule="evenodd" />
    </svg>
  )
}

function GlobeAltIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-brand" aria-hidden="true">
      <path d="M21.721 12.752a9.711 9.711 0 0 0-.945-5.003 12.754 12.754 0 0 1-4.339 2.708 18.991 18.991 0 0 1-.214 4.772 17.165 17.165 0 0 0 5.498-2.477ZM14.634 15.55a17.324 17.324 0 0 0 .332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 0 0 .332 4.647 17.385 17.385 0 0 0 5.268 0ZM9.772 17.119a18.963 18.963 0 0 0 4.456 0A17.182 17.182 0 0 1 12 21.724a17.18 17.18 0 0 1-2.228-4.605ZM7.777 15.23a18.87 18.87 0 0 1-.214-4.774 12.753 12.753 0 0 1-4.34-2.708 9.711 9.711 0 0 0-.944 5.004 17.165 17.165 0 0 0 5.498 2.477ZM21.356 14.752a9.765 9.765 0 0 1-7.478 6.817 18.64 18.64 0 0 0 1.988-4.718 18.627 18.627 0 0 0 5.49-2.098ZM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 0 0 1.988 4.718 9.765 9.765 0 0 1-7.478-6.816ZM13.878 2.43a9.755 9.755 0 0 1 6.116 3.986 11.267 11.267 0 0 1-3.746 2.504 18.63 18.63 0 0 0-2.37-6.49ZM12 2.276a17.152 17.152 0 0 1 2.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0 1 12 2.276ZM10.122 2.43a18.629 18.629 0 0 0-2.37 6.49 11.266 11.266 0 0 1-3.746-2.504 9.754 9.754 0 0 1 6.116-3.985Z" />
    </svg>
  )
}

function BuildingLibraryIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-brand" aria-hidden="true">
      <path d="M11.584 2.376a.75.75 0 0 1 .832 0l9 6a.75.75 0 1 1-.832 1.248L12 3.901 3.416 9.624a.75.75 0 0 1-.832-1.248l9-6Z" />
      <path fillRule="evenodd" d="M20.25 10.332v9.918H21a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1 0-1.5h.75v-9.918a.75.75 0 0 1 .634-.74A49.109 49.109 0 0 1 12 9c2.59 0 5.134.202 7.616.592a.75.75 0 0 1 .634.74Zm-7.5 2.418a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Zm3-.75a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-1.5 0v-6.75a.75.75 0 0 1 .75-.75ZM9 12.75a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Z" clipRule="evenodd" />
    </svg>
  )
}

// Heroicons BoltIcon 20px — Paystack (reused verbatim from PaymentMethodSelector.tsx)
function BoltIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-brand" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.818a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .845-.143Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// Heroicons ArrowsRightLeftIcon 20px — Interswitch (reused verbatim from PaymentMethodSelector.tsx)
function ArrowsRightLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-brand" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M15.97 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 1 1-1.06-1.06l3.22-3.22H7.5a.75.75 0 0 1 0-1.5h11.69l-3.22-3.22a.75.75 0 0 1 0-1.06Zm-7.94 9a.75.75 0 0 1 0 1.06l-3.22 3.22H16.5a.75.75 0 0 1 0 1.5H4.81l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// Heroicons BanknotesIcon 20px — Remita (reused verbatim from PaymentMethodSelector.tsx)
function BanknotesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-brand" aria-hidden="true">
      <path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" />
      <path
        fillRule="evenodd"
        d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM18.75 9a.75.75 0 0 0-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-.008ZM4.5 9.75A.75.75 0 0 1 5.25 9h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V9.75Z"
        clipRule="evenodd"
      />
      <path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" />
    </svg>
  )
}

function LockClosedIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ─── Gateway credential-card config: order, label, icon, test-connection mode ──────────
// Order per 08-UI-SPEC.md: Stripe/PayPal/Bank transfer first (mirrors the toggle-row order
// above), then the 5 NG gateways grouped together in FIELD_MANIFEST order.

const GATEWAY_ORDER = [
  "stripe",
  "paypal",
  "bank_transfer",
  "paystack",
  "flutterwave",
  "interswitch",
  "gtpay",
  "remita",
] as const

const GATEWAY_META: Record<(typeof GATEWAY_ORDER)[number], { label: string; icon: React.ReactNode; testMode: TestConnectionMode }> = {
  stripe: { label: "Stripe", icon: <CreditCardIcon />, testMode: "testable" },
  paypal: { label: "PayPal", icon: <GlobeAltIcon />, testMode: "none" },
  bank_transfer: { label: "Bank transfer", icon: <BuildingLibraryIcon />, testMode: "none" },
  paystack: { label: "Paystack", icon: <BoltIcon />, testMode: "testable" },
  flutterwave: { label: "Flutterwave", icon: <GlobeAltIcon />, testMode: "testable" },
  interswitch: { label: "Interswitch", icon: <ArrowsRightLeftIcon />, testMode: "not-verifiable" },
  gtpay: { label: "GTPay", icon: <CreditCardIcon />, testMode: "not-verifiable" },
  remita: { label: "Remita", icon: <BanknotesIcon />, testMode: "not-verifiable" },
}

// Human-readable field labels + input type + helper text, keyed by provider -> field.
// Sourced from 08-RESEARCH.md's Field Manifest table; the "Optional — leave blank..."
// helper is scoped to Interswitch/GTPay endpoint fields only, per 08-UI-SPEC.md's
// Copywriting Contract ("Redirect-URL / low-priority field helper").
const ENDPOINT_HELPER = "Optional — leave blank to use the default sandbox/production endpoint."

const FIELD_META: Record<string, Record<string, { label: string; inputType?: "text" | "url"; helperText?: string }>> = {
  stripe: {
    secret_key: { label: "Secret key" },
    webhook_secret: { label: "Webhook signing secret" },
    publishable_key: { label: "Publishable key" },
  },
  paypal: {
    client_id: { label: "Client ID" },
    client_secret: { label: "Client secret" },
    mode: { label: "Mode" },
  },
  bank_transfer: {
    bank_name: { label: "Bank name" },
    account_number: { label: "Account number" },
    account_name: { label: "Account name" },
  },
  paystack: {
    secret_key: { label: "Secret key" },
    public_key: { label: "Public key" },
  },
  flutterwave: {
    secret_key: { label: "Secret key" },
    public_key: { label: "Public key" },
    webhook_hash: { label: "Webhook hash" },
  },
  interswitch: {
    merchant_code: { label: "Merchant code" },
    mac_key: { label: "MAC key" },
    product_id: { label: "Product ID" },
    pay_item_id: { label: "Pay item ID" },
    pay_url: { label: "Pay URL", inputType: "url", helperText: ENDPOINT_HELPER },
    requery_url: { label: "Requery URL", inputType: "url", helperText: ENDPOINT_HELPER },
    redirect_url: { label: "Redirect URL", inputType: "url", helperText: ENDPOINT_HELPER },
  },
  gtpay: {
    merchant_id: { label: "Merchant ID" },
    hash_key: { label: "Hash key" },
    pay_url: { label: "Pay URL", inputType: "url", helperText: ENDPOINT_HELPER },
    requery_url: { label: "Requery URL", inputType: "url", helperText: ENDPOINT_HELPER },
    noti_url: { label: "Notification URL", inputType: "url", helperText: ENDPOINT_HELPER },
  },
  remita: {
    merchant_id: { label: "Merchant ID" },
    api_key: { label: "API key" },
    service_type_id: { label: "Service type ID" },
    base_url: { label: "Base URL", inputType: "url" },
  },
}

async function SettingsContent() {
  const settings = await getStoreSettingsMap()

  // Mirrors isPaymentMethodEnabled's fallback: no row yet => env-only default (true).
  const stripeEnabled = settings["stripe"] ?? true
  const paypalEnabled = settings["paypal"] ?? true
  const bankTransferEnabled = settings["bank_transfer"] ?? true

  // Resolver-backed credential presence (Phase 8, D-03) — DB-first, env-fallback, replaces
  // the old local *CredentialsPresent() helpers that only read process.env directly. Only a
  // boolean ever crosses to the client (T-05-23/T-08-25) — secret values never leave the server.
  const stripeCfg = await getGatewayConfig("stripe")
  const paypalCfg = await getGatewayConfig("paypal")
  const bankCfg = await getGatewayConfig("bank_transfer")

  const rawMap = await getGatewayCredentialsMap()

  // Build the FieldPresence[] + status for a single gateway card. Takes the already-resolved
  // cfg (see the 8 explicit getGatewayConfig calls below) so the resolver call itself stays a
  // one-per-provider await, matching the explicit style already used for the 3 toggle rows above.
  function buildGatewayCard(provider: (typeof GATEWAY_ORDER)[number], cfg: Record<string, string>) {
    const manifest = FIELD_MANIFEST[provider] ?? []
    const meta = FIELD_META[provider] ?? {}

    const fields: FieldPresence[] = manifest.map((spec) => {
      const fieldMeta = meta[spec.field] ?? { label: spec.field }
      const raw = rawMap[provider]?.[spec.field]
      const isConfigured = !!cfg[spec.field]

      if (spec.isSecret) {
        return {
          field: spec.field,
          label: fieldMeta.label,
          isSecret: true,
          isConfigured,
          updatedAt: raw?.updatedAt ? raw.updatedAt.toISOString() : undefined,
          updatedBy: raw?.updatedBy ?? undefined,
          inputType: fieldMeta.inputType,
          helperText: fieldMeta.helperText,
        }
      }

      return {
        field: spec.field,
        label: fieldMeta.label,
        isSecret: false,
        isConfigured,
        publicValue: cfg[spec.field],
        inputType: fieldMeta.inputType,
        helperText: fieldMeta.helperText,
      }
    })

    const configuredCount = manifest.filter((spec) => !!cfg[spec.field]).length
    const status: "not-configured" | "incomplete" | "configured" =
      configuredCount === 0 ? "not-configured" : configuredCount === manifest.length ? "configured" : "incomplete"

    return { provider, fields, status }
  }

  // One resolver call per gateway (8 total, plus the 3 above already reused for the toggle
  // rows) — explicit rather than looped, matching this file's existing per-provider style.
  const paystackCfg = await getGatewayConfig("paystack")
  const flutterwaveCfg = await getGatewayConfig("flutterwave")
  const interswitchCfg = await getGatewayConfig("interswitch")
  const gtpayCfg = await getGatewayConfig("gtpay")
  const remitaCfg = await getGatewayConfig("remita")

  const gatewayCards = [
    buildGatewayCard("stripe", stripeCfg),
    buildGatewayCard("paypal", paypalCfg),
    buildGatewayCard("bank_transfer", bankCfg),
    buildGatewayCard("paystack", paystackCfg),
    buildGatewayCard("flutterwave", flutterwaveCfg),
    buildGatewayCard("interswitch", interswitchCfg),
    buildGatewayCard("gtpay", gtpayCfg),
    buildGatewayCard("remita", remitaCfg),
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <div className="rounded-2xl bg-surface border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-2">Payment methods</h2>
        <div>
          <PaymentToggleRow
            method="stripe"
            label="Stripe"
            description="Debit / credit cards via Stripe"
            icon={<CreditCardIcon />}
            enabled={stripeEnabled}
            credentialsPresent={!!stripeCfg.secret_key}
            envVarName="STRIPE_SECRET_KEY"
          />
          <PaymentToggleRow
            method="paypal"
            label="PayPal"
            description="PayPal wallet checkout"
            icon={<GlobeAltIcon />}
            enabled={paypalEnabled}
            credentialsPresent={!!paypalCfg.client_id && !!paypalCfg.client_secret}
            envVarName="PAYPAL_CLIENT_SECRET"
          />
          <PaymentToggleRow
            method="bank_transfer"
            label="Bank transfer"
            description="Transfer to our NGN account — confirmed manually"
            icon={<BuildingLibraryIcon />}
            enabled={bankTransferEnabled}
            credentialsPresent={!!bankCfg.bank_name && !!bankCfg.account_number && !!bankCfg.account_name}
            envVarName="BANK_ACCOUNT_NUMBER"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Gateway credentials</h2>
        <p className="text-sm text-muted flex items-center gap-1.5 mb-2">
          <LockClosedIcon />
          Credential values are encrypted and never sent back to your browser once saved.
          You&apos;ll only ever see whether a field is configured, when it was last updated, and
          any public keys or URLs you&apos;ve entered.
        </p>
        <div>
          {gatewayCards.map(({ provider, fields, status }) => {
            const meta = GATEWAY_META[provider]
            return (
              <GatewayCredentialCard
                key={provider}
                provider={provider}
                label={meta.label}
                icon={meta.icon}
                status={status}
                fields={fields}
                testConnectionMode={meta.testMode}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="rounded-2xl bg-surface border border-border p-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="rounded-2xl bg-surface border border-border p-6 space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  )
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  )
}
