import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  locateWithHeal,
  HERMES_THREAD_LIST_CANDIDATES,
  DASHBOARD_TASK_CANDIDATES_FOR,
  CHECKOUT_CTA_CANDIDATES,
} from "./locate-with-heal.mjs";

function loc(isShown) {
  return {
    first() {
      return this;
    },
    async isVisible() {
      return isShown;
    },
  };
}

function makePage(visible) {
  return {
    locator(sel, opts) {
      if (opts?.hasText != null) {
        return loc(Boolean(visible.cssHasText?.[`${sel}::${opts.hasText}`]));
      }
      return loc(Boolean(visible.css?.[sel]));
    },
    getByTestId(id) {
      return loc(Boolean(visible.testid?.[id]));
    },
    getByRole(role, opts) {
      const name = opts?.name;
      const nameKey = name instanceof RegExp ? name.source : name == null ? "" : String(name);
      const key = nameKey ? `${role}:${nameKey}` : role;
      return loc(Boolean(visible.role?.[key]));
    },
    getByText(text) {
      return loc(Boolean(visible.text?.[String(text)]));
    },
  };
}

test("first candidate wins", async () => {
  const page = makePage({
    css: { "#hermes-thread-list": true, '[data-testid="hermes-thread-list"]': true },
    testid: { "hermes-thread-list": true },
  });
  const hit = await locateWithHeal(page, HERMES_THREAD_LIST_CANDIDATES, {
    step: "dashboard.thread-list",
    timeout: 0,
  });
  assert.equal(hit.ok, true);
  assert.equal(hit.matched, "#hermes-thread-list");
  assert.equal(hit.step, "dashboard.thread-list");
  assert.equal(hit.healed, null);
  assert.deepEqual(hit.tried, ["#hermes-thread-list"]);
});

test("first CSS missing, testid visible → healed.from is CSS, healed.to is testid", async () => {
  const page = makePage({
    css: { "#hermes-thread-list": false },
    testid: { "hermes-thread-list": true },
  });
  const hit = await locateWithHeal(
    page,
    ["#hermes-thread-list", { testid: "hermes-thread-list" }],
    { step: "dashboard.thread-list", timeout: 0 },
  );
  assert.equal(hit.ok, true);
  assert.equal(hit.matched, "testid:hermes-thread-list");
  assert.equal(hit.healed.from, "#hermes-thread-list");
  assert.equal(hit.healed.to, "testid:hermes-thread-list");
  assert.deepEqual(hit.tried, ["#hermes-thread-list", "testid:hermes-thread-list"]);
});

test("falls through to the first visible later candidate", async () => {
  const page = makePage({
    css: { "#hermes-thread-list": false, '[data-testid="hermes-thread-list"]': false },
    testid: { "hermes-thread-list": true },
    role: { "navigation:Chats": false },
  });
  const hit = await locateWithHeal(page, HERMES_THREAD_LIST_CANDIDATES, {
    step: "dashboard.thread-list",
    timeout: 0,
  });
  assert.equal(hit.ok, true);
  assert.equal(hit.matched, "testid:hermes-thread-list");
  assert.equal(hit.healed.from, "#hermes-thread-list");
  assert.equal(hit.healed.to, "testid:hermes-thread-list");
  assert.deepEqual(hit.tried, [
    "#hermes-thread-list",
    '[data-testid="hermes-thread-list"]',
    "testid:hermes-thread-list",
  ]);
});

test("all-miss returns named step RCA (no vibe timeout)", async () => {
  const page = makePage({
    css: {},
    testid: {},
    role: {},
    text: {},
  });
  const miss = await locateWithHeal(
    page,
    [
      "#hermes-thread-list",
      '[data-testid="hermes-thread-list"]',
      { role: "navigation", name: "Chats" },
      { text: "No chats yet" },
    ],
    { step: "dashboard.thread-list", timeout: 0, throwOnMiss: false },
  );
  assert.equal(miss.ok, false);
  assert.equal(miss.step, "dashboard.thread-list");
  assert.equal(miss.expected, "#hermes-thread-list");
  assert.equal(miss.actual, "none visible");
  assert.equal(miss.rootCause, "locator-miss");
  assert.equal(miss.screenshotPath, null);
  assert.deepEqual(miss.tried, [
    "#hermes-thread-list",
    '[data-testid="hermes-thread-list"]',
    "role=navigation[name=Chats]",
    "text:No chats yet",
  ]);
  assert.doesNotMatch(miss.rootCause, /timeout/i);
  assert.doesNotMatch(miss.reason, /timeout/i);
});

test("all-miss throw message is JSON-serializable RCA", async () => {
  const page = makePage({});
  await assert.rejects(
    () => locateWithHeal(page, [".gone", { testid: "missing" }], { step: "checkout.cta", timeout: 0 }),
    (err) => {
      const parsed = JSON.parse(err.message);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.step, "checkout.cta");
      assert.equal(parsed.expected, ".gone");
      assert.equal(parsed.actual, "none visible");
      assert.equal(parsed.rootCause, "locator-miss");
      assert.deepEqual(parsed.tried, [".gone", "testid:missing"]);
      assert.equal(parsed.screenshotPath, null);
      assert.equal(err.rca.rootCause, "locator-miss");
      assert.doesNotMatch(err.message, /live/i);
      return true;
    },
  );
});

test("RCA miss writes {step}.png when screenshotDir and page.screenshot exist", async () => {
  const dir = join(tmpdir(), `heal-rca-${Date.now()}`);
  const written = [];
  const page = makePage({});
  page.screenshot = async ({ path }) => {
    written.push(path);
  };
  const miss = await locateWithHeal(page, ["#gone"], {
    step: "dashboard.thread-list",
    timeout: 0,
    throwOnMiss: false,
    screenshotDir: dir,
  });
  assert.equal(miss.ok, false);
  assert.equal(miss.screenshotPath, join(dir, "dashboard.thread-list.png"));
  assert.deepEqual(written, [miss.screenshotPath]);
});

test("dashboard-task and checkout candidate lists stay ordered for heal", () => {
  const task = DASHBOARD_TASK_CANDIDATES_FOR("prove the full stack works end to end");
  assert.equal(task[0].css, ".dashboard-task");
  assert.equal(task[0].hasText, "prove the full stack works end to end");
  assert.equal(CHECKOUT_CTA_CANDIDATES[0], '[data-funnel-event="hosted_checkout_click"]');
});
