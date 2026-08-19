import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DO_NOT_STEAL,
  PUBLIC_METRIC,
  REFUSE_STEALS,
  clientVisibleHealth,
  cursorHijack,
  denyHostMouse,
  publicHostedMetric,
  publicRunReceipt,
  refuseProductSteal,
  runtimeIsLaptop,
} from "../lib/hosted-sandbox-policy.ts";

const policySrc = readFileSync(new URL("../lib/hosted-sandbox-policy.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const cloudPolicy = readFileSync(new URL("../lib/cloud-tool-policy.ts", import.meta.url), "utf8");
const productFiles = `${policySrc}\n${page}\n${dashboard}\n${cloudPolicy}`;

test("idle laptop is not the runtime and cursor hijack is denied", () => {
  assert.equal(runtimeIsLaptop, false);
  assert.equal(cursorHijack, false);
  assert.equal(PUBLIC_METRIC, "recoveredRun");
  assert.deepEqual(publicHostedMetric(), { metric: "recoveredRun" });
  assert.equal(JSON.stringify(publicHostedMetric()).includes("sandbox"), false);
  assert.equal(JSON.stringify(publicHostedMetric()).includes("create"), false);
});

test("publicRunReceipt strips keys and never echoes credentials", () => {
  process.env.OPENAI_API_KEY = "sk-test-should-never-leak";
  const receipt = publicRunReceipt({
    taskId: "task-1",
    route: "cloud",
    status: "pending",
    prompt: "SECRET PROMPT TEXT",
    apiKey: "sk-live-leaked",
    token: "ghp_leaked",
    authorization: "Bearer leaked-token",
    OPENAI_API_KEY: "sk-env-leaked",
  });
  assert.equal(receipt.ok, true);
  if (!receipt.ok) throw new Error("expected ok receipt");
  assert.equal("prompt" in receipt, false);
  assert.equal("apiKey" in receipt, false);
  assert.equal("token" in receipt, false);
  assert.equal("authorization" in receipt, false);
  assert.equal("OPENAI_API_KEY" in receipt, false);
  const leaked = JSON.stringify(receipt);
  assert.equal(leaked.includes("SECRET PROMPT TEXT"), false);
  assert.equal(leaked.includes("sk-live-leaked"), false);
  assert.equal(leaked.includes("ghp_leaked"), false);
  assert.equal(leaked.includes("Bearer leaked-token"), false);
  assert.equal(leaked.includes("sk-env-leaked"), false);
  assert.equal(leaked.includes("sk-test-should-never-leak"), false);
  assert.equal(leaked.includes("OPENAI_API_KEY"), false);
  assert.equal(receipt.runtimeIsLaptop, false);
  assert.equal(receipt.cursorHijack, false);
  assert.equal(receipt.metric, "recoveredRun");
  assert.equal(publicRunReceipt({}).reason, "not_persisted");
});

test("advertisePaid is false while turning on", () => {
  const turningOn = clientVisibleHealth({
    turningOn: true,
    runnerTrust: "verified",
    modelTrust: "verified",
    token: "sk-health-leak",
    apiKey: "rk-health-leak",
  });
  assert.equal(turningOn.turningOn, true);
  assert.equal(turningOn.advertisePaid, false);
  assert.equal(turningOn.runtimeIsLaptop, false);
  assert.equal(JSON.stringify(turningOn).includes("sk-health-leak"), false);
  assert.equal(JSON.stringify(turningOn).includes("rk-health-leak"), false);

  const unknown = clientVisibleHealth({ runnerTrust: "reachable", modelTrust: "reachable" });
  assert.equal(unknown.turningOn, true);
  assert.equal(unknown.advertisePaid, false);

  const live = clientVisibleHealth({ runnerTrust: "verified", modelTrust: "verified" });
  assert.equal(live.turningOn, false);
  assert.equal(live.advertisePaid, true);
  assert.equal(live.metric, "recoveredRun");
});

test("denies grabbing the host mouse on the user machine", () => {
  const xdo = denyHostMouse({ command: "xdotool mousemove 10 10", target: "user-machine" });
  assert.equal(xdo.allowed, false);
  assert.equal(xdo.reason, "host_mouse_denied");
  assert.equal(denyHostMouse({ command: "cliclick c:100,200", target: "user-machine" }).allowed, false);
  assert.equal(
    denyHostMouse({
      command: "osascript -e tell mouse to click",
      target: "user-machine",
    }).allowed,
    false,
  );
  assert.equal(denyHostMouse({ command: "xdotool mousemove 1 1", target: "hosted-vps" }).allowed, true);
  assert.equal(denyHostMouse({ command: "git status", target: "user-machine" }).allowed, true);
  assert.equal(denyHostMouse({ command: "xdotool click 1" }).cursorHijack, false);
});

test("product files do-not-steal list includes competitor clones", () => {
  for (const item of ["openclaw", "eigent", "e2b", "trycua", "perplexity computer"]) {
    assert.ok(DO_NOT_STEAL.includes(item), `missing ${item}`);
    assert.match(policySrc, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(productFiles, /openclaw/i);
  assert.match(productFiles, /eigent/i);
  assert.match(productFiles, /e2b/i);
  assert.match(productFiles, /trycua/i);
  assert.match(productFiles, /perplexity computer/i);
});

test("refuses OpenClaw, Eigent, E2B, Cua, Agent S, swarm, Telegram gateway", () => {
  assert.deepEqual(
    [...REFUSE_STEALS],
    [
      "openclaw install",
      "eigent desktop",
      "e2b desktop sandbox",
      "cua drivers",
      "agent s",
      "20-model supervisor",
      "telegram gateway",
    ],
  );
  const refusals = [
    "OpenClaw install",
    "Eigent desktop",
    "E2B Desktop Sandbox",
    "Cua drivers",
    "Agent S",
    "20-model supervisor",
    "Telegram gateway as approval surface",
  ];
  for (const intent of refusals) {
    const decision = refuseProductSteal(intent);
    assert.equal(decision.allowed, false, intent);
    if (decision.allowed) throw new Error(intent);
    assert.equal(decision.reason, "do_not_steal");
  }
  assert.equal(refuseProductSteal("hosted hermes overnight coding").allowed, true);
});

test("landing and dashboard do not ship stolen product nouns", () => {
  assert.doesNotMatch(page, /openclaw|eigent|trycua|\be2b\b|perplexity computer|agent s|20-model supervisor/i);
  assert.doesNotMatch(dashboard, /openclaw|eigent|trycua|\be2b\b|perplexity computer/i);
  assert.doesNotMatch(page, /AI workforce|connector marketplace|\$200 comparison|Slack as the control/i);
  assert.match(cloudPolicy, /vscode_extension/);
  assert.match(cloudPolicy, /xdotool|cliclick/);
});
