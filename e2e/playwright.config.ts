import { defineConfig, devices } from "@playwright/test";

const full = process.env.NAPP_E2E_FULLSTACK === "1";
const port = full ? 5200 : 5198;
export default defineConfig({
  testDir: full ? "./fullstack" : "./ui",
  outputDir: "../test-results",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalTimeout: 10 * 60_000,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `node --experimental-strip-types e2e/serve.ts ${full ? "fullstack" : "ui"}`,
    cwd: "..",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
