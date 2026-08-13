/**
 * Post-deploy production smoke (no auth / no desktop hijack).
 * Proves thumbgate.app serves pair-copy UX — not stale "My computer".
 *
 * Network-dependent; skip with THUMBGATE_PROD_SMOKE=0.
 * Fail-closed: missing new strings = failed/stale deploy.
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

// Pin the behaviour the UI must express, not strings that were since deleted.
// "needs a paired Mac first" was removed on purpose: Continuity runs on the Cloud
// VPS without any paired machine (DashboardClient: "Continuity never requires a
// paired Mac"). Asserting its presence made this suite unpassable, so it is now
// inverted into a regression guard against re-gating Continuity on pairing.
assert.match(js, /Which machine\?/);
assert.match(js, /No computer paired yet/);
assert.match(js, /Pair computer/);
assert.match(js, /Cloud VPS/);
assert.doesNotMatch(js, /My computer/);
assert.doesNotMatch(js, /Which Mac\?/);
assert.doesNotMatch(js, /My Mac only/);
assert.doesNotMatch(js, /Pair a Mac first/);
assert.doesNotMatch(js, /Add another Mac/);
assert.doesNotMatch(js, /needs a paired Mac first/);

console.log(
  JSON.stringify({
    ok: true,
    suite: "prod-dashboard-copy-smoke",
    base,
    dashboardClient: file,
    bytes: js.length,
    required: ["Which machine?", "No computer paired yet", "Pair computer", "Cloud VPS", "no My computer"],
  }),
);
