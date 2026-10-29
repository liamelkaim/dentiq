import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each test file spins up its own in-memory Postgres (PGlite).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      BETTER_AUTH_SECRET: "test-secret-not-used-anywhere-else-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
