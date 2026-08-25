import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("open thread hides the duplicate oldest-first task dump between chat and composer", () => {
  assert.match(source, /hidden=\{duplicateTaskListHidden\}/);
  assert.match(source, /mergeThreadTimeline\(\{[\s\S]*snapshot: threadDetails\?\.snapshot/);
  assert.match(source, /latestVisibleTask && !latestVisibleTask\.result/);
  assert.doesNotMatch(source, /visibleTasks\[0\] && !visibleTasks\[0\]\.result/);
});

test("desktop thread console lifts the 460px chat cap so the newest bubble can sit on the composer", () => {
  assert.match(css, /\.task-panel \.conversation-history\{[\s\S]*max-height:none/);
  assert.match(css, /\.task-list\[hidden\]\{display:none !important\}/);
});
