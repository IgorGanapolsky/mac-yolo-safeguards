import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { STATE_FILE } from "./global-setup.mjs";

/**
 * Authenticated 390px phone acceptance for the Hermes console.
 *
 * Why this file exists: the mobile dashboard shell is a LOCKED app shell -- on
 * `max-width:700px` globals.css sets `html/body:has(.dashboard-shell){overflow:hidden}`
 * and `.dashboard-shell{height:100dvh;overflow:hidden}`. The document itself can
 * never scroll, so every pixel of the viewport is a fixed budget shared between the
 * chats drawer, the header, the conversation pane (`.hermes-scroll-pane`, `flex:1 1 0`)
 * and the composer (`flex:0 0 auto`).
 *
 * When the composer's intrinsic height grows, it silently eats the ENTIRE flex pane:
 * `flex:1 1 0` with no floor collapses toward 0px, the conversation disappears, and
 * because the document cannot scroll there is no way for the owner to recover it.
 * That is the exact production report ("Input is taking up half screen, can't even
 * see chat!" / "completely inscrollable", 2026-08-15..17), and it had already
 * regressed three times (#1470, #1479, #1520) because nothing pinned the layout.
 *
 * These assertions are behavioural on purpose -- they measure rendered geometry at a
 * real phone viewport rather than asserting on CSS text, so any future refactor that
 * starves the conversation fails here instead of on Igor's phone.
 */

const PHONE = { width: 390, height: 844 };

/** Conversation must keep a genuinely usable slice of the viewport. */
const MIN_CONVERSATION_PX = 160;
/** Even with the chats drawer open, the conversation must not be annihilated. */
const MIN_CONVERSATION_PX_DRAWER_OPEN = 110;

let state;
test.beforeAll(async () => {
  state = JSON.parse(await readFile(STATE_FILE, "utf8"));
});

test.use({ viewport: PHONE });

test.beforeEach(async ({ context }) => {
  await context.addCookies([{
    name: "hermes_session",
    value: state.sessionToken,
    url: state.baseURL,
  }]);
});

function box(locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    };
  });
}

test("the conversation pane survives the composer at 390px", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator(".dashboard-shell")).toHaveAttribute("data-mobile-tab", "hermes");

  const pane = page.locator(".hermes-scroll-pane");
  await expect(pane).toBeVisible();

  const paneBox = await box(pane);
  expect(
    paneBox.height,
    `conversation pane collapsed to ${paneBox.height}px -- the composer starved it, so the owner cannot see the chat`,
  ).toBeGreaterThanOrEqual(MIN_CONVERSATION_PX);
});

test("the Run CTA stays fully on screen at 390px", async ({ page }) => {
  await page.goto("/dashboard");

  const run = page.locator(".composer-run");
  await expect(run).toBeVisible();

  const runBox = await box(run);
  expect(
    runBox.bottom,
    `Run CTA bottom is ${runBox.bottom}px but the viewport is ${PHONE.height}px -- it is under the fold and the page cannot scroll`,
  ).toBeLessThanOrEqual(PHONE.height);
  expect(runBox.top).toBeGreaterThanOrEqual(0);
});

test("opening the chats drawer does not make the console unreachable", async ({ page }) => {
  await page.goto("/dashboard");

  const toggle = page.locator('[data-testid="mobile-chats-toggle"]');
  await expect(toggle).toBeVisible();

  // Expand the drawer only if it is currently collapsed.
  if (await page.locator(".sidebar.is-collapsed").count()) {
    await toggle.click();
  }
  await expect(page.locator(".sidebar.is-collapsed")).toHaveCount(0);

  const paneBox = await box(page.locator(".hermes-scroll-pane"));
  expect(
    paneBox.height,
    `with the chats drawer open the conversation pane is ${paneBox.height}px -- the drawer starved the main stage and nothing scrolls`,
  ).toBeGreaterThanOrEqual(MIN_CONVERSATION_PX_DRAWER_OPEN);

  // The drawer itself must never consume the whole locked viewport.
  const sidebarBox = await box(page.locator(".sidebar"));
  expect(
    sidebarBox.height,
    `chats drawer is ${sidebarBox.height}px of a ${PHONE.height}px locked shell`,
  ).toBeLessThanOrEqual(PHONE.height * 0.6);
});

test("no region is clipped without its own scrollport", async ({ page }) => {
  await page.goto("/dashboard");

  // The document is intentionally locked; that is only safe if every overflowing
  // region owns a scrollport. A clipped, non-scrollable region hides content forever.
  const offenders = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll(".dashboard-shell *")) {
      const style = getComputedStyle(el);
      const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
      if (!clipsY) continue;
      // Ignore elements that deliberately clamp text (line-clamp).
      if (style.webkitLineClamp && style.webkitLineClamp !== "none") continue;
      const hidden = el.scrollHeight - el.clientHeight;
      if (hidden > 24) {
        const cls = typeof el.className === "string" && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).join(".")}`
          : el.tagName.toLowerCase();
        bad.push({ selector: cls, hidden });
      }
    }
    return bad;
  });

  expect(
    offenders,
    `these regions clip content with no way to scroll to it: ${JSON.stringify(offenders, null, 2)}`,
  ).toEqual([]);
});
