// vendor.d.ts — module declarations for packages without TypeScript types
// @paystack/inline-js has no published @types; we declare the module as `any`
// and rely on the dynamic import + explicit any cast in PaystackPaymentPanel.tsx.
declare module "@paystack/inline-js"
