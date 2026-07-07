"use client"
// src/components/checkout/GtpayPaymentPanel.tsx
// Thin wrapper over RedirectLauncherPanel. GTPay uses a POST auto-submit WebPay redirect (D-12).

import { RedirectLauncherPanel } from "./RedirectLauncherPanel"
import { initGtpayPayment } from "@/lib/actions/gtpay"
import type { UseFormTrigger, UseFormGetValues } from "react-hook-form"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

export function GtpayPaymentPanel(props: {
  getValues: UseFormGetValues<AnyFormValues>
  trigger: UseFormTrigger<AnyFormValues>
  hasOOS: boolean
}) {
  return <RedirectLauncherPanel initAction={initGtpayPayment} gatewayName="GTPay" {...props} />
}
