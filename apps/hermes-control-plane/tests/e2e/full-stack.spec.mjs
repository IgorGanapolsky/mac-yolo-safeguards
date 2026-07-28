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

test("the device picker lets a real user target a specific paired Mac, and the task actually runs there", async ({ page }) => {
  await page.goto("/dashboard");

  const picker = page.locator('[data-testid="composer-device-select"]');
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toHaveCount(4, { timeout: 5_000 });
  await picker.selectOption(state.deviceB.deviceId);

  const textarea = page.getByLabel("Message for Hermes");
  await textarea.fill("run this on the MacBook Pro specifically");
  await page.locator(".composer-run").click();

  const taskCard = page.locator(".dashboard-task", { hasText: "run this on the MacBook Pro specifically" });
  await expect(taskCard).toBeVisible({ timeout: 10_000 });

  // Only device B's connector should be able to claim it -- device A polling should
  // find nothing (204/no task), proving the pinned deviceId was actually honored server-side.
  const wrongDeviceCycle = runConnector({
    device: state.deviceA,
    controlPlaneUrl: state.baseURL,
    gatewayUrl: state.gatewayUrl,
    mode: "--once",
  });
  expect(wrongDeviceCycle.status).toBe(0);

  await page.reload();
  const stillPendingCard = page.locator(".dashboard-task", { hasText: "run this on the MacBook Pro specifically" });
  await expect(stillPendingCard.locator(".status-completed")).toHaveCount(0);

  const correctDeviceCycle = runConnector({
    device: state.deviceB,
    controlPlaneUrl: state.baseURL,
    gatewayUrl: state.gatewayUrl,
    mode: "--once",
  });
  expect(correctDeviceCycle.status, `connector --once failed:\n${correctDeviceCycle.stderr}`).toBe(0);

  await page.reload();
  const completedCard = page.locator(".dashboard-task", { hasText: "run this on the MacBook Pro specifically" });
  await expect(completedCard.locator(".status-completed")).toBeVisible({ timeout: 10_000 });
  await expect(completedCard).toContainText(state.deviceB.deviceName);
});

test("mobile viewport bottom tabs cleanly isolate Chats, Hermes, Leash, and Settings without DOM stacking", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  // Bottom navigation tabs must be visible on mobile viewport
  const mobileNav = page.locator(".mobile-web-tabs");
  await expect(mobileNav).toBeVisible();

  // Default tab 'hermes' shows task panel and hides right rail
  await expect(page.locator(".task-panel")).toBeVisible();
  await expect(page.locator(".right-rail")).toBeHidden();

  // Tap 'Chats' tab: sidebar becomes visible, task-panel becomes hidden
  await mobileNav.locator('a[href="#chats"]').click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".task-panel")).toBeHidden();

  // Tap 'Hermes' tab: task-panel returns, sidebar & right-rail hidden
  await mobileNav.locator('a[href="#hermes-console"]').click();
  await expect(page.locator(".task-panel")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".right-rail")).toBeHidden();

  // Tap 'Settings' tab: right-rail settings panel shows, task-panel hidden
  await mobileNav.locator('a[href="#web-settings"]').click();
  await expect(page.locator(".right-rail")).toBeVisible();
  await expect(page.locator(".task-panel")).toBeHidden();
});

