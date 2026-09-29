import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3000);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "yarn next:dev",
        cwd: "../..",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
