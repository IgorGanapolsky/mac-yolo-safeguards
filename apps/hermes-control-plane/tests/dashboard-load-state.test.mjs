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

test("shows hosted VPS capacity meter from /api/me", () => {
  assert.match(dashboard, /continuityUsage\?: ContinuityUsage/);
  assert.match(dashboard, /setContinuityUsage\(identity\.continuityUsage\)/);
  assert.match(dashboard, /data-testid="continuity-usage-meter"/);
  assert.match(dashboard, /cloudTasksRemaining/);
  assert.match(dashboard, /role="progressbar"/);
  assert.match(dashboard, /data-testid="continuity-upgrade-hint"/);
  assert.match(dashboard, /continuityUsage\?\.exhausted/);
  assert.match(dashboard, /code === "cloud_task_limit"/);
  assert.match(dashboard, /Hosted VPS capacity/);
  assert.match(dashboard, /VPS runs used/);
  assert.doesNotMatch(dashboard, /local\/spot · \$0 Continuity quota/);
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

test("empty task copy is hosted VPS, not Mac-pair blame", () => {
  assert.match(dashboard, /function taskListEmptyCopy/);
  assert.doesNotMatch(dashboard, /if \(input\.deviceCount === 0\)/);
  assert.doesNotMatch(dashboard, /Pair a machine, then continue a Hermes thread from anywhere/);
  assert.doesNotMatch(dashboard, /Machines are paired/);
  assert.match(dashboard, /No web tasks in this chat yet/);
  assert.match(dashboard, /run on the hosted VPS/);
  assert.match(dashboard, /data-pair-blame=\{devices\.length === 0 && taskFilter === "all" \? "1" : "0"\}/);
  assert.match(dashboard, /function taskReceiptLabel/);
  assert.match(dashboard, /hosted Hermes · fenced · 90s lease/);
  assert.match(dashboard, /data-testid="task-receipt"/);
});

test("does not claim live or instantly when hosted resources are unhealthy", () => {
  // Aspire WaitFor lesson: Running ≠ Ready. Copy comes from hostedConnectionCopy.
  assert.match(dashboard, /hostedConnectionCopy/);
  assert.match(dashboard, /hostedResourceLabel/);
  assert.match(dashboard, /hostedRunner/);
  assert.match(dashboard, /hostedModel/);
  assert.match(dashboard, /data-testid="hosted-runner-status"/);
  assert.match(dashboard, /data-testid="hosted-model-status"/);
  assert.match(dashboard, /Runner · \{hostedResourceLabel\(runnerStatus\)\}/);
  assert.match(dashboard, /Model · \{hostedResourceLabel\(modelStatus\)\}/);
  assert.doesNotMatch(dashboard, /Tasks run instantly in the cloud/);
  assert.doesNotMatch(dashboard, /<strong>☁️ Hosted Hermes live<\/strong>/);
  assert.match(dashboard, /data-hosted-ready=\{hostedCopy\.live \? "1" : "0"\}/);
  assert.match(dashboard, /fenced VPS/);
  assert.doesNotMatch(dashboard, /Continuity hero|Mac lid|Cloud vs Local/);
});

test("does not toast leftover Mac-pair machine-found copy", () => {
  assert.doesNotMatch(dashboard, /Machine found\. Verify its name/);
  assert.doesNotMatch(dashboard, /approve the prefilled code/);
  assert.doesNotMatch(dashboard, /Waiting on your paired machine/);
  assert.match(dashboard, /Hosted on a fenced VPS/);
});

test("signed-in dashboard markup always includes #hermes-thread-list even with zero tasks", () => {
  assert.match(dashboard, /id="hermes-thread-list"/);
  assert.match(dashboard, /thread-list-empty/);
  assert.match(dashboard, /No chats yet/);
  const firstList = dashboard.indexOf('id="hermes-thread-list"');
  const secondList = dashboard.indexOf('id="hermes-thread-list"', firstList + 1);
  assert.ok(firstList > -1 && secondList > firstList, "identity-loading shell and signed-in shell both render the list");
  assert.doesNotMatch(
    dashboard,
    /if \(!user \|\| !organization\) return <main className="loading-screen">/,
    "identity fetch must not replace the dashboard with a list-less loading screen",
  );
  const emptyAt = dashboard.indexOf("No chats yet");
  const signedInList = dashboard.lastIndexOf('id="hermes-thread-list"');
  assert.ok(emptyAt > signedInList, "empty-state copy lives inside the signed-in thread list");
});
