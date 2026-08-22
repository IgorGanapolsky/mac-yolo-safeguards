import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const layout = read("../app/dashboard/layout.tsx");
const component = read("../app/dashboard/ExecutionStatusline.tsx");
const styles = read("../app/dashboard/execution-statusline.module.css");
const route = read("../app/api/execution-statusline/route.ts");
const dashboard = read("../app/dashboard/DashboardClient.tsx");
const globals = read("../app/globals.css");
const runnerClaim = read("../app/api/runner/tasks/claim/route.ts");

test("private dashboard mounts a truthful latest-turn statusline", () => {
  assert.match(layout, /<ExecutionStatusline/);
  assert.match(component, /Turn Statusline/);
  for (const label of ["Engine", "Model", "Duration", "Tokens", "TTFT", "Cost"]) {
    assert.match(component, new RegExp(`>${label}<`));
  }
  assert.match(component, /document\.visibilityState/);
  assert.match(route, /requireSession\(\)/);
  assert.match(route, /organization_id = \?/);
  assert.match(route, /cache-control.*no-store/i);
  assert.doesNotMatch(dashboard, /ThumbGate online/i);
});

test("statusline and composer stay readable without horizontal page scrolling", () => {
  assert.match(styles, /flex-wrap:\s*wrap/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /max-width:\s*700px/);
  assert.match(globals, /\.quick-continuation-chips\s*\{[^}]*gap:/s);
  assert.match(globals, /\.quick-continuation-chips \.chips-scroll\s*\{[^}]*gap:/s);
  assert.match(globals, /\.composer\s*>\s*\.run-output\s*\{[^}]*display:\s*block/s);
});

test("runner claim derives a VPS-safe repository prompt without mutating stored task text", () => {
  assert.match(runnerClaim, /buildHostedExecutionPrompt/);
  assert.match(runnerClaim, /task:\s*\{[\s\S]*prompt:/);
  assert.doesNotMatch(runnerClaim, /UPDATE tasks|INSERT INTO tasks/);
});
