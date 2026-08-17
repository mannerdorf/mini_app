import { defineConfig, devices } from "@playwright/test";

/**
 * Guest smoke. Start the app yourself, then:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e:guest
 *
 * On macOS prefer `localhost` over `127.0.0.1` — Vite often binds IPv6-only.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "guest-mobile", use: { ...devices["Pixel 7"] } }],
});
