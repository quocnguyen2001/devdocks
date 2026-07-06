import { defineConfig } from "@playwright/test";

// Smoke tests drive the Vite web UI on the Tauri dev port (1420). This exercises
// the REACT LAYER ONLY — Tauri IPC is unavailable under `pnpm dev`, so the app
// renders in empty/error states. Meaningful end-to-end coverage of launching
// needs tauri-driver (out of scope for v1) or manual QA. Requires browsers:
// `pnpm exec playwright install`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:1420" },
});
