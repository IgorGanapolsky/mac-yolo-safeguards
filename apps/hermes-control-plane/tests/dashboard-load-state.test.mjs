import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");

// Reported 2026-07-27 from the phone: empty/blame states before load completed.
// Updated 2026-08-17: thread-messages failures must NOT poison workspace loadState
// (owner: "Could not load this conversation" with shell still signed in).

test("tracks whether a load has actually completed", () => {
  assert.match(
    dashboard,
    /const \[loadState, setLoadState\] = useState<"loading" \| "loaded" \| "error">\("loading"\)/,
    "the view must distinguish loading / loaded / error rather than inferring from empty data",
  );
});

test("does not claim 'No tasks yet' before a successful load", () => {
  assert.match(dashboard, /No tasks yet/, "empty state copy still present");
  assert.match(
    dashboard,
    /visibleTasks\.length === 0 && loadState === "loading"/,
    "a loading branch must precede the definitive empty state",
  );
  assert.match(
    dashboard,
    /visibleTasks\.length === 0 && loadState === "error"/,
    "an error branch must precede the definitive empty state",
  );
  assert.match(
    dashboard,
    /visibleTasks\.length === 0 && loadState === "loaded"/,
    "'No tasks yet' must only render once loadState is 'loaded'",
  );
  assert.doesNotMatch(
    dashboard,
    /\{visibleTasks\.length === 0 \? \(\s*\n\s*<div className="empty-state">/,
    "the empty state must never render purely from an empty array",
  );
});

test("conversation empty states wait for load + details", () => {
  assert.match(
    dashboard,
    /loadState === "loading" && !threadDetails/,
    "loading branch must require missing thread details",
  );
  assert.match(
    dashboard,
    /loadState === "error" && !threadDetails/,
    "workspace error must not override a resolved empty thread",
  );
  const loadingAt = dashboard.indexOf('data-state="loading">Loading this conversation');
  const emptyAt = dashboard.indexOf("No messages in this thread yet");
  assert.ok(loadingAt > -1 && emptyAt > loadingAt,
    "empty Continuity copy must come after the loading branch");
  assert.doesNotMatch(
    dashboard,
    /Keep the paired Hermes connector online to sync it/,
    "empty state must not blame a Mac connector for Continuity VPS product",
  );
});

test("workspace load failures still set error state", () => {
  assert.match(
    dashboard,
    /loadWorkspace\(\)\.catch\(\(\) => setLoadState\("error"\)\)/,
    "workspace poll failures must be caught and surfaced",
  );
});

test("a failed thread-messages fetch does not poison workspace loadState", () => {
  // Extract prefetchThreadDetails body and ensure it does not setLoadState("error").
  const start = dashboard.indexOf("const prefetchThreadDetails = useCallback");
  const end = dashboard.indexOf("}, [persistThreadDetails, readCachedThreadDetails]);", start);
  assert.ok(start > -1 && end > start, "prefetchThreadDetails must exist");
  const body = dashboard.slice(start, end);
  assert.doesNotMatch(
    body,
    /setLoadState\("error"\)/,
    "thread-messages failure must not set global loadState to error",
  );
  assert.match(body, /if \(!detailResponse\.ok\)/, "non-ok responses must be handled");
  assert.match(body, /detailResponse\.status === 404/, "404 clears stale selection");
  assert.match(body, /setThreadDetails\(\{ snapshot: \[\], tasks: \[\] \}\)/, "non-404 failure shows empty thread not global error");
});

test("load errors are caught rather than left as unhandled rejections", () => {
  assert.match(
    dashboard,
    /catch[^]{0,160}setLoadState\("error"\)/,
    "network failures inside load() must be caught and surfaced",
  );
});

test("does not blame pairing when machines exist (Buzz shared-room honesty)", () => {
  assert.match(dashboard, /function taskListEmptyCopy/);
  assert.match(dashboard, /if \(input\.deviceCount === 0\)/);
  assert.match(
    dashboard,
    /Pair a machine, then continue a Hermes thread from anywhere/,
    "zero-device onboarding copy retained for unpaired workspaces",
  );
  assert.match(dashboard, /No web tasks in this chat yet/);
  assert.match(dashboard, /Machines are paired/);
  assert.match(dashboard, /data-pair-blame=\{devices\.length === 0 && taskFilter === "all" \? "1" : "0"\}/);
  assert.match(dashboard, /function taskReceiptLabel/);
  assert.match(dashboard, /fenced · 90s lease/);
  assert.match(dashboard, /data-testid="task-receipt"/);
});
