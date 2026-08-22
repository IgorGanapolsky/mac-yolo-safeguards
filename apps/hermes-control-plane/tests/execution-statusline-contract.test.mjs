import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const dashboard = read("../app/dashboard/DashboardClient.tsx");
const globals = read("../app/globals.css");
const runnerClaim = read("../app/api/runner/tasks/claim/route.ts");

test("dashboard does not make a generic whole-product health promise", () => {
  assert.doesNotMatch(dashboard, /ThumbGate online/i);
});

test("continuation prompts and output stay readable without horizontal page scrolling", () => {
  assert.match(globals, /\.quick-continuation-chips\s*\{[^}]*gap:/s);
  assert.match(globals, /\.quick-continuation-chips \.chips-scroll\s*\{[^}]*gap:/s);
  assert.match(globals, /\.composer\s*>\s*\.run-output\s*\{[^}]*display:\s*block/s);
});

test("runner claim derives a VPS-safe repository prompt without mutating stored task text", () => {
  assert.match(runnerClaim, /buildHostedExecutionPrompt/);
  assert.match(runnerClaim, /task:\s*\{[\s\S]*prompt:/);
  assert.doesNotMatch(runnerClaim, /UPDATE tasks|INSERT INTO tasks/);
});
