import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GATED_ACTION_KINDS } from "../lib/hosted-primitives.mjs";
import {
  GATEWAY_BUDGET,
  HOSTED_PROVIDER_FALLBACK,
  NAMED_FREE_FALLBACK,
  paidMetersForJob,
  resolveHostedFallback,
  shouldFirePaidMeter,
  shouldKeepCallingRoute,
} from "../lib/hosted-model-fallback.js";
import { HOSTED_GATE_LINES, trimHostedPrompt } from "../lib/hosted-prompt-trim.js";
import { certifyHostedLive } from "../lib/hosted-live-iis.js";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const tasksRoute = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
const apphost = readFileSync(new URL("../lib/hosted-apphost.ts", import.meta.url), "utf8");

test("fallback order is SuperGrok → DeepSeek free → Poolside", () => {
  assert.deepEqual(HOSTED_PROVIDER_FALLBACK.map((p) => p.id), [
    "supergrok",
    "deepseek-free",
    "poolside",
  ]);
  const hop = resolveHostedFallback({ lastError: "status=FAILED quota Weekly/Monthly Limit Exhausted" });
  assert.equal(hop.failover, true);
  assert.equal(hop.vpsDead, false);
  assert.equal(hop.selected.id, "deepseek-free");
});

test("gateway-budget fail-closes when spend is not approved", () => {
  assert.equal(GATEWAY_BUDGET, "gateway-budget");
  assert.equal(shouldKeepCallingRoute({ spendUsd: 3, spendApproved: false }), false);
  const cert = certifyHostedLive({
    runnerHealthy: true,
    modelAlive: true,
    spendUsd: 3,
    spendApproved: false,
  });
  assert.equal(cert.live, false);
  assert.ok(cert.IISConstrName.includes("gateway-budget"));
});

test("claiming live is false when runner or model is down", () => {
  assert.equal(certifyHostedLive({ runnerHealthy: false, modelAlive: true, spendUsd: 0 }).live, false);
  assert.equal(certifyHostedLive({ runnerHealthy: true, modelAlive: false, spendUsd: 0 }).live, false);
});

test("named runner identity fail-closes on a generic shared account", () => {
  const cert = certifyHostedLive({
    runnerHealthy: true,
    modelAlive: true,
    spendUsd: 0,
    runnerIdentity: "shared",
  });
  assert.equal(cert.live, false);
  assert.ok(cert.IISConstrName.includes("runner_identity"));
  assert.match(dashboard, /runnerIdentity:\s*hostedRunner\?\.identity/);
  assert.match(dashboard, /data-testid="hosted-runner-status"/);
});

test("trimmed prompt is shorter and keeps spend=0 / approval gate lines", () => {
  const unused = "Unused Tavily preamble that must not ship. ".repeat(20) + "\n";
  const junk = "<unused-tools>otel_export grafana_push mcp_gateway</unused-tools>\n<unused-system>Claude Managed Agents clone</unused-system>";
  const out = trimHostedPrompt({
    system: `Hosted Hermes.\n${unused}${junk}`,
    tools: [{ name: "tavily_search", preamble: unused }],
    usedTools: [],
  });
  assert.ok(out.trimmedLength < out.originalLength);
  for (const line of HOSTED_GATE_LINES) assert.match(out.system, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(out.system, /Spend is \$0/);
  assert.match(out.system, /approval/);
});

test("does not weaken persist-before-live or the money/customer/production gate", () => {
  assert.match(tasksRoute, /ackHostedSend/);
  assert.match(tasksRoute, /if \(!ack\.ok\) return jsonError\(ack\.message, 409\)/);
  assert.doesNotMatch(tasksRoute, /probeRunnerHealth/);
  assert.doesNotMatch(tasksRoute, /probeBrowserHealth/);
  assert.match(apphost, /certifyHostedLive/);
  assert.deepEqual([...GATED_ACTION_KINDS], ["money", "customer", "production"]);
});

test("named fallback covering a job does not fire two paid meters", () => {
  assert.equal(NAMED_FREE_FALLBACK, "deepseek-free");
  const hop = resolveHostedFallback({ lastError: "status=FAILED quota Weekly/Monthly Limit Exhausted" });
  assert.equal(hop.selected.id, "deepseek-free");
  assert.deepEqual(paidMetersForJob({ lastError: "status=FAILED quota Weekly/Monthly Limit Exhausted" }), []);
  assert.equal(shouldFirePaidMeter({ lastError: hop.failedProviders.join(","), meters: ["supergrok", "poolside"] }), false);
  assert.equal(shouldKeepCallingRoute({ meters: ["supergrok", "poolside"] }), false);
  assert.equal(shouldFirePaidMeter({ meter: "chatgpt-plus" }), false);
});
