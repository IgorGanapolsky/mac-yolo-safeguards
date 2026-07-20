import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:44173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node test/fixture-server.js",
    url: "http://127.0.0.1:44173/healthz",
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
