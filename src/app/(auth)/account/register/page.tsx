// src/app/(auth)/account/register/page.tsx
// Registration page — renders the RegisterForm client island.
// D-06 (Phase 6): reads an optional ?orderToken=<token> (async searchParams, Next 16) and
// threads it to RegisterForm as a hidden field so register() can claim a just-placed guest order.

import RegisterForm from "@/components/auth/RegisterForm"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ orderToken?: string }>
}) {
  const { orderToken } = await searchParams
  return <RegisterForm orderToken={orderToken} />
}
