---
status: awaiting_human_verify
trigger: "Check the whole auth flow, and make sure it all works.. also when logged in, profile icon should go to profile page(build one if it doesn't exists)... on the live, /admin doesn't work, I guess redirect issues, I'm on a VPS with cloudpanel running"
created: 2026-07-29
updated: 2026-07-29
---

## Symptoms

- Expected: Visiting /admin while authenticated as an admin on the live site (https://yesbuy.store) should load the admin panel.
- Actual: /admin redirects to `https://yesbuy.store/account/login?callbackUrl=%2Fadmin` — i.e. the auth check treats the request as unauthenticated.
- Environment: Live deploy only, hosted on a VPS running CloudPanel (likely Nginx reverse proxy in front of the Next.js app).
- Local (`npm run dev` / local build): /admin works correctly.
- Timeline: Never worked on this live VPS — first deployment there, not a regression from a prior working state.
- Secondary issue: Header profile icon is currently a static link to `/account/login` regardless of auth state. When logged in it should link to a profile page instead — profile page does not appear to exist yet and needs to be built.
- Scope requested: full audit of the auth flow (login, session, admin gating, proxy.ts) in addition to the two concrete issues above.

## Current Focus

reasoning_checkpoint:
  hypothesis: "authConfig in src/lib/auth.ts never sets `trustHost`, and no AUTH_URL/AUTH_TRUST_HOST/VERCEL/CF_PAGES env var is defined anywhere in the repo. @auth/core's setEnvDefaults defaults `config.trustHost` to `!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== 'production')`. Locally NODE_ENV !== 'production' so trustHost defaults true (works). On the live VPS the app runs `next start` with NODE_ENV=production and none of the other env vars are set, so trustHost defaults to FALSE. assertConfig() (@auth/core/lib/utils/assert.js:56-58) then returns an UntrustedHost error for every single Auth.js request. In Auth() (@auth/core/index.js:72-89), for any internalRequest.action NOT in {signin,signout,error,verify-request} (which includes 'session' and 'callback') this short-circuits to `Response.json({message:...}, {status:500})` BEFORE authorize()/session logic ever runs. next-auth's handleAuth()/getSession() (node_modules/next-auth/lib/index.js) parses that 500 JSON body as `auth`, which has no `.user` property, so proxy.ts's `session?.user` is always undefined → every request to /admin (and /account/orders, /account/settings) is treated as unauthenticated and redirected to /account/login?callbackUrl=... regardless of actual login state. This also means the actual sign-in POST (action='callback') would itself 500 in production, i.e. credentials login is likely fully broken on the live VPS, not just the /admin gate."
  confirming_evidence:
    - "grep across src/ found zero references to trustHost, AUTH_URL, NEXTAUTH_URL, or AUTH_TRUST_HOST — authConfig never sets trustHost, and .env.local.example (the documented full var list) has no AUTH_TRUST_HOST/AUTH_URL entry."
    - "Read node_modules/@auth/core/lib/utils/env.js:40-44 directly — confirmed the exact trustHost default formula, which depends on NODE_ENV==='production' with none of the escape-hatch env vars present."
    - "Read node_modules/@auth/core/lib/utils/assert.js:56-58 — confirmed assertConfig returns UntrustedHost immediately when trustHost is falsy, before any other config validation."
    - "Read node_modules/@auth/core/index.js:66-107 — confirmed non-html actions (session, callback) short-circuit to a 500 JSON response when assertConfig returns an error, never reaching AuthInternal/session logic."
    - "Read node_modules/next-auth/lib/index.js handleAuth()/getSession() — confirmed the proxy auth() wrapper parses that response body as `auth` unconditionally, so req.auth becomes a non-user object → session?.user is undefined in proxy.ts."
    - "Symptom pattern matches exactly: works locally (dev NODE_ENV), never worked on live VPS (production NODE_ENV, self-hosted, no Vercel/CF env vars to auto-set trustHost)."
  falsification_test: "If the user reports that sign-in itself (POST /api/auth/callback/credentials) succeeds and sets a session cookie on the live VPS (i.e. only /admin gating is broken, not login), this hypothesis is wrong — since a 500 on the 'callback' action would necessarily also break login, not just page gating. Also falsified if the VPS process is confirmed to be running with NODE_ENV!=='production' or with AUTH_TRUST_HOST/AUTH_URL/VERCEL/CF_PAGES already set in its actual runtime env (not visible from this repo — flagged as a blind spot)."
  fix_rationale: "Set `trustHost: true` explicitly in authConfig (src/lib/auth.ts) rather than relying on env-var defaults. This is the Auth.js-documented pattern for self-hosted deployments behind your own reverse proxy (https://authjs.dev/reference/core#trusthost) and removes the NODE_ENV-dependent footgun entirely — it fixes the root cause (trustHost false in production) rather than a symptom (redirect-to-login), and doesn't require the user to remember to set an env var on the VPS that isn't documented anywhere in .env.local.example."
  blind_spots: "Cannot access the actual VPS to confirm NODE_ENV/env vars at runtime or inspect CloudPanel's generated Nginx vhost config directly (no SSH/log access in this environment). Assuming CloudPanel's default Node.js site template forwards Host and X-Forwarded-Proto (its standard template does) — if it does NOT forward X-Forwarded-Proto correctly, cookies could still have wrong secure-flag interactions, so this must be flagged to the user as a secondary thing to verify post-fix."

next_action: All three items (root cause fix, auth-flow audit, profile-icon wiring) implemented and self-verified (build + lint + auth unit tests green). Awaiting human verification of the trustHost fix on the actual live VPS (cannot be verified from this sandboxed environment).

## Evidence

- timestamp: 2026-07-29
  checked: src/proxy.ts and src/lib/auth.ts (full read)
  found: proxy.ts redirects to /account/login whenever `!session?.user` for /admin and /account/* routes; authConfig never sets `trustHost`, `AUTH_URL`, or references `useSecureCookies`/custom `cookies` config. No AUTH_TRUST_HOST/AUTH_URL var exists in .env.local.example or .env.local.
  implication: trustHost is left to @auth/core's env-derived default, which differs between dev and production.

- timestamp: 2026-07-29
  checked: node_modules/@auth/core/lib/utils/env.js (setEnvDefaults), node_modules/@auth/core/lib/utils/assert.js (assertConfig), node_modules/@auth/core/index.js (Auth()), node_modules/next-auth/lib/index.js (initAuth/getSession/handleAuth)
  found: trustHost defaults to `!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== "production")`. When falsy, assertConfig() returns UntrustedHost, and Auth() returns a bare 500 JSON response for any action outside {signin,signout,error,verify-request} — which includes "session" (used by every proxy request) and "callback" (used by credentials sign-in POST). handleAuth() in next-auth then assigns that 500 body as `req.auth`, which has no `.user`, so proxy.ts's unauthenticated branch fires unconditionally.
  implication: On the live VPS (NODE_ENV=production via `next start`, no Vercel/CF/AUTH_URL/AUTH_TRUST_HOST vars), every Auth.js request — not just /admin gating but sign-in itself — is expected to fail server-config-style. Root cause confirmed via direct library source tracing, not inference.

- timestamp: 2026-07-29
  checked: applied `trustHost: true` to authConfig in src/lib/auth.ts; ran `npx vitest run tests/auth/session.test.ts -t "session-strategy contract"` (pure unit, no DB), `npx tsc --noEmit -p .`, `npx next build --webpack`, `npm run lint`
  found: unit tests pass (4/4); tsc reports one PRE-EXISTING unrelated error in tests/cart/cart-db.test.ts:642 (confirmed unrelated — NextMiddleware typing issue, not touched by this change); production build succeeds, all routes retain their prior rendering mode (◐ Partial Prerender unchanged) — trustHost addition does not force new dynamic routes; lint reports one PRE-EXISTING unrelated error in CheckoutForm.tsx (setState-in-effect) and pre-existing warnings elsewhere, none in the files this session touched (src/lib/auth.ts, src/components/layout/SiteHeader.tsx).
  implication: Fix is minimal, targeted, and does not regress build/lint/tests. Cannot verify against the real live VPS from this sandbox (no SSH/deploy access) — flagged for human verification.

- timestamp: 2026-07-29
  checked: Item 2 (full auth-flow audit) — src/lib/dal.ts (verifySession/verifyAdminSession), src/app/admin/layout.tsx, all files in src/lib/actions/ (admin-taxonomy.ts, admin-products.ts, admin-customers.ts, admin-orders.ts, admin-settings.ts, gateway-credentials.ts, checkout.ts, cart.ts, paystack.ts, flutterwave.ts, interswitch.ts, gtpay.ts, remita.ts, auth.ts), src/app/account/page.tsx, src/app/account/orders/page.tsx, src/app/account/orders/[id]/page.tsx, src/app/api/order/status/[token]/route.ts
  found: Every admin Server Action calls `verifyAdminSession()` as the literal first statement (D-02/D-10 pattern, consistently applied — zero exceptions found). Every checkout/payment-init action derives userId exclusively from `auth()` session, never from client input (buildOrderContext in checkout.ts is the single shared source, reused by all 5 gateway action files). Cart actions are IDOR-safe (userId from session, quantities/prices always server-recomputed). Customer-facing order pages (/account, /account/orders, /account/orders/[id]) all call `verifySession()`/ownership-scoped queries as layer-2 defense, consistent with proxy.ts being layer-1 UX-only (per CLAUDE.md). Admin role mutation (updateCustomerRole) has a self-lockout guard and an atomic last-admin-count guard (no TOCTOU). No inconsistencies or missing re-verification found anywhere in the audited surface — the ONLY defect in the whole auth flow was the missing trustHost (which incidentally would break not just /admin gating but login itself on the VPS, since it 500s the 'callback' Auth.js action too).
  implication: No further auth-flow fixes needed beyond the trustHost change. Audit is complete and clean.

- timestamp: 2026-07-29
  checked: Item 3 (profile icon) — src/components/layout/SiteHeader.tsx (hardcoded /account/login link), src/app/account/page.tsx (existing minimal profile page: signed-in email, "View order history" link, sign-out form, already verifySession()-gated), src/app/layout.tsx (root layout's Suspense/PPR structure around SiteHeader)
  found: A minimal profile page already exists at /account (src/app/account/page.tsx) — no need to build one from scratch, matching the "build one if it doesn't exist" instruction's fallback-only intent. SiteHeader is deliberately dynamic-API-free today (comment: "stays in the static PPR shell") because it's rendered directly inside the root layout's Suspense `fallback` (next.config.ts has `cacheComponents: true`). Calling `auth()` (a cookie-reading dynamic API) directly in SiteHeader would break that static-shell invariant.
  implication: Fix = extract an `AccountIcon` async subcomponent that calls auth() and picks /account vs /account/login, wrapped in its own inner `<Suspense>` inside SiteHeader (fallback renders the same icon, non-interactive, while resolving) — isolates the dynamic read without forcing the rest of the header (nav categories, search, cart icon) to become dynamic. Verified via `next build --webpack`: all routes retain "◐ Partial Prerender" (unchanged from before the edit) — confirms the static shell was preserved.

## Eliminated

(none — first hypothesis, confirmed via direct library source tracing on first pass)

## Resolution

root_cause: |
  authConfig (src/lib/auth.ts) never set `trustHost`. @auth/core defaults trustHost to
  `!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== "production")`.
  Locally this is true by accident (dev NODE_ENV). On the live VPS (self-hosted behind
  CloudPanel/Nginx, `next start` with NODE_ENV=production, none of the escape-hatch env
  vars set), it defaults to false, which makes assertConfig() reject every single Auth.js
  request (including session reads used by every proxy.ts check, AND the credentials
  sign-in POST itself) with a 500 config error — surfacing as "always unauthenticated",
  hence /admin (and every /account/* route) unconditionally redirecting to
  /account/login?callbackUrl=... regardless of actual login state.
fix: |
  1. (Primary bug) Added `trustHost: true` to authConfig in src/lib/auth.ts — the
     Auth.js-documented pattern for self-hosted deployments behind your own reverse
     proxy. Removes the NODE_ENV-dependent footgun entirely.
  2. (Audit) Reviewed entire auth flow (dal.ts, admin layout, all Server Actions,
     account pages) — found no other defects. Every admin/mutation action already
     correctly re-verifies via verifyAdminSession()/verifySession() as first statement;
     userId/role always sourced from session, never client input.
  3. (Profile icon) Wired SiteHeader's account icon to /account (existing profile page)
     when signed in, /account/login otherwise. Isolated the auth() call in a new
     `AccountIcon` subcomponent with its own inner <Suspense> boundary to preserve
     SiteHeader's static-PPR-shell requirement (cacheComponents: true).
verification: |
  Self-verified: `npx next build --webpack` succeeds, all routes retain prior rendering
  mode (◐ Partial Prerender unchanged); `npx tsc --noEmit` and `npm run lint` show only
  pre-existing unrelated issues; auth unit tests (session-strategy contract, 4/4) pass.
  NOT YET verified against the actual live VPS (no SSH/deploy access from this
  environment) — requires human confirmation post-deploy. See CHECKPOINT below for the
  exact verification steps.
files_changed:
  - src/lib/auth.ts
  - src/components/layout/SiteHeader.tsx
