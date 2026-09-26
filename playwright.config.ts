import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3200", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }, { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } }],
  webServer: { command: "npm run start -- --hostname 127.0.0.1 --port 3200", url: "http://127.0.0.1:3200", reuseExistingServer: true, timeout: 120000 },
});
