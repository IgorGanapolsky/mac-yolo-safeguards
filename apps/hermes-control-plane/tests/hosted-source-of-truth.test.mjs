import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOSTED_SOURCE_OF_TRUTH,
  HOSTED_TRUST_STATES,
  ackHostedSend,
  advertiseHostedPaid,
  isLaptopCache,
  isTurningOn,
  pairQueryNotice,
  publicRunReceipt,
  trustFromResource,
} from "../lib/hosted-source-of-truth.ts";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const tasksRoute = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
const healthRoute = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
const meRoute = readFileSync(new URL("../app/api/me/route.ts", import.meta.url), "utf8");
const apphost = readFileSync(new URL("../lib/hosted-apphost.ts", import.meta.url), "utf8");
const truth = readFileSync(new URL("../lib/hosted-source-of-truth.ts", import.meta.url), "utf8");
const stolen = `${dashboard}\n${tasksRoute}\n${healthRoute}\n${apphost}\n${truth}`;

test("source of truth is the hosted VPS, not a laptop cache", () => {
  assert.equal(HOSTED_SOURCE_OF_TRUTH, "hosted-vps");
  assert.equal(isLaptopCache("laptop"), true);
  assert.equal(isLaptopCache("mac"), true);
  assert.equal(isLaptopCache("vps"), false);
  assert.equal(isLaptopCache("cloud"), false);
  assert.equal(pairQueryNotice("ABCD-EFGH"), null);
});

test("does not ack a cloud send until it is persisted on the VPS", () => {
  assert.equal(ackHostedSend({ runtime: "laptop", persistedId: "t1" }).reason, "laptop_is_cache");
  assert.equal(ackHostedSend({ runtime: "vps", admitted: false, persistedId: "t1" }).reason, "not_admitted");
  assert.equal(ackHostedSend({ runtime: "vps", admitted: true }).reason, "not_persisted");
  assert.deepEqual(ackHostedSend({ runtime: "vps", admitted: true, persistedId: "task-1" }), {
    ok: true,
    live: true,
    persistedId: "task-1",
  });
});

test("cloud task create gates 201 on persist-before-live ack and a redacted receipt", () => {
  assert.match(tasksRoute, /ackHostedSend/);
  assert.match(tasksRoute, /publicRunReceipt/);
  assert.match(tasksRoute, /if \(!ack\.ok\) return jsonError\(ack\.message, 409\)/);
  assert.match(dashboard, /searchParams\.delete\("pair"\)/);
  assert.doesNotMatch(dashboard, /Machine found/);
  assert.doesNotMatch(dashboard, /Verify its name, then approve the prefilled code/);
});

test("trust states are verified, reachable, or failed and tied to runtime proof", () => {
  assert.deepEqual([...HOSTED_TRUST_STATES], ["verified", "reachable", "failed"]);
  assert.equal(trustFromResource("healthy"), "verified");
  assert.equal(trustFromResource("waiting"), "reachable");
  assert.equal(trustFromResource("unhealthy"), "failed");
  assert.equal(advertiseHostedPaid({ runnerTrust: "verified", modelTrust: "verified" }), true);
  assert.equal(advertiseHostedPaid({ runnerTrust: "verified", modelTrust: "failed" }), false);
  assert.equal(advertiseHostedPaid({ runnerTrust: "reachable", modelTrust: "verified" }), false);
  assert.equal(advertiseHostedPaid({ runnerTrust: "verified", modelTrust: "verified", stripeConfigured: false }), false);
  assert.equal(advertiseHostedPaid({ runnerTrust: "verified", modelTrust: "verified", cacheKnown: false }), false);
  assert.equal(advertiseHostedPaid({ runnerTrust: "verified", modelTrust: "verified", httpsTrusted: false }), false);
  assert.equal(isTurningOn({ cacheKnown: false }), true);
  assert.equal(isTurningOn({ runnerTrust: "verified", modelTrust: "verified" }), false);
});

test("public receipt never includes the prompt or env secrets", () => {
  const receipt = publicRunReceipt({
    taskId: "task-1",
    route: "cloud",
    status: "pending",
    prompt: "SECRET PROMPT TEXT",
  });
  assert.equal(receipt.ok, true);
  assert.equal("prompt" in receipt, false);
  assert.equal(JSON.stringify(receipt).includes("SECRET PROMPT TEXT"), false);
  assert.equal(receipt.lastMile.clonedTower, false);
  assert.equal(receipt.lastMile.liveClaim, false);
  assert.equal(receipt.lastMile.foundation, "owned");
  assert.equal(receipt.lastMile.stableUrl, "https://thumbgate.app/dashboard?task=task-1");
  assert.equal(publicRunReceipt({}).reason, "not_persisted");
  process.env.OPENAI_API_KEY = "sk-test-should-never-leak";
  const leaked = JSON.stringify(receipt);
  assert.equal(leaked.includes("sk-test-should-never-leak"), false);
  assert.equal(leaked.includes("OPENAI_API_KEY"), false);
});

test("health is cache-only and does not advertise paid unless verified", () => {
  assert.match(healthRoute, /advertisePaid/);
  assert.match(healthRoute, /publicHealthFromCache/);
  assert.match(healthRoute, /scope: "liveness"/);
  assert.doesNotMatch(healthRoute, /probeRunnerHealth/);
  assert.match(apphost, /cachedRunnerHealth/);
  assert.match(apphost, /advertisePaid/);
  assert.match(apphost, /trustFromResource/);
});

test("does not steal a crypto marketplace or invent traction", () => {
  assert.doesNotMatch(stolen, /\bOrigin\b/);
  assert.doesNotMatch(stolen, /\bSpokes\b/);
  assert.doesNotMatch(truth, /\bContinuity\b/);
  assert.doesNotMatch(stolen, /x402|USDC|managed-wallet|Triptych|agent marketplace/i);
  assert.doesNotMatch(stolen, /Chrome Web Store|lid-close|Team \$49/);
  assert.doesNotMatch(stolen, /poolside|tailscale|acp|laguna|\bmlx\b/i);
});

test("identity /api/me is cache-only and does not await Fly probes", () => {
  assert.match(meRoute, /cachedRunnerHealth/);
  assert.doesNotMatch(meRoute, /probeRunnerHealth/);
  assert.doesNotMatch(meRoute, /probeBrowserHealth/);
  assert.match(meRoute, /authenticated: true/);
});

test("task create persists before live and does not await Fly probes", () => {
  assert.match(tasksRoute, /ackHostedSend/);
  assert.match(tasksRoute, /if \(!ack\.ok\) return jsonError\(ack\.message, 409\)/);
  assert.doesNotMatch(tasksRoute, /probeRunnerHealth/);
  assert.doesNotMatch(tasksRoute, /probeBrowserHealth/);
  assert.doesNotMatch(tasksRoute, /force: true/);
});
