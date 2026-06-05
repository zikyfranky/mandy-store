# External Integrations

**Analysis Date:** 2026-06-05

## APIs & External Services

**Font Delivery:**
- Google Fonts (via Next.js font optimization) — serves Geist and Geist Mono typefaces
  - SDK/Client: `next/font/google` (bundled with Next.js)
  - Auth: None required
  - Usage: `src/app/layout.tsx`

No other external API integrations are present. The codebase is a scaffolded Next.js starter with no business logic or third-party service connections yet.

## Data Storage

**Databases:**
- None — no database client, ORM, or connection configuration detected

**File Storage:**
- Local filesystem only — static assets served from `public/`

**Caching:**
- Next.js built-in caching (App Router defaults)

## Authentication & Identity

**Auth Provider:**
- None — no authentication library or provider configured

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- Next.js default server logging only (stdout)

## CI/CD & Deployment

**Hosting:**
- Vercel — inferred from `public/vercel.svg`, `.vercel` in `.gitignore`, and deploy links in `src/app/page.tsx`
- No `.vercel/` config directory committed

**CI Pipeline:**
- None detected — no GitHub Actions, CircleCI, or similar config files present

## Environment Configuration

**Required env vars:**
- None currently required (no integrations configured)

**Secrets location:**
- No secrets present; `.env*` is gitignored per `.gitignore`

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-06-05*
