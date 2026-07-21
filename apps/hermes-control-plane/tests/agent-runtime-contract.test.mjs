import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskLeases = readFileSync(new URL("../lib/task-leases.ts", import.meta.url), "utf8");
const deviceRenew = readFileSync(new URL("../app/api/device/tasks/renew/route.ts", import.meta.url), "utf8");
const runnerRenew = readFileSync(new URL("../app/api/runner/tasks/renew/route.ts", import.meta.url), "utf8");
const connector = readFileSync(new URL("../../../tools/hermes-cloud-connector.js", import.meta.url), "utf8");
const cloudRunner = readFileSync(new URL("../../../services/hermes-cloud-runner/server.js", import.meta.url), "utf8");
const dashboardLayout = readFileSync(new URL("../app/dashboard/layout.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const catalog = JSON.parse(readFileSync(new URL("../public/.well-known/ai-catalog.json", import.meta.url), "utf8"));

test("fails closed at the server boundary for every private dashboard route", () => {
  assert.match(dashboardLayout, /await currentSession\(\)/);
  assert.match(dashboardLayout, /if \(!session\) redirect\("\/api\/auth\/login\?return_to=%2Fdashboard"\)/);
  assert.match(dashboardLayout, /return children/);
});

test("makes the landing-page session state explicit without loading workspace telemetry", () => {
  assert.match(landing, /const session = await currentSession\(\)/);
  assert.match(landing, /const workspaceHref = session \? "\/dashboard" : "\/api\/auth\/login"/);
  assert.match(landing, />Open dashboard<\/Link>/);
  assert.match(landing, />Sign in<\/Link>/);
  assert.match(landing, /session \? "Session active" : "Sign-in required"/);
  assert.match(landing, /<form action="\/api\/auth\/logout" method="post">/);
  assert.match(landing, /type="submit"[^>]*>Sign out<\/button>/);
  assert.match(landing, /Sign out before leaving a shared device/);
  assert.match(landing, /href="#main-content">Skip to main content<\/a>/);
  assert.match(landing, /id="main-content"[^>]*tabIndex=\{-1\}/);
  assert.match(landing, /No workspace telemetry is fetched or rendered on this public page/);
  assert.doesNotMatch(landing, /fetch\("\/api\/(threads|tasks|devices|lessons|feedback)/);
});

test("enforces renewable leases and rejects completion after hard expiry", () => {
  assert.match(taskLeases, /export async function renewTask/);
  assert.match(taskLeases, /action: "task\.lease\.renew"/);
  assert.match(taskLeases, /AND lease_expires_at > \?/);
  assert.match(taskLeases, /lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL/);
  assert.match(deviceRenew, /requireDevice/);
  assert.match(runnerRenew, /runner authentication failed/);
  assert.match(connector, /\/api\/device\/tasks\/renew/);
  assert.match(cloudRunner, /\/api\/runner\/tasks\/renew/);
});

test("publishes a public-safe ARD 1.0 catalog", () => {
  assert.equal(catalog.specVersion, "1.0");
  assert.ok(Array.isArray(catalog.entries));
  assert.ok(catalog.entries.length > 0);
  for (const entry of catalog.entries) {
    assert.match(entry.identifier, /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/);
    assert.equal(typeof entry.displayName, "string");
    assert.match(entry.type, /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i);
    assert.equal(("url" in entry) !== ("data" in entry), true);
    assert.ok(entry.representativeQueries.length >= 2 && entry.representativeQueries.length <= 5);
  }
  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /tasks\/(claim|complete|renew)|thread-messages|api\/feedback|api\/lessons/);
  assert.doesNotMatch(serialized, /127\.0\.0\.1|localhost|privateKey|leaseToken|runnerToken/i);
});
