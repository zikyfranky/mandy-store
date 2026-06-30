// src/components/order/BankTransferView.tsx
// Awaiting bank transfer state — shown when status === "awaiting_bank_transfer" (§7b).
// Bank details (bankName, bankAccountNumber, bankAccountName) are passed as props
// from the Server Component page — NEVER read from env here (D-10, T-04-29).
// CopyButton is a client island embedded here for the reference copy action.

import { formatNGN } from "@/lib/catalog/format"
import { CopyButton } from "@/components/ui/CopyButton"

interface Order {
  reference: string
  customerEmail: string
  totalKobo: number
}

interface BankTransferViewProps {
  order: Order
  bankName: string
  bankAccountNumber: string
  bankAccountName: string
}

export function BankTransferView({
  order,
  bankName,
  bankAccountNumber,
  bankAccountName,
}: BankTransferViewProps) {
  return (
    <div className="space-y-6">
      {/* Icon */}
      <div className="flex justify-center">
        {/* Heroicons BuildingLibraryIcon 48px */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-12 h-12 text-brand"
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
      </div>

      {/* Heading */}
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-foreground mt-4">
          Complete your transfer
        </h1>

        {/* Status pill */}
        <div className="flex justify-center mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
            Awaiting bank transfer
          </span>
        </div>

        {/* Body */}
        <p className="text-base text-muted mt-4">
          Transfer the exact amount below to the account details shown. Use your order
          reference as the narration so we can match your payment. Instructions have been
          sent to <span className="font-semibold">{order.customerEmail}</span>.
        </p>

        {/* Order reference */}
        <p className="text-sm text-muted mt-3">
          Order reference:{" "}
          <span className="inline-flex items-center rounded-full bg-brand-soft px-4 py-1 text-sm font-semibold text-brand font-mono">
            {order.reference}
          </span>
        </p>
      </div>

      {/* Bank details card */}
      <div className="rounded-xl border border-border bg-brand-soft p-6 space-y-3 text-sm">
        <h2 className="text-sm font-semibold text-foreground">Bank account details</h2>

        <div className="flex justify-between items-baseline">
          <span className="text-muted font-semibold">Bank name</span>
          <span className="text-foreground font-semibold">{bankName}</span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="text-muted font-semibold">Account number</span>
          <span className="text-foreground font-semibold font-mono text-base tracking-wider">
            {bankAccountNumber}
          </span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="text-muted font-semibold">Account name</span>
          <span className="text-foreground font-semibold">{bankAccountName}</span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="text-muted font-semibold">Transfer amount</span>
          <span className="text-2xl font-semibold text-foreground">
            {formatNGN(order.totalKobo)}
          </span>
        </div>

        {/* Reference row with copy button */}
        <div className="mt-4 rounded-xl bg-surface border border-brand/30 p-4">
          <p className="text-sm text-muted">Narration / reference</p>
          <p className="text-base font-semibold text-brand font-mono">{order.reference}</p>
          <div className="mt-1">
            <CopyButton value={order.reference} label="Copy reference" copiedLabel="Copied!" />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted text-center">
        Once we confirm your transfer, we&apos;ll update your order status and send you an
        email.
      </p>

      <hr className="border-t border-border" />
    </div>
  )
}
