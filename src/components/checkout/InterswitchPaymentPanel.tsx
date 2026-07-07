"use client"
// src/components/checkout/InterswitchPaymentPanel.tsx
// Thin wrapper over the shared RedirectLauncherPanel (UI-SPEC §Component Inventory).
// Interswitch uses a POST auto-submit WebPay redirect.

import { RedirectLauncherPanel } from "./RedirectLauncherPanel"
import { initInterswitchPayment } from "@/lib/actions/interswitch"
import type { UseFormTrigger, UseFormGetValues } from "react-hook-form"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

export function InterswitchPaymentPanel(props: {
  getValues: UseFormGetValues<AnyFormValues>
  trigger: UseFormTrigger<AnyFormValues>
  hasOOS: boolean
}) {
  return <RedirectLauncherPanel initAction={initInterswitchPayment} gatewayName="Interswitch" {...props} />
}
