import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"
import { loadEnvFile } from "node:process"

// Load .env.local so DB-backed auth tests (DATABASE_URL) run without requiring
// the var to be exported in the shell. No-op if .env.local is absent (e.g. CI
// injecting real env vars). Mirrors src/scripts/load-env.ts for standalone runs.
try {
  loadEnvFile(".env.local")
} catch {
  // env vars assumed to be provided by the runtime
}

// ─── Test database isolation ───────────────────────────────────────────────
// DB-backed integration tests TRUNCATE tables for isolation. Pointed at the dev
// DATABASE_URL, that would wipe the real catalog/users (the seeded storefront).
// To protect dev data, integration tests run ONLY against a separate
// TEST_DATABASE_URL (e.g. a Neon branch). When it's set we repoint the db client
// at it here (the client reads process.env.DATABASE_URL at import); when it's
// absent, integration tests skip themselves (see tests/helpers/db.ts) and the
// truncation helpers refuse to run — so the dev database is never touched.
const devDatabaseUrl = process.env.DATABASE_URL
if (process.env.TEST_DATABASE_URL) {
  if (process.env.TEST_DATABASE_URL === devDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL must point at a DIFFERENT database than DATABASE_URL — " +
        "they are identical, which would run destructive truncation against your dev data. " +
        "Create a separate Neon branch for tests.",
    )
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  console.log("[vitest] Using isolated TEST_DATABASE_URL for DB integration tests")
} else {
  console.log(
    "[vitest] TEST_DATABASE_URL not set — DB integration tests will SKIP " +
      "(dev database is protected). Set TEST_DATABASE_URL to a separate Neon branch to run them.",
  )
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    // Run test files sequentially so auth DB tests don't collide (shared Neon DB)
    fileParallelism: false,
    // Neon serverless latency can exceed the default 5s/10s timeouts — extend generously
    testTimeout: 30000,
    hookTimeout: 30000,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/e2e/**",
    ],
    // next-auth imports `next/server` without the .js extension, which breaks
    // Vitest's ESM resolver (Next.js package has no exports field).
    // Inlining next-auth through Vite's transform pipeline applies the alias.
    server: {
      deps: {
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Map bare `next/server` to the real file for the inlined next-auth transform
      "next/server": path.resolve(__dirname, "./node_modules/next/server.js"),
    },
  },
})
