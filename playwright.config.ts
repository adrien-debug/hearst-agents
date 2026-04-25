/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/**
 * Playwright configuration — Smoke tests for critical paths
 *
 * Tests:
 * - Health endpoint availability
 * - Login page rendering without crash
 *
 * Note: Install Playwright before using: npm install --save-dev @playwright/test
 */

// Conditionally import to avoid build errors when Playwright is not installed
let defineConfig: any;
let devices: any;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const playwright = require("@playwright/test");
  defineConfig = playwright.defineConfig;
  devices = playwright.devices;
} catch {
  // Fallback for build when Playwright is not installed
  defineConfig = (config: any) => config;
  devices = {};
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:9000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
