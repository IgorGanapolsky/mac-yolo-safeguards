/**
 * Post-deploy production smoke (no auth / no desktop hijack).
 * Proves thumbgate.app serves hosted Hermes on a fenced VPS — not Mac-pair / Continuity sell.
 *
 * Network-dependent; skip with THUMBGATE_PROD_SMOKE=0.
 * Fail-closed: leftover pair-picker strings = failed/stale offer.
 */
import assert from "node:assert/strict";

const base = process.env.THUMBGATE_APP_URL || "https://thumbgate.app";
if (process.env.THUMBGATE_PROD_SMOKE === "0") {
  console.log("prod-dashboard-copy-smoke skipped (THUMBGATE_PROD_SMOKE=0)");
  process.exit(0);
}

const health = await fetch(`${base}/api/health`);
assert.equal(health.status, 200, `health ${health.status}`);
const healthBody = await health.json();
assert.equal(healthBody.ok, true);

const manifestRes = await fetch(`${base}/.vite/manifest.json`);
assert.equal(manifestRes.status, 200, "manifest missing");
const manifest = await manifestRes.json();
let file = null;
for (const [key, value] of Object.entries(manifest)) {
  if (key.includes("DashboardClient") || value?.file?.includes("DashboardClient")) {
    file = value.file;
    break;
  }
}
assert.ok(file, "DashboardClient not in manifest");
const jsUrl = file.startsWith("http") ? file : `${base}/${file.replace(/^\//, "")}`;
const jsRes = await fetch(jsUrl);
assert.equal(jsRes.status, 200, jsUrl);
const js = await jsRes.text();

// Pin the current offer. Do not require deleted Mac-pair copy.
assert.match(js, /Cloud VPS|hosted VPS|hosted Hermes/);
assert.doesNotMatch(js, /Which machine\?/);
assert.doesNotMatch(js, /Which Mac\?/);
assert.doesNotMatch(js, /My computer/);
assert.doesNotMatch(js, /My Mac only/);
assert.doesNotMatch(js, /Pair a Mac first/);
assert.doesNotMatch(js, /Add another Mac/);
assert.doesNotMatch(js, /needs a paired Mac first/);
assert.doesNotMatch(js, /Open Continuity settings/);

console.log(
  JSON.stringify({
    ok: true,
    suite: "prod-dashboard-copy-smoke",
    base,
    dashboardClient: file,
    bytes: js.length,
    required: ["hosted VPS / Cloud VPS", "no Which machine?", "no pair-Mac sell"],
  }),
);
