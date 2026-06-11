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
