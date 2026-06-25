# Mandy Store

Single-vendor ecommerce storefront for electronics, watches, and phones. Customers browse, select variants, and buy via Stripe, PayPal, or bank transfer (NGN). Store owner manages products and orders through a built-in admin panel.

## GSD Workflow

This project uses GSD (Get Shit Done) for planning and execution. Planning artifacts live in `.planning/`:

- `PROJECT.md` — project context and requirements (source of truth for scope)
- `REQUIREMENTS.md` — 27 v1 requirements with REQ-IDs and traceability
- `ROADMAP.md` — 6-phase build plan
- `STATE.md` — current project state and cross-phase constraints
- `config.json` — workflow config (YOLO mode, standard granularity, balanced models)
- `research/` — domain research (stack, features, architecture, pitfalls)
- `codebase/` — codebase map

**Workflow commands:**
- `/gsd-plan-phase N` — create detailed plan for a phase
- `/gsd-execute-phase N` — execute a planned phase
- `/gsd-progress` — check status and next action

Always honor scope boundaries in PROJECT.md. Mark requirements complete in REQUIREMENTS.md traceability as phases finish.

## Tech Stack

- **Framework**: Next.js 16 (App Router, `src/` layout), TypeScript, Tailwind CSS v4 — already scaffolded
- **Planned**: PostgreSQL (Neon) + Drizzle ORM, Auth.js v5, Stripe + PayPal SDKs, Resend email, Vercel Blob images
- **Node**: requires v20+ (use `nvm use 20`)

## Critical Constraints (from research)

- **Next.js 16 renamed `middleware.ts` → `proxy.ts`** — ignore older tutorials. The proxy cannot protect Server Actions; re-verify auth inside every admin/mutation action.
- **Never trust client-submitted prices** — always recompute order totals server-side before creating a PaymentIntent.
- **Webhook idempotency is mandatory** — `processed_webhook_events` table with unique constraint; create orders transactionally.
- **Atomic stock decrement** — use `UPDATE variants SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock`; never read-then-write.
- **Payment methods must be independently toggleable** via env/config — enforced server-side, not just UI.

## Build Commands

```bash
nvm use 20
npm run dev              # dev server
npx next build --webpack # production build (Turbopack native bindings unavailable on this machine)
npm run lint             # eslint
```

## Testing

```bash
npm test                 # vitest (unit tests always run; DB integration tests skip unless TEST_DATABASE_URL is set)
npm run seed:catalog     # repopulate the dev catalog
```

**DB test isolation — do not skip.** Integration tests TRUNCATE tables for isolation, so they must NEVER run against the dev `DATABASE_URL` (it would wipe the seeded catalog/users). They run only when `TEST_DATABASE_URL` points at a **separate** database:

- **Unset (default):** DB integration tests skip; pure unit tests run. The dev database is protected (the truncate helpers hard-refuse without `TEST_DATABASE_URL`). This is why `npm test` shows skipped tests.
- **To run the full integration suite:** create a separate Neon branch (Neon dashboard → Branches → "New branch" from `main`, or `neonctl branches create`), then add its connection string to `.env.local`:
  ```bash
  TEST_DATABASE_URL=postgres://…@…-test-branch.neon.tech/dbname?sslmode=require
  ```
  `vitest.config.ts` repoints the db client at it; the dev DB is never touched. `TEST_DATABASE_URL` must differ from `DATABASE_URL` (vitest hard-fails if they match). The test branch needs the schema — branching from `main` inherits it, or run `DATABASE_URL=$TEST_DATABASE_URL npm run db:push`.

Set `TEST_DATABASE_URL` before phase verification (esp. Phase 4 payments) so integration coverage actually runs.
