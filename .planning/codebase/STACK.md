# Technology Stack

**Analysis Date:** 2026-06-05

## Languages

**Primary:**
- TypeScript 5.x - All application source files (`src/**/*.ts`, `src/**/*.tsx`)

**Secondary:**
- CSS - Global styles (`src/app/globals.css`)

## Runtime

**Environment:**
- Node.js >=20.9.0 (required by Next.js 16)
- Detected local version: v18.17.0 (note: below minimum required — upgrade needed)

**Package Manager:**
- npm 9.6.7
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- Next.js 16.2.7 - Full-stack React framework with App Router (`src/app/`)

**Build/Dev:**
- Next.js built-in dev server (`next dev`)
- Next.js built-in build toolchain (`next build`)
- PostCSS with `@tailwindcss/postcss` plugin (`postcss.config.mjs`)

## Key Dependencies

**Critical:**
- `react` 19.2.4 - UI rendering
- `react-dom` 19.2.4 - DOM rendering

**Infrastructure:**
- `next/font/google` - Google Fonts via Next.js font optimization (Geist, Geist Mono loaded in `src/app/layout.tsx`)
- `next/image` - Optimized image component (used in `src/app/page.tsx`)

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2017
- Strict mode: enabled
- Path alias: `@/*` → `./src/*`
- Module resolution: bundler

**Build:**
- `next.config.ts` — minimal config, no custom options set
- `postcss.config.mjs` — Tailwind CSS v4 PostCSS plugin
- `eslint.config.mjs` — ESLint 9 flat config using `eslint-config-next` core-web-vitals + TypeScript rulesets

**Styling:**
- Tailwind CSS v4 (`tailwindcss ^4`) — utility-first CSS
- CSS custom properties for theme colors defined in `src/app/globals.css`
- Dark mode via `prefers-color-scheme` media query

**Environment:**
- No `.env` files present
- `.env*` is gitignored — environment variables must be configured externally

## Platform Requirements

**Development:**
- Node.js >=20.9.0
- npm >=9.x

**Production:**
- Deployment target: Vercel (indicated by `public/vercel.svg` and Vercel links in `src/app/page.tsx`)
- Next.js static export or server rendering supported

---

*Stack analysis: 2026-06-05*
