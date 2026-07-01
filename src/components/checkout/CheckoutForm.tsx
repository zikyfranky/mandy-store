"use client"
// src/components/checkout/CheckoutForm.tsx
// Main checkout form client island — contact + NG address + payment method + panels.
// UI-SPEC §2 / §3 / §4 / Interaction Contracts
// Manages form state via react-hook-form + Zod; bank transfer submit path wired here;
// Stripe path delegated to StripePaymentPanel. Failed payment stays on page (D-08).

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createBankTransferOrder } from "@/lib/actions/checkout"
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector"
import { StripePaymentPanel } from "@/components/checkout/StripePaymentPanel"
import { BankTransferPanel } from "@/components/checkout/BankTransferPanel"
import type { PaymentMethod } from "@/lib/payments/config"
import type { UseFormGetValues, UseFormTrigger } from "react-hook-form"

// ─── Zod schema (client-side mirror of server AddressSchema + email) ──────────

const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe",
  "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const

const CheckoutFormSchema = z.object({
  email: z.string().email("A valid email is required"),
  address: z.object({
    fullName: z.string().min(1, "Full name is required"),
    phone: z.string().min(7, "A valid phone number is required"),
    street: z.string().min(1, "Street address is required"),
    city: z.string().min(1, "City is required"),
    state: z.enum(NG_STATES, { message: "Select a valid Nigerian state" }),
    landmark: z.string().optional(),
  }),
})

type CheckoutFormValues = z.infer<typeof CheckoutFormSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface CheckoutFormProps {
  prefilledEmail: string | null
  isLoggedIn: boolean
  enabledMethods: PaymentMethod[]
  publishableKey: string
  hasOOS: boolean
}

// ─── Field styling helpers ────────────────────────────────────────────────────

const inputClass = (hasError?: boolean) =>
  [
    "w-full rounded-lg border bg-surface px-3 py-2.5",
    "text-sm text-foreground placeholder:text-muted",
    "focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand",
    "transition-colors",
    hasError
      ? "border-stock-out ring-2 ring-stock-out"
      : "border-border",
  ]
    .filter(Boolean)
    .join(" ")

// ─── CheckoutForm ─────────────────────────────────────────────────────────────

export function CheckoutForm({
  prefilledEmail,
  isLoggedIn,
  enabledMethods,
  publishableKey,
  hasOOS,
}: CheckoutFormProps) {
  const router = useRouter()
  const [bankError, setBankError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Default to first server-enabled method. Never fall back to a hardcoded method —
  // that would show a payment panel the server-side gate will reject (UI/server mismatch).
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    enabledMethods[0] ?? null
  )

  const {
    register,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    mode: "onBlur",
    resolver: zodResolver(CheckoutFormSchema),
    defaultValues: {
      email: prefilledEmail ?? "",
      address: {
        fullName: "",
        phone: "",
        street: "",
        city: "",
        state: undefined,
        landmark: "",
      },
    },
  })

  // ── Bank transfer submit path ──
  async function handleBankTransferSubmit() {
    setBankError(null)
    const isValid = await trigger()
    if (!isValid) return

    const values = getValues()
    startTransition(async () => {
      const result = await createBankTransferOrder({
        email: values.email,
        address: {
          fullName: values.address.fullName,
          phone: values.address.phone,
          street: values.address.street,
          city: values.address.city,
          state: values.address.state as typeof NG_STATES[number],
          landmark: values.address.landmark || undefined,
        },
      })

      if ("error" in result) {
        setBankError(result.error)
      } else {
        router.push("/order/" + result.guestToken)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* ── §2 Contact Section ── */}
      <section
        aria-labelledby="contact-heading"
        className="rounded-2xl bg-surface border border-border p-6"
      >
        <h2 id="contact-heading" className="text-2xl font-semibold text-foreground mb-4">
          Contact
        </h2>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-semibold text-foreground mb-1"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            readOnly={isLoggedIn}
            disabled={isLoggedIn}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            placeholder="you@example.com"
            className={
              inputClass(!!errors.email) +
              (isLoggedIn ? " opacity-60 cursor-not-allowed" : "")
            }
            {...register("email")}
          />
          {errors.email && (
            <p
              id="email-error"
              role="alert"
              className="text-sm font-semibold text-stock-out mt-1"
            >
              {errors.email.message}
            </p>
          )}

          {/* Helper text */}
          {isLoggedIn ? (
            <p className="text-sm text-muted mt-1">
              {"You're signed in as "}
              <span className="font-semibold">{prefilledEmail}</span>
              {". Not you? "}
              <Link
                href="/account/signout"
                className="text-brand hover:text-brand-strong font-semibold"
              >
                Sign out
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-muted mt-1">
              Order updates and receipt will be sent here.
            </p>
          )}
        </div>
      </section>

      {/* ── §3 Shipping Address Section ── */}
      <section
        aria-labelledby="address-heading"
        className="rounded-2xl bg-surface border border-border p-6"
      >
        <h2 id="address-heading" className="text-2xl font-semibold text-foreground mb-4">
          Shipping address
        </h2>

        <div className="space-y-4">
          {/* Full name */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-semibold text-foreground mb-1"
            >
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              required
              placeholder="Ada Okafor"
              aria-invalid={!!errors.address?.fullName}
              aria-describedby={errors.address?.fullName ? "fullName-error" : undefined}
              className={inputClass(!!errors.address?.fullName)}
              {...register("address.fullName")}
            />
            {errors.address?.fullName && (
              <p
                id="fullName-error"
                role="alert"
                className="text-sm font-semibold text-stock-out mt-1"
              >
                {errors.address.fullName.message}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-semibold text-foreground mb-1"
            >
              Phone number
            </label>
            <p className="text-sm text-muted mb-1">
              Required — couriers call to arrange delivery
            </p>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              required
              placeholder="0801 234 5678"
              aria-invalid={!!errors.address?.phone}
              aria-describedby={errors.address?.phone ? "phone-error" : undefined}
              className={inputClass(!!errors.address?.phone)}
              {...register("address.phone")}
            />
            {errors.address?.phone && (
              <p
                id="phone-error"
                role="alert"
                className="text-sm font-semibold text-stock-out mt-1"
              >
                {errors.address.phone.message}
              </p>
            )}
          </div>

          {/* Street address */}
          <div>
            <label
              htmlFor="street"
              className="block text-sm font-semibold text-foreground mb-1"
            >
              Street address
            </label>
            <input
              id="street"
              type="text"
              autoComplete="address-line1"
              required
              placeholder="12 Adeola Odeku Street"
              aria-invalid={!!errors.address?.street}
              aria-describedby={errors.address?.street ? "street-error" : undefined}
              className={inputClass(!!errors.address?.street)}
              {...register("address.street")}
            />
            {errors.address?.street && (
              <p
                id="street-error"
                role="alert"
                className="text-sm font-semibold text-stock-out mt-1"
              >
                {errors.address.street.message}
              </p>
            )}
          </div>

          {/* City */}
          <div>
            <label
              htmlFor="city"
              className="block text-sm font-semibold text-foreground mb-1"
            >
              City
            </label>
            <input
              id="city"
              type="text"
              autoComplete="address-level2"
              required
              placeholder="Victoria Island"
              aria-invalid={!!errors.address?.city}
              aria-describedby={errors.address?.city ? "city-error" : undefined}
              className={inputClass(!!errors.address?.city)}
              {...register("address.city")}
            />
            {errors.address?.city && (
              <p
                id="city-error"
                role="alert"
                className="text-sm font-semibold text-stock-out mt-1"
              >
                {errors.address.city.message}
              </p>
            )}
          </div>

          {/* State dropdown — 36 states + FCT (D-04) */}
          <div>
            <label
              htmlFor="state"
              className="block text-sm font-semibold text-foreground mb-1"
            >
              State
            </label>
            <select
              id="state"
              aria-invalid={!!errors.address?.state}
              aria-describedby={errors.address?.state ? "state-error" : undefined}
              className={inputClass(!!errors.address?.state)}
              {...register("address.state")}
              defaultValue=""
            >
              <option value="" disabled>
                Select a state
              </option>
              {NG_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            {errors.address?.state && (
              <p
                id="state-error"
                role="alert"
                className="text-sm font-semibold text-stock-out mt-1"
              >
                {errors.address.state.message}
              </p>
            )}
          </div>

          {/* Landmark / delivery notes (optional) */}
          <div>
            <label
              htmlFor="landmark"
              className="block text-sm font-semibold text-foreground mb-1"
            >
              Landmark / delivery notes&nbsp;&nbsp;(optional)
            </label>
            <textarea
              id="landmark"
              rows={2}
              placeholder="E.g. near Shoprite, green gate, call when close"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors resize-none"
              {...register("address.landmark")}
            />
          </div>
        </div>
      </section>

      {/* ── §4 Payment Section ── */}
      <section
        aria-labelledby="payment-heading"
        className="rounded-2xl bg-surface border border-border p-6"
      >
        <h2 id="payment-heading" className="text-2xl font-semibold text-foreground mb-4">
          Payment
        </h2>

        {enabledMethods.length === 0 ? (
          /* No-methods-available state — shown when the store owner has not yet enabled
             any payment method via env vars. Prevents rendering a panel the server will reject. */
          <div
            role="alert"
            className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 text-sm text-amber-800 dark:text-amber-300"
          >
            <p className="font-semibold">Payment unavailable</p>
            <p className="mt-1">
              No payment methods are currently enabled. Please contact the store to complete your order.
            </p>
          </div>
        ) : (
          <>
            {/* Method selector — rendered only when at least one method is enabled */}
            {selectedMethod !== null && (
              <PaymentMethodSelector
                enabledMethods={enabledMethods}
                selected={selectedMethod}
                onChange={setSelectedMethod}
              />
            )}

            {/* Bank transfer error banner (D-08 — stays on page) */}
            {bankError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-4 flex gap-3 items-start"
              >
                {/* Heroicons ExclamationCircleIcon 20px */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5 text-stock-out shrink-0"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-stock-out">Order could not be placed</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{bankError}</p>
                </div>
              </div>
            )}

            {/* Payment panels — only rendered when a method is actually selected/enabled */}
            {selectedMethod === "stripe" ? (
              <StripePaymentPanel
                publishableKey={publishableKey}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                getValues={getValues as UseFormGetValues<any>}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                trigger={trigger as UseFormTrigger<any>}
                hasOOS={hasOOS}
              />
            ) : selectedMethod === "bank_transfer" ? (
              <>
                <BankTransferPanel />

                {/* Place order button for bank transfer */}
                <button
                  type="button"
                  onClick={handleBankTransferSubmit}
                  disabled={isPending || hasOOS}
                  aria-disabled={isPending || hasOOS}
                  aria-label={
                    hasOOS
                      ? "Remove out-of-stock items from your cart before placing an order"
                      : undefined
                  }
                  className="w-full mt-4 rounded-xl bg-brand hover:bg-brand-strong text-white px-6 py-4 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      {/* Heroicons ArrowPathIcon 20px animate-spin */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-5 h-5 animate-spin"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388Zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Processing…
                    </>
                  ) : (
                    <>
                      {/* Heroicons LockClosedIcon 16px */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-4 h-4"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Place order
                    </>
                  )}
                </button>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
