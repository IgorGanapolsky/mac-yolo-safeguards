import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "../app/dashboard/DashboardClient.tsx"),
  "utf8",
);

// 2026-08-21 user report: "Refresh button does absolutely nothing. Why is it
// needed?" The handler DID refetch, but gave zero visible feedback and no
// freshness cue, so an unchanged fetch looked like a no-op — and nothing told the
// user this is the only way to update (the dashboard does not auto-poll, per the
// Workers-quota fix). These pin the BEHAVIOUR that makes the click legible.
test("refresh handler tracks an in-flight state", () => {
  assert.match(source, /const \[isRefreshing, setIsRefreshing\] = useState\(false\)/);
  assert.match(source, /setIsRefreshing\(true\)/);
  assert.match(source, /setIsRefreshing\(false\)/);
});

test("refresh stamps a last-updated time on success", () => {
  assert.match(source, /const \[lastRefreshedAt, setLastRefreshedAt\] = useState<number \| null>\(null\)/);
  assert.match(source, /setLastRefreshedAt\(Date\.now\(\)\)/);
});

test("the button shows progress and is disabled while refreshing", () => {
  assert.match(source, /isRefreshing \? "↻ Refreshing…"/);
  assert.match(source, /disabled=\{busy \|\| isRefreshing \|\| loadState === "loading"\}/);
});

test("a freshness timestamp is rendered so the click is never a silent no-op", () => {
  assert.match(source, /data-testid="dashboard-refresh-timestamp"/);
  assert.match(source, /Updated \$\{new Intl\.DateTimeFormat/);
});

test("the button explains why it exists (no auto-refresh)", () => {
  assert.match(source, /does not auto-refresh/);
});
