import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { STATE_FILE } from "./global-setup.mjs";
import { runConnector } from "./fixtures/run-connector.mjs";

/**
 * Real cross-process E2E: a real `wrangler dev --local` Worker (real D1, real routes),
 * a real spawned `tools/hermes-cloud-connector.js` process (not its internals called
 * directly), a lightweight-but-real-shaped fake Hermes gateway, and a real Chromium
 * browser via Playwright. This proves the two bugs fixed on 2026-07-26 end-to-end,
 * not through mocks of our own code.
 */

let state;
test.beforeAll(async () => {
  state = JSON.parse(await readFile(STATE_FILE, "utf8"));
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([{
    name: "hermes_session",
    value: state.sessionToken,
    url: state.baseURL,
  }]);
});

test("a scheduled cron-automation session never appears as a thread in the real dashboard", async ({ page }) => {
  // Real connector process, real sync call, against the fake gateway seeded (in
  // global-setup) with a cron-shaped session id -- the exact bug from Igor's live report.
  const sync = runConnector({
    device: state.deviceA,
    controlPlaneUrl: state.baseURL,
    gatewayUrl: state.gatewayUrl,
    mode: "--sync-only",
  });
  expect(sync.status, `connector --sync-only failed:\n${sync.stderr}`).toBe(0);

  await page.goto("/dashboard");
  await expect(page.locator("#hermes-thread-list")).toBeVisible();
  // The real chat session DOES sync through.
  await expect(page.locator(".thread-item", { hasText: "A real chat session" })).toBeVisible();
  // The cron-automation session must NOT -- this is the actual regression.
  await expect(page.locator(".thread-item", { hasText: "reddit-inbox-conversion-monitor" })).toHaveCount(0);
});

test("a task submitted through the real composer round-trips through the real connector to a real result", async ({ page }) => {
  await page.goto("/dashboard");
  const textarea = page.getByLabel("Message for Hermes");
  await textarea.fill("prove the full stack works end to end");
  await page.locator(".composer-run").click();

  // Task should appear immediately in a pending-ish state.
  const taskCard = page.locator(".dashboard-task", { hasText: "prove the full stack works end to end" });
  await expect(taskCard).toBeVisible({ timeout: 10_000 });

  // Simulate the real Mac connector polling and claiming this exact task -- a real
  // spawned process, real signed HTTP calls, real gateway round trip.
  const cycle = runConnector({
    device: state.deviceA,
    controlPlaneUrl: state.baseURL,
    gatewayUrl: state.gatewayUrl,
    mode: "--once",
  });
  expect(cycle.status, `connector --once failed:\n${cycle.stderr}`).toBe(0);

  await page.reload();
  const completedCard = page.locator(".dashboard-task", { hasText: "prove the full stack works end to end" });
  await expect(completedCard.locator(".status-completed")).toBeVisible({ timeout: 10_000 });
  await expect(completedCard.locator("pre")).toContainText("fake-gateway E2E reply");
});

test("composer has no RUN ON picker and shows Output after send", async ({ page }) => {
  await page.goto("/dashboard");

  const output = page.locator('[data-testid="run-output"]');
  await expect(output).toBeVisible();
  await expect(output.locator(".eyebrow")).toContainText(/Output/i);
  await expect(page.locator('[data-testid="composer-target-select"]')).toHaveCount(0);
  await expect(page.locator("select.composer-target-select")).toHaveCount(0);
  await expect(page.getByLabel("RUN ON")).toHaveCount(0);
  await expect(page.getByText("Which Mac?")).toHaveCount(0);
  await expect(page.getByText("Open Continuity settings")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open settings" })).toHaveCount(1);

  const prompt = "prove Continuity output pane after send";
  const textarea = page.getByLabel("Message for Hermes");
  await textarea.fill(prompt);
  await page.locator(".composer-run").click();

  const taskCard = page.locator(".dashboard-task", { hasText: prompt });
  await expect(taskCard).toBeVisible({ timeout: 10_000 });
  await expect(output).toBeVisible();
  await expect(output).toContainText(/Output|Continuity|Results show here|Sent|Running/i);

  // Continuity-only composer: any online connector can claim. Do not pin a Mac.
  const cycle = runConnector({
    device: state.deviceA,
    controlPlaneUrl: state.baseURL,
    gatewayUrl: state.gatewayUrl,
    mode: "--once",
  });
  expect(cycle.status, `connector --once failed:\n${cycle.stderr}`).toBe(0);

  await page.reload();
  const completedCard = page.locator(".dashboard-task", { hasText: prompt });
  await expect(completedCard.locator(".status-completed")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="run-output"]')).toBeVisible();
  await expect(page.locator('[data-testid="run-output"] .eyebrow')).toContainText(/Output/i);
});
