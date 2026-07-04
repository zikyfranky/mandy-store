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

// Heroicons BoltIcon 20px — Paystack
const BoltIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-5 h-5 text-brand"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.818a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .845-.143Z"
      clipRule="evenodd"
    />
  </svg>
)

// Heroicons GlobeAltIcon 20px — Flutterwave
const GlobeAltIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-5 h-5 text-brand"
    aria-hidden="true"
  >
    <path d="M21.721 12.752a9.711 9.711 0 0 0-.945-5.003 12.754 12.754 0 0 1-4.339 2.708 18.991 18.991 0 0 1-.214 4.772 17.165 17.165 0 0 0 5.498-2.477ZM14.634 15.55a17.324 17.324 0 0 0 .332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 0 0 .332 4.647 17.385 17.385 0 0 0 5.268 0ZM9.772 17.119a18.963 18.963 0 0 0 4.456 0A17.182 17.182 0 0 1 12 21.724a17.18 17.18 0 0 1-2.228-4.605ZM7.777 15.23a18.87 18.87 0 0 1-.214-4.774 12.753 12.753 0 0 1-4.34-2.708 9.711 9.711 0 0 0-.944 5.004 17.165 17.165 0 0 0 5.498 2.477ZM21.356 14.752a9.765 9.765 0 0 1-7.478 6.817 18.64 18.64 0 0 0 1.988-4.718 18.627 18.627 0 0 0 5.49-2.098ZM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 0 0 1.988 4.718 9.765 9.765 0 0 1-7.478-6.816ZM13.878 2.43a9.755 9.755 0 0 1 6.116 3.986 11.267 11.267 0 0 1-3.746 2.504 18.63 18.63 0 0 0-2.37-6.49ZM12 2.276a17.152 17.152 0 0 1 2.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0 1 12 2.276ZM10.122 2.43a18.629 18.629 0 0 0-2.37 6.49 11.266 11.266 0 0 1-3.746-2.504 9.754 9.754 0 0 1 6.116-3.985Z" />
  </svg>
)

const METHOD_CONFIGS: Record<"stripe" | "bank_transfer" | "paystack" | "flutterwave", Omit<MethodConfig, "id">> = {
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
  paystack: {
    label: "Paystack",
    description: "Cards, bank & USSD — secured by Paystack",
    icon: BoltIcon,
  },
  flutterwave: {
    label: "Flutterwave",
    description: "Cards, bank & USSD — secured by Flutterwave",
    icon: GlobeAltIcon,
  },
}

export function PaymentMethodSelector({
  enabledMethods,
  selected,
  onChange,
}: PaymentMethodSelectorProps) {
  // D-05a / D-13: PayPal is NEVER rendered — skip if somehow in the list
  // D-05: paystack + flutterwave are peer radio options alongside stripe + bank_transfer
  const renderableMethods = enabledMethods.filter(
    (m): m is "stripe" | "bank_transfer" | "paystack" | "flutterwave" => m !== "paypal"
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
