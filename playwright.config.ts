import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.BADGER_E2E_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }, { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } }],
  webServer: { command: "bun run start", url: baseURL, reuseExistingServer: true, timeout: 120000, env: { BADGER_HOSTNAME: "127.0.0.1", PORT: String(e2ePort) } },
});
