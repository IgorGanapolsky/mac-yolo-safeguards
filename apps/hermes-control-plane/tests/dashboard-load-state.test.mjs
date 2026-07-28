import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");

// Reported 2026-07-27 from the phone: the thread console showed
// "No tasks yet — Pair a machine, then continue a Hermes thread from anywhere."
// on a thread that in fact had 5 synced messages; the content appeared ~17s later.
//
// Both empty states in this view assert a FACT about the user's setup ("you have no tasks",
// "this thread has no cloud snapshot, keep your connector online"). Rendering them before a
// load has actually succeeded turns "we don't know yet" into "your setup is broken", which is
// the single most discouraging thing this screen can say to someone who just paired a machine.
//
// Absence of data is not evidence of absence. An empty state may only be shown once a load
// has completed successfully; before that it is a loading state, and after a failure it is an
// error state.

test("tracks whether a load has actually completed", () => {
  assert.match(
    dashboard,
    /const \[loadState, setLoadState\] = useState<"loading" \| "loaded" \| "error">\("loading"\)/,
    "the view must distinguish loading / loaded / error rather than inferring from empty data",
  );
});

test("does not claim 'No tasks yet' before a successful load", () => {
  assert.match(dashboard, /No tasks yet/, "empty state copy still present");
  // The definitive empty state must sit behind a completed load, with distinct
  // loading and error branches ahead of it in the same chain.
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
  // Guard against the original shape returning: an ungated `length === 0 ?` straight
  // into the empty state.
  assert.doesNotMatch(
    dashboard,
    /\{visibleTasks\.length === 0 \? \(\s*\n\s*<div className="empty-state">/,
    "the empty state must never render purely from an empty array",
  );
});

test("does not claim the thread has no snapshot before a successful load", () => {
  // The connector-blaming message must be the LAST resort, behind loading and error states.
  assert.match(
    dashboard,
    /loadState === "loading" \? <div className="conversation-empty" data-state="loading">/,
    "a loading state must precede the no-snapshot message",
  );
  assert.match(
    dashboard,
    /loadState === "error" \? <div className="conversation-empty" data-state="error">/,
    "an error state must precede the no-snapshot message",
  );
  const loadingAt = dashboard.indexOf('data-state="loading">Loading this conversation');
  const blameAt = dashboard.indexOf("This thread has no cloud snapshot yet");
  assert.ok(loadingAt > -1 && blameAt > loadingAt,
    "the no-snapshot message must come after the loading branch in the ternary chain");
});

test("surfaces a failed load instead of showing an empty state", () => {
  assert.match(
    dashboard,
    /loadState === "error"/,
    "a failed fetch must render an error state, not silently fall through to 'empty'",
  );
  assert.match(
    dashboard,
    /setLoadState\("error"\)/,
    "load failures must set the error state",
  );
});

test("a failed thread-messages fetch does not leave stale details on screen", () => {
  // Previously: `if (detailResponse.ok) setThreadDetails(...)` — a non-ok response left the
  // previous thread's messages rendered under the newly selected thread's title.
  assert.match(
    dashboard,
    /if \(!detailResponse\.ok\) \{[^]{0,160}setLoadState\("error"\)/,
    "a non-ok thread-messages response must be handled explicitly",
  );
});

test("load errors are caught rather than left as unhandled rejections", () => {
  assert.match(
    dashboard,
    /catch[^]{0,160}setLoadState\("error"\)/,
    "network failures inside load() must be caught and surfaced",
  );
});

test("does not blame pairing when machines exist (Buzz shared-room honesty)", () => {
  // "Pair a machine" is only valid when deviceCount === 0.
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
  // Receipt shows fence + machine (differentiation vs free team chat tools).
  assert.match(dashboard, /function taskReceiptLabel/);
  assert.match(dashboard, /fenced · 90s lease/);
  assert.match(dashboard, /data-testid="task-receipt"/);
});
