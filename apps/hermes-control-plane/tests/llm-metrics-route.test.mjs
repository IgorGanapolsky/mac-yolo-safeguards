import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/llm-metrics/route.ts", import.meta.url), "utf8");

test("LLM metrics route uses bounded task metadata instead of the absent llm_calls pipeline", () => {
  assert.match(route, /FROM tasks/);
  assert.match(route, /LIMIT \?/);
  assert.match(route, /TASK_METRICS_SAMPLE_LIMIT/);
  assert.doesNotMatch(route, /FROM llm_calls/);
  assert.doesNotMatch(route, /AVG\(latency_ms\)/);
  assert.doesNotMatch(route, /MAX\(latency_ms\)/);
});

test("LLM metrics route never reads task content", () => {
  const select = route.match(/`SELECT([\s\S]*?)FROM tasks/)?.[1] ?? "";
  assert.notEqual(select, "", "expected the bounded task metadata SELECT");
  assert.doesNotMatch(select, /\bprompt\b/i);
  assert.doesNotMatch(select, /\bresult\b/i);
  assert.doesNotMatch(select, /\berror\b/i);
});

test("LLM metrics response is private and delegates exact aggregation to the pure helper", () => {
  assert.match(route, /summarizeAgentTaskRuns/);
  assert.match(route, /Cache-Control/);
  assert.match(route, /private, no-store/);
});
