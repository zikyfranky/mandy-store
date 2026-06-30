"use client"
// src/components/checkout/PaymentMethodSelector.tsx
// Payment method radio card group — renders only server-enabled methods.
// UI-SPEC §4a / Accessibility Contracts / D-05a (PayPal NEVER rendered)
// PAY-04 / D-13: methods come from server; PayPal is filtered before reaching here,
// and also skipped here if somehow passed in (D-05a defence in depth).

import type { PaymentMethod } from "@/lib/payments/config"

interface PaymentMethodSelectorProps {
  enabledMethods: PaymentMethod[]
  selected: PaymentMethod
  onChange: (method: PaymentMethod) => void
}

interface MethodConfig {
  id: PaymentMethod
  label: string
  description: string
  icon: React.ReactNode
}

// Heroicons CreditCardIcon 20px
const CreditCardIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-5 h-5 text-brand"
    aria-hidden="true"
  >
    <path d="M4.5 3.75a3 3 0 0 0-3 3v.75h21v-.75a3 3 0 0 0-3-3h-15Z" />
    <path
      fillRule="evenodd"
      d="M22.5 9.75h-21v7.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-7.5Zm-18 3.75a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z"
      clipRule="evenodd"
    />
  </svg>
)

// Heroicons BuildingLibraryIcon 20px
const BuildingLibraryIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-5 h-5 text-brand"
    aria-hidden="true"
  >
    <path d="M11.584 2.376a.75.75 0 0 1 .832 0l9 6a.75.75 0 1 1-.832 1.248L12 3.901 3.416 9.624a.75.75 0 0 1-.832-1.248l9-6Z" />
    <path
      fillRule="evenodd"
      d="M20.25 10.332v9.918H21a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1 0-1.5h.75v-9.918a.75.75 0 0 1 .634-.74A49.109 49.109 0 0 1 12 9c2.59 0 5.134.202 7.616.592a.75.75 0 0 1 .634.74Zm-7.5 2.418a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Zm3-.75a.75.75 0 0 1 .75.75v6.75a.75.75 0 0 1-1.5 0v-6.75a.75.75 0 0 1 .75-.75ZM9 12.75a.75.75 0 0 0-1.5 0v6.75a.75.75 0 0 0 1.5 0v-6.75Z"
      clipRule="evenodd"
    />
    <path d="M12 7.875a1.125 1.125 0 1 0 0-2.25 1.125 1.125 0 0 0 0 2.25Z" />
  </svg>
)

const METHOD_CONFIGS: Record<"stripe" | "bank_transfer", Omit<MethodConfig, "id">> = {
  stripe: {
    label: "Debit / Credit card",
    description: "Visa, Mastercard, and more — secured by Stripe",
    icon: CreditCardIcon,
  },
  bank_transfer: {
    label: "Bank transfer (NGN)",
    description: "Transfer to our NGN account. We confirm manually.",
    icon: BuildingLibraryIcon,
  },
}

export function PaymentMethodSelector({
  enabledMethods,
  selected,
  onChange,
}: PaymentMethodSelectorProps) {
  // D-05a / D-13: PayPal is NEVER rendered — skip if somehow in the list
  const renderableMethods = enabledMethods.filter(
    (m): m is "stripe" | "bank_transfer" => m !== "paypal"
  )

  return (
    <div
      role="radiogroup"
      aria-label="Payment method"
      className="space-y-3"
    >
      {renderableMethods.map((method) => {
        const config = METHOD_CONFIGS[method]
        const isSelected = selected === method

        return (
          <label
            key={method}
            role="radio"
            aria-checked={isSelected}
            className={[
              "w-full flex items-center gap-3 rounded-xl border p-4",
              "cursor-pointer transition-colors",
              isSelected
                ? "border-brand ring-2 ring-brand bg-brand-soft"
                : "border-border bg-surface hover:border-brand/50",
            ].join(" ")}
          >
            {/* Visually hidden radio input (sr-only) */}
            <input
              type="radio"
              name="paymentMethod"
              value={method}
              checked={isSelected}
              onChange={() => onChange(method)}
              className="sr-only"
            />

            {/* Icon */}
            <div className="w-10 h-10 rounded-lg bg-brand-soft flex items-center justify-center shrink-0">
              {config.icon}
            </div>

            {/* Label + description */}
            <div>
              <p className="text-sm font-semibold text-foreground">{config.label}</p>
              <p className="text-sm text-muted">{config.description}</p>
            </div>
          </label>
        )
      })}
    </div>
  )
}
