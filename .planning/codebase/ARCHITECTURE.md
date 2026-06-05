<!-- refreshed: 2026-06-05 -->
# Architecture

**Analysis Date:** 2026-06-05

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Browser / Client                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App Router                        │
│                   `src/app/layout.tsx`                       │
│              (root layout — fonts, global CSS)               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Page Components                         │
│                    `src/app/page.tsx`                        │
│               (React Server Components by default)           │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root Layout | HTML shell, font variables, global styles | `src/app/layout.tsx` |
| Home Page | Default landing page UI | `src/app/page.tsx` |
| Global CSS | Tailwind import, CSS custom properties, dark mode | `src/app/globals.css` |

## Pattern Overview

**Overall:** Next.js App Router — file-system-based routing with React Server Components

**Key Characteristics:**
- All components are React Server Components by default (no `"use client"` directives present yet)
- Single-route application at the scaffold stage
- Styling via Tailwind CSS v4 utility classes applied directly in JSX
- No data fetching, state management, or API routes exist yet

## Layers

**Routing / Pages Layer:**
- Purpose: Maps URL paths to React components via the filesystem
- Location: `src/app/`
- Contains: `page.tsx` files, `layout.tsx` files, `loading.tsx`, `error.tsx` (as added)
- Depends on: React, Next.js runtime
- Used by: Next.js router at request time

**Layout Layer:**
- Purpose: Shared UI shell wrapping all pages — fonts, metadata, global styles
- Location: `src/app/layout.tsx`
- Contains: Root `<html>` and `<body>` tags, font configuration, `<Metadata>` export
- Depends on: `next/font/google` (Geist, Geist Mono), `globals.css`
- Used by: Every page in the app

**Styles Layer:**
- Purpose: Global CSS baseline and design tokens
- Location: `src/app/globals.css`
- Contains: Tailwind v4 import, CSS custom properties (`--background`, `--foreground`), dark mode media query
- Depends on: Nothing
- Used by: Root layout

## Data Flow

### Primary Request Path

1. Browser requests a URL — Next.js App Router matches it to `src/app/page.tsx`
2. Next.js renders the React Server Component on the server
3. `src/app/layout.tsx` wraps the page output with the HTML shell
4. HTML + minimal JS hydration payload sent to browser

### Static Asset Path

1. Files in `public/` (SVGs) are served directly at `/filename` by Next.js
2. `src/app/page.tsx` references `/next.svg` and `/vercel.svg` via `next/image`

**State Management:**
- None. Application is at scaffold stage with no client-side state.

## Key Abstractions

**Root Layout:**
- Purpose: Single shared wrapper for all routes — sets up fonts and metadata
- Examples: `src/app/layout.tsx`
- Pattern: Named export `metadata` (static) + default export `RootLayout` component

**Page Component:**
- Purpose: UI for a single route; maps 1:1 to a URL segment
- Examples: `src/app/page.tsx`
- Pattern: Default export function, no props, Server Component by default

## Entry Points

**Root Layout:**
- Location: `src/app/layout.tsx`
- Triggers: Every page render in the application
- Responsibilities: Apply fonts (`Geist`, `Geist Mono`), export `Metadata`, render `children`

**Home Page:**
- Location: `src/app/page.tsx`
- Triggers: HTTP `GET /`
- Responsibilities: Render scaffold landing page UI

**Next.js Config:**
- Location: `next.config.ts`
- Triggers: Build and dev server startup
- Responsibilities: Currently empty — no custom config applied

## Architectural Constraints

- **Rendering model:** React Server Components by default; add `"use client"` directive to opt into client rendering
- **Routing:** File-system routing — new routes require new `page.tsx` files under `src/app/`
- **Path alias:** `@/*` resolves to `src/*` (configured in `tsconfig.json`)
- **Global state:** None present
- **Circular imports:** None present
- **API routes:** Not yet created; add under `src/app/api/[route]/route.ts` following Next.js conventions

## Anti-Patterns

### Putting page logic in layout.tsx

**What happens:** Logic or data fetching added to `src/app/layout.tsx` that is specific to one page
**Why it's wrong:** Layout renders for every route — page-specific side effects run on all pages
**Do this instead:** Keep data fetching and business logic inside `src/app/[route]/page.tsx` or dedicated Server Components

### Using `<a>` tags for internal navigation

**What happens:** Raw `<a href="/some-page">` used for in-app links (as seen in the scaffold's external links)
**Why it's wrong:** Bypasses Next.js client-side navigation and prefetching
**Do this instead:** Use `next/link` (`<Link href="/some-page">`) for all internal navigation

## Error Handling

**Strategy:** Not yet implemented (scaffold stage)

**Patterns:**
- Add `src/app/error.tsx` to handle runtime errors per route segment
- Add `src/app/not-found.tsx` to handle 404s

## Cross-Cutting Concerns

**Logging:** None — not yet implemented
**Validation:** None — not yet implemented
**Authentication:** None — not yet implemented

---

*Architecture analysis: 2026-06-05*
