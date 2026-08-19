import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOSTED_SOURCE_OF_TRUTH,
  ackHostedSend,
  isLaptopCache,
  pairQueryNotice,
} from "../lib/hosted-source-of-truth.ts";

const dashboard = readFileSync(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8");
const tasksRoute = readFileSync(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8");
const truth = readFileSync(new URL("../lib/hosted-source-of-truth.ts", import.meta.url), "utf8");
const stolen = `${dashboard}\n${tasksRoute}\n${truth}`;

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
  assert.equal(ackHostedSend({ runtime: "vps", persistedId: "task-1" }).ok, true);
});

test("cloud task create gates 201 on persist-before-live ack", () => {
  assert.match(tasksRoute, /ackHostedSend/);
  assert.match(tasksRoute, /from "@\/lib\/hosted-source-of-truth"/);
  assert.match(tasksRoute, /if \(!ack\.ok\) return jsonError\(ack\.message, 409\)/);
  assert.match(dashboard, /searchParams\.delete\("pair"\)/);
  assert.doesNotMatch(dashboard, /Machine found/);
  assert.doesNotMatch(dashboard, /Verify its name, then approve the prefilled code/);
});

test("does not name Cursor git hosting or Mac-pair as the product", () => {
  assert.doesNotMatch(stolen, /\bOrigin\b/);
  assert.doesNotMatch(stolen, /\bSpokes\b/);
  assert.doesNotMatch(truth, /\bContinuity\b/);
  assert.doesNotMatch(stolen, /Chrome Web Store|lid-close|Team \$49/);
});
