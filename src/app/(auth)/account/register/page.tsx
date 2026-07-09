// src/app/(auth)/account/register/page.tsx
// Registration page — renders the RegisterForm client island.
// D-06 (Phase 6): reads an optional ?orderToken=<token> (async searchParams, Next 16) and
// threads it to RegisterForm as a hidden field so register() can claim a just-placed guest order.
// searchParams is a dynamic API — read it inside Suspense so this route can still be
// partially prerendered (Pitfall 2 PPR regression, caught by the Task 3 production build).

import { Suspense } from "react"
import RegisterForm from "@/components/auth/RegisterForm"

async function RegisterContent({
  searchParams,
}: {
  searchParams: Promise<{ orderToken?: string }>
}) {
  const { orderToken } = await searchParams
  return <RegisterForm orderToken={orderToken} />
}

export default function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ orderToken?: string }>
}) {
  return (
    <Suspense fallback={<div className="animate-pulse h-96" aria-hidden="true" />}>
      <RegisterContent searchParams={searchParams} />
    </Suspense>
  )
}
