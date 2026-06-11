import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    // Run test files sequentially so auth DB tests don't collide (shared Neon DB)
    fileParallelism: false,
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
