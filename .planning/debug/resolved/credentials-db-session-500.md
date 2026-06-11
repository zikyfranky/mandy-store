---
status: resolved
trigger: "Logging in returns HTTP 500. [auth][error] UnsupportedStrategy: Signing in with credentials only supported if JWT strategy is enabled. GET /api/auth/callback/credentials -> 500"
created: 2026-06-11T09:16:38Z
updated: 2026-06-11T16:00:00Z
resolved_note: "User confirmed fixed in real workflow. Fix on main @048cec7: strategy:'jwt' + jwt.encode/decode overrides minting a real DB session row (D-06 preserved, server-side revocation proven). Tests hardened to assert strategy==='jwt' and exercise the real sign-in path."
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Credentials provider + session.strategy='database' causes @auth/core assertConfig to throw UnsupportedStrategy (assert.js:114-118: rejects database strategy when onlyCredentials) BEFORE authorize runs -> 500. The jwt-callback DB-insert is dead code: under database strategy the credentials callback branch never runs callbacks.jwt with account, and the jwt callback signing path is bypassed."
  confirming_evidence:
    - "assert.js:114-118 installed source: `if (dbStrategy && onlyCredentials) return new UnsupportedStrategy(...)`."
    - "callback/index.js:227-277: credentials branch always builds cookie value via `jwt.encode({...jwt, token, salt})` regardless of DB. No getSessionAndUser write for credentials under database strategy."
    - "session.js:20-63: under strategy 'jwt', session read uses jwt.decode + callbacks.jwt + callbacks.session(token). Under 'database' (63+) it uses adapter.getSessionAndUser(sessionToken)."
  falsification_test: "Start dev server with strategy still 'database' -> still 500 with UnsupportedStrategy. Switch to 'jwt' + encode/decode override -> 500 gone, sessions row created, auth() returns user."
  fix_rationale: "Use strategy:'jwt' (passes assertConfig). Override jwt.encode to mint a DB session row (adapter.createSession) and return the bare sessionToken as the COOKIE VALUE (opaque, not a real JWT). Override jwt.decode to look up that sessionToken via adapter.getSessionAndUser, enforce expiry (revocability=D-06), slide expiry (D-07), and return a token payload with id/role. session callback populates session.user from the token. This keeps DB-backed, server-side-revocable sessions WITH credentials auth — the documented #12848 pattern, adapted to beta.31's verified encode/decode signatures."
  blind_spots: "auth() in Server Components/proxy reads via the session read path (jwt.decode) — must confirm live that proxy + dal.ts get user.id/role. unstable: beta.31 internal callback flow could differ from source read; live verification is the gate."
test: Implement fix in src/lib/auth.ts, run dev server, attempt real credentials login, query live Neon for sessions row, load /admin and /account/orders, logout.
expecting: No UnsupportedStrategy, 500 gone; one sessions row per login; auth() returns session; logout deletes row.
next_action: Rewrite src/lib/auth.ts with strategy jwt + encode/decode overrides + session callback reading token. Then tsc, then live-verify.

## Symptoms

expected: Credentials login (email or username + password) succeeds, creates a database-backed (revocable) session row, auth() returns session with user.id and user.role.
actual: GET /api/auth/callback/credentials returns 500. Logs: "[auth][error] UnsupportedStrategy: Signing in with credentials only supported if JWT strategy is enabled." thrown in @auth/core/lib/utils/assert.js assertConfig.
errors: "UnsupportedStrategy: Signing in with credentials only supported if JWT strategy is enabled."
reproduction: Start dev server, attempt credentials sign-in with any valid verified user (seeded admin codingwithisaac@gmail.com).
started: Since auth.ts was first written (config has always been contradictory). Automated tests never exercised the real signIn/assertConfig path.

## Eliminated

## Evidence

- timestamp: 2026-06-11T09:16:38Z
  checked: src/lib/auth.ts config
  found: session.strategy = "database" AND a Credentials provider are configured together. callbacks.jwt does db.insert(sessions) guarded by account?.provider === "credentials".
  implication: Confirms contradiction. Under database strategy the jwt callback is never invoked, so the D-08 workaround is dead code. assertConfig rejects credentials+database before authorize runs -> 500.

- timestamp: 2026-06-11T09:16:38Z
  checked: tests/auth/login.test.ts and tests/auth/session.test.ts
  found: Both mock @/lib/auth entirely (signIn/auth are vi.fn()). session.test.ts manually db.insert(sessions) then asserts the row exists. Neither test ever calls signIn -> assertConfig.
  implication: False pass. Tests bypass the exact code path (assertConfig under HTTP signIn) that produces the 500.

- timestamp: 2026-06-11T09:16:38Z
  checked: 01-RESEARCH.md Pattern 1 / Assumption A2
  found: Research assumed db.insert(sessions) in the jwt callback works under database strategy. This is wrong: jwt callback does not run under database strategy, and Credentials forbids database strategy outright.
  implication: The research pattern itself was incorrect. Correct pattern = strategy "jwt" + jwt.encode override that creates a DB session and returns the sessionToken as the cookie value; auth() resolves it via the adapter.

## Evidence (cont.)

- timestamp: 2026-06-11T15:00:00Z
  checked: Live dev server (port 3001) credentials login via /api/auth/callback/credentials
  found: After fix, login returns 302 -> / (success). UnsupportedStrategy error GONE from logs. authjs.session-token cookie = bare UUID (opaque DB token, not a JWT), Expires 30 days out.
  implication: Primary 500/UnsupportedStrategy bug fixed. strategy "jwt" + encode override works.

- timestamp: 2026-06-11T15:01:00Z
  checked: Live Neon sessions table + /api/auth/session + /admin + /account/orders
  found: Exactly 1 sessions row per login (userId=admin, expires 30d). /api/auth/session returns {user:{id, role:"admin", email}}. /admin -> 200, /account/orders -> 200. /admin with no cookie -> 307 redirect to login.
  implication: D-06 satisfied (DB-backed session row). auth() reads it back via decode override. Proxy + dal.ts work.

- timestamp: 2026-06-11T15:02:00Z
  checked: Server-side revocation + logout + row-leak
  found: Deleting the DB row while cookie still valid -> /api/auth/session = null, /admin redirects (revocable = D-06). Logout clears cookie + events.signOut deletes the row. After login + 7 authenticated requests, still exactly 1 row (no leak after encode reuse fix).
  implication: True server-side revocability proven (not stateless JWT). Sliding/refresh path does not leak rows.

- timestamp: 2026-06-11T15:05:00Z
  checked: Regression test gap
  found: Old tests mocked @/lib/auth and asserted on manual db.insert(sessions). New session.test.ts asserts authConfig.session.strategy==="jwt" and exercises real encode/decode bridge (create=1 row, reuse=no leak, decode resolves user/role, revoked->null, expired->null+cleanup). New login.test.ts calls the REAL provider.options.authorize (D-02 unverified->null, D-04 username).
  implication: The contradictory database+credentials config can no longer pass tests silently.

## Resolution

root_cause: src/lib/auth.ts configured session.strategy="database" together with a Credentials provider. @auth/core assertConfig (assert.js:114-118: `if (dbStrategy && onlyCredentials) return UnsupportedStrategy`) rejects that combination and throws BEFORE authorize() runs -> HTTP 500 on /api/auth/callback/credentials. The "D-08 workaround" jwt callback that did db.insert(sessions) was dead code: under the database strategy the credentials sign-in path never invokes that callback nor the jwt-signing path. The original RESEARCH Pattern 1 / Assumption A2 was itself wrong. Tests mocked @/lib/auth entirely, so they never hit assertConfig and gave a false pass.
fix: |
  src/lib/auth.ts — switch to session.strategy="jwt" (the only value @auth/core allows with Credentials), then back the "jwt" cookie with a real DB session row via jwt.encode/decode overrides (the verified #12848 pattern for beta.31):
    - jwt.encode: on sign-in, create a DB session row (adapter.createSession) and return its opaque sessionToken (a UUID) as the cookie value — NOT a signed JWT. On read-refresh (token already carries sessionToken from decode), REUSE it (no new row -> fixes a row-leak found during verification).
    - jwt.decode: resolve the opaque cookie value via adapter.getSessionAndUser; return null if the row is missing (revoked -> D-06) or expired (and delete it); otherwise slide the expiry (D-07) and return a token payload carrying id/role/sessionToken.
    - callbacks.jwt: on sign-in stash id/role/sub so encode knows the user.
    - callbacks.session: populate session.user.{id,role} from the token.
    - events.signOut: jwt-strategy signOut only clears the cookie, so delete the DB row here (server-side revocable logout).
    - Extracted config as `export const authConfig = {...} satisfies Parameters<typeof NextAuth>[0]` so tests can assert the strategy and exercise the bridge.
  src/types/auth.ts — removed the broken `next-auth/jwt` augmentation attempt (JWT already extends Record<string, unknown>); documented the token-bridge contract.
  src/lib/actions/auth.ts — removed dead `sessions` import; corrected the stale logout comment.
  tests/auth/session.test.ts + tests/auth/login.test.ts — rewritten to exercise the real config/authorize instead of mocks.
verification: |
  Live dev server (Node 22, next dev --webpack, port 3001), live Neon DB, seeded admin codingwithisaac@gmail.com:
    - Login (email AND username) -> 302 success, no UnsupportedStrategy, no 500.
    - Exactly 1 DB sessions row per login (D-06); auth() returns {id, role:"admin"}; /admin & /account/orders -> 200; unauthenticated /admin -> 307 redirect.
    - Server-side delete of the row immediately invalidates the session (revocability); logout clears cookie AND deletes row.
    - No row leak after 7 authenticated requests (1 row).
  npx tsc --noEmit: clean. npm run lint: clean. npx vitest run: 48 passed (7 files). npx next build --webpack: success.
files_changed:
  - src/lib/auth.ts
  - src/types/auth.ts
  - src/lib/actions/auth.ts
  - tests/auth/session.test.ts
  - tests/auth/login.test.ts
</content>
</invoke>
<invoke name="WebSearch">
<parameter name="query">next-auth v5 beta credentials provider database session strategy jwt.encode createSession workaround 2026