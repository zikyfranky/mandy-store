# Coding Conventions

**Analysis Date:** 2026-06-05

## Naming Patterns

**Files:**
- Page and layout files use lowercase with `.tsx` extension, matching Next.js App Router conventions: `page.tsx`, `layout.tsx`
- Global CSS uses lowercase: `globals.css`
- Config files use camelCase or dot-separated descriptors: `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`

**Functions/Components:**
- React components use PascalCase default exports: `Home`, `RootLayout` (see `src/app/page.tsx`, `src/app/layout.tsx`)
- Module-level variable names (font instances) use camelCase: `geistSans`, `geistMono`

**Variables:**
- camelCase throughout (TypeScript strict mode enforces this implicitly)
- CSS custom properties use kebab-case with `--` prefix: `--font-geist-sans`, `--color-background`

**Types:**
- TypeScript `type` imports used for type-only dependencies: `import type { Metadata } from "next"` (`src/app/layout.tsx:1`)
- Inline anonymous object types used for props: `Readonly<{ children: React.ReactNode }>` (`src/app/layout.tsx:22-24`)

## Code Style

**Formatting:**
- No Prettier config present — formatting is not enforced by tooling
- Indentation: 2-space indentation observed in all source files
- Double quotes used for string literals in TSX/TS files
- Single quotes used in config files (`postcss.config.mjs`)
- Trailing commas present in multi-line objects

**TypeScript:**
- Strict mode enabled (`tsconfig.json` line 7: `"strict": true`)
- `noEmit: true` — TypeScript is used for type-checking only, Next.js handles transpilation
- `isolatedModules: true` — each file must be independently compilable

**Linting:**
- ESLint 9 with flat config format (`eslint.config.mjs`)
- Ruleset: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Lint command: `npm run lint` (runs `eslint`)
- No custom rule overrides beyond the default Next.js config

## Import Organization

**Order observed in `src/app/layout.tsx`:**
1. Type imports (`import type { Metadata } from "next"`)
2. Named imports from framework packages (`import { Geist, Geist_Mono } from "next/font/google"`)
3. Local CSS imports (`import "./globals.css"`)

**Path Aliases:**
- `@/*` maps to `./src/*` (defined in `tsconfig.json` paths)
- Use `@/` prefix for all imports from within `src/`

## JSX Conventions

- `className` used for all CSS class attributes (not `class`)
- Tailwind utility classes applied directly via `className` — no CSS modules used
- Dark mode via `dark:` Tailwind variants (e.g., `dark:bg-black`, `dark:text-zinc-50`)
- Responsive variants used: `sm:items-start`, `md:w-[158px]`
- Arbitrary Tailwind values used for fine-grained control: `hover:bg-[#383838]`, `border-black/[.08]`

## CSS / Styling Conventions

**Approach:**
- Tailwind CSS v4 via `@tailwindcss/postcss` plugin (`postcss.config.mjs`)
- Global baseline in `src/app/globals.css`: `@import "tailwindcss"` at top
- CSS custom properties defined in `:root` for theme tokens
- `@theme inline` block used to wire Tailwind design tokens to CSS variables
- Dark mode handled via `@media (prefers-color-scheme: dark)` in global CSS, not class-based toggle

**Font Loading:**
- Google Fonts loaded via `next/font/google` in layout, injected as CSS variables
- Font variables applied on `<html>` element via `className`

## Component Structure

**Page Components:**
- Single default export per file, no named exports in pages
- Component body: JSX return only — no client-side hooks, no `"use client"` directive in existing files
- Server Components by default (no `"use client"` seen)

**Layout Components:**
- `src/app/layout.tsx` is the root layout: sets `<html>`, `<body>`, fonts, and global CSS
- Metadata exported as a named constant of type `Metadata`

## Error Handling

**Patterns:**
- No error handling patterns established — codebase is a scaffold with no business logic
- No `error.tsx`, `not-found.tsx`, or `loading.tsx` files present yet
- Next.js App Router convention: add `error.tsx` at route segment level for error boundaries

## Logging

**Framework:** Not established — no logging library present

**Patterns:**
- No logging patterns in place; codebase has no server-side logic yet

## Comments

**When to Comment:**
- No comments present in source files; codebase is boilerplate only
- No JSDoc/TSDoc usage observed

## Module Design

**Exports:**
- Default exports only in page/layout files (Next.js App Router requirement)
- Named exports used for metadata constants (`export const metadata`)

**Barrel Files:**
- None present — only two source files exist

---

*Convention analysis: 2026-06-05*
