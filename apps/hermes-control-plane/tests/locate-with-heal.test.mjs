import assert from "node:assert/strict";
import test from "node:test";
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
  assert.deepEqual(hit.tried, ["#hermes-thread-list"]);
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
  assert.deepEqual(miss.tried, [
    "#hermes-thread-list",
    '[data-testid="hermes-thread-list"]',
    "role=navigation[name=Chats]",
    "text:No chats yet",
  ]);
  assert.match(miss.reason, /dashboard\.thread-list/);
  assert.doesNotMatch(miss.reason, /timeout/i);
});

test("all-miss throw carries RCA fields on the error", async () => {
  const page = makePage({});
  await assert.rejects(
    () => locateWithHeal(page, [".gone", { testid: "missing" }], { step: "checkout.cta", timeout: 0 }),
    (err) => {
      assert.equal(err.ok, false);
      assert.equal(err.step, "checkout.cta");
      assert.deepEqual(err.tried, [".gone", "testid:missing"]);
      assert.match(err.reason, /checkout\.cta/);
      assert.equal(err.rca.ok, false);
      assert.doesNotMatch(String(err.message), /live/i);
      return true;
    },
  );
});

test("dashboard-task and checkout candidate lists stay ordered for heal", () => {
  const task = DASHBOARD_TASK_CANDIDATES_FOR("prove the full stack works end to end");
  assert.equal(task[0].css, ".dashboard-task");
  assert.equal(task[0].hasText, "prove the full stack works end to end");
  assert.equal(CHECKOUT_CTA_CANDIDATES[0], '[data-funnel-event="hosted_checkout_click"]');
});
