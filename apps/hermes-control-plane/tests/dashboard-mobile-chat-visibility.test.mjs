import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const dashboard = readFileSync(
  new URL("../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("phone chat stays in document flow instead of collapsing into a zero-height nested scrollport", () => {
  const mobileWorkbench = css.match(
    /\/\* Mobile chat visibility: phone uses the document scrollport[\s\S]*?\.dashboard-shell\[data-mobile-tab="hermes"\] \.hermes-scroll-pane\s*\{([\s\S]*?)\n\s*\}/,
  );

  assert.ok(mobileWorkbench, "mobile Hermes scroll-pane visibility rule must exist");
  assert.match(mobileWorkbench[1], /flex:\s*0 0 auto\s*!important/);
  assert.match(mobileWorkbench[1], /overflow-y:\s*visible\s*!important/);
  assert.doesNotMatch(mobileWorkbench[1], /flex:\s*1 1 0/);
});

test("restored threads still move the newest message into the phone viewport", () => {
  assert.match(
    dashboard,
    /loadState !== "loaded"[\s\S]*?scrollConversationHistoryToLatest\(document, "auto"\)/,
  );
  assert.match(dashboard, /className="conversation-message role-assistant"/);
  assert.match(dashboard, /<ConversationMeta meta=\{taskOutputMeta\(task\)\}/);
});
