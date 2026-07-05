import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Minimal Vitest setup for unit tests (schema, hooks, pure logic). Component /
// DOM testing infrastructure (jsdom, testing-library) is added in Phase 7.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
