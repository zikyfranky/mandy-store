// src/app/admin/settings/page.tsx
// Admin Settings — payment-method toggles (ADMN-04) — UI-SPEC Surface 6.
// D-11 scope: exactly Stripe/PayPal/Bank transfer get a live DB toggle here; the 5 NG
// gateways (Paystack/Flutterwave/Interswitch/GTPay/Remita) stay env-only, unchanged,
// and are intentionally NOT shown on this page (U-12).
//
// Credential presence (dual-gate note) is computed server-side by mirroring
// src/lib/payments/config.ts's hasEnvAndCredentials() switch for these three methods —
// that function is not exported (server-only internal helper), so this page reads the
// same env vars directly rather than reaching into config.ts's private logic. Only a
// boolean ever crosses to the client (T-05-23) — secret values never leave the server.

import { Suspense } from "react"
import { getStoreSettingsMap } from "@/lib/payments/store-settings"
import { PaymentToggleRow } from "@/components/admin/PaymentToggleRow"

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

// ─── Server-side credential presence — mirrors config.ts's hasEnvAndCredentials() for ──
// exactly the three DB-backed methods shown here. Boolean only — never the secret value.

function stripeCredentialsPresent(): boolean {
  return process.env.ENABLE_STRIPE === "true" && !!process.env.STRIPE_SECRET_KEY
}

function paypalCredentialsPresent(): boolean {
  return (
    process.env.ENABLE_PAYPAL === "true" &&
    !!process.env.PAYPAL_CLIENT_ID &&
    !!process.env.PAYPAL_CLIENT_SECRET
  )
}

function bankTransferCredentialsPresent(): boolean {
  return (
    process.env.ENABLE_BANK_TRANSFER === "true" &&
    !!process.env.BANK_NAME &&
    !!process.env.BANK_ACCOUNT_NUMBER &&
    !!process.env.BANK_ACCOUNT_NAME
  )
}

async function SettingsContent() {
  const settings = await getStoreSettingsMap()

  // Mirrors isPaymentMethodEnabled's fallback: no row yet => env-only default (true).
  const stripeEnabled = settings["stripe"] ?? true
  const paypalEnabled = settings["paypal"] ?? true
  const bankTransferEnabled = settings["bank_transfer"] ?? true

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
            credentialsPresent={stripeCredentialsPresent()}
            envVarName="STRIPE_SECRET_KEY"
          />
          <PaymentToggleRow
            method="paypal"
            label="PayPal"
            description="PayPal wallet checkout"
            icon={<GlobeAltIcon />}
            enabled={paypalEnabled}
            credentialsPresent={paypalCredentialsPresent()}
            envVarName="PAYPAL_CLIENT_SECRET"
          />
          <PaymentToggleRow
            method="bank_transfer"
            label="Bank transfer"
            description="Transfer to our NGN account — confirmed manually"
            icon={<BuildingLibraryIcon />}
            enabled={bankTransferEnabled}
            credentialsPresent={bankTransferCredentialsPresent()}
            envVarName="BANK_ACCOUNT_NUMBER"
          />
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
