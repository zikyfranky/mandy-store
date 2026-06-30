"use client"
// src/components/checkout/BankTransferPanel.tsx
// Informational panel shown when "Bank transfer (NGN)" is selected.
// UI-SPEC §4c / Copywriting Contract / D-10 (no account numbers here — server-only)
// The actual submit button lives in CheckoutForm (bank transfer path).
// This panel is purely informational — no secrets, no account numbers.

export function BankTransferPanel() {
  return (
    <div className="mt-4 rounded-xl border border-border p-4 bg-brand-soft space-y-3">
      <p className="text-sm font-semibold text-foreground">How bank transfer works</p>

      <div className="space-y-2">
        <p className="text-sm text-muted">
          1. Place your order — we&apos;ll generate a unique order reference.
        </p>
        <p className="text-sm text-muted">
          2. Transfer the exact total to the account below using your reference as narration.
        </p>
        <p className="text-sm text-muted">
          3. We confirm receipt and begin processing your order (typically 1–2 business days).
        </p>
      </div>

      <p className="text-sm font-semibold text-foreground border-t border-border/50 pt-3">
        Account details and your reference will appear on the next screen and in your email.
      </p>
    </div>
  )
}
