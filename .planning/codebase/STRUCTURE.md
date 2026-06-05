# Codebase Structure

**Analysis Date:** 2026-06-05

## Directory Layout

```
mandy_store/
├── src/
│   └── app/
│       ├── favicon.ico         # App favicon
│       ├── globals.css         # Global styles, Tailwind import, CSS vars
│       ├── layout.tsx          # Root layout — fonts, metadata, HTML shell
│       └── page.tsx            # Home page (route: /)
├── public/                     # Static assets served at root URL
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── .planning/
│   └── codebase/               # GSD codebase map documents
├── .claude/                    # Claude/GSD tooling settings
├── eslint.config.mjs           # ESLint config (flat config, Next.js rules)
├── next.config.ts              # Next.js configuration (currently empty)
├── next-env.d.ts               # Next.js TypeScript declarations (generated)
├── package.json                # Dependencies and scripts
├── package-lock.json           # Lockfile
├── postcss.config.mjs          # PostCSS config (Tailwind v4 plugin)
├── tsconfig.json               # TypeScript config (strict, bundler resolution)
└── README.md                   # Project readme
```

## Directory Purposes

**`src/app/`:**
- Purpose: All application code; file-system routes under the Next.js App Router
- Contains: `layout.tsx`, `page.tsx` files, CSS, and favicon
- Key files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**`public/`:**
- Purpose: Static files served verbatim at the root URL (no processing)
- Contains: SVG icons and images referenced in components via `/filename`
- Key files: `public/next.svg`, `public/vercel.svg`

**`.planning/codebase/`:**
- Purpose: GSD codebase map documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Yes, by `gsd-map-codebase`
- Committed: Yes

**`.claude/`:**
- Purpose: Claude Code and GSD tool configuration and permissions
- Contains: `settings.local.json`
- Committed: No (local settings)

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout — wraps every page, sets fonts and metadata
- `src/app/page.tsx`: Home page component, rendered at route `/`

**Configuration:**
- `next.config.ts`: Next.js build and runtime config
- `tsconfig.json`: TypeScript compiler options; defines `@/*` path alias to `src/`
- `eslint.config.mjs`: ESLint flat config with Next.js core-web-vitals and TypeScript rules
- `postcss.config.mjs`: PostCSS plugin for Tailwind CSS v4

**Styles:**
- `src/app/globals.css`: Global CSS — Tailwind v4 import, CSS custom properties, dark mode vars

**Testing:**
- Not yet present

## Naming Conventions

**Files:**
- Pages: `page.tsx` (lowercase, required by Next.js App Router)
- Layouts: `layout.tsx` (lowercase, required by Next.js App Router)
- Components: PascalCase for the exported function name inside the file; filename is kebab-case or PascalCase (project convention not yet established — use PascalCase, e.g., `ProductCard.tsx`)
- Utilities: camelCase filename, e.g., `formatPrice.ts`
- Config files: kebab-case with extension, e.g., `next.config.ts`

**Directories:**
- Route segments: lowercase kebab-case matching the URL path, e.g., `src/app/product-detail/`
- Feature directories (to be added): lowercase kebab-case, e.g., `src/components/`, `src/lib/`, `src/types/`

## Where to Add New Code

**New Page / Route:**
- Create directory: `src/app/[route-name]/`
- Add file: `src/app/[route-name]/page.tsx`
- Optional layout: `src/app/[route-name]/layout.tsx`

**New Reusable Component:**
- Implementation: `src/components/[ComponentName].tsx`
- If grouping by feature: `src/components/[feature]/[ComponentName].tsx`

**API Route (server endpoint):**
- Implementation: `src/app/api/[endpoint-name]/route.ts`
- Exports: Named `GET`, `POST`, `PUT`, `DELETE` handler functions

**Shared Utilities / Helpers:**
- Location: `src/lib/[utility-name].ts`

**TypeScript Types / Interfaces:**
- Location: `src/types/[domain].ts` or colocated with the feature that owns them

**Static Images / Assets:**
- Place in `public/` for direct URL access (e.g., `public/logo.png` → `/logo.png`)
- Place in `src/` and import directly for assets that go through the Next.js bundler

**Styles:**
- Global: `src/app/globals.css`
- Component-scoped: Tailwind utility classes in JSX (no CSS Modules in use)

## Special Directories

**`.next/`:**
- Purpose: Next.js build output and dev server cache
- Generated: Yes
- Committed: No (in `.gitignore`)

**`node_modules/`:**
- Purpose: npm package dependencies
- Generated: Yes, by `npm install`
- Committed: No

---

*Structure analysis: 2026-06-05*
