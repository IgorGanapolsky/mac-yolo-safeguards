/**
 * Post-deploy production smoke (no auth / no desktop hijack).
 * Proves thumbgate.app serves the pair-copy UX: named hosts / honest unpaired Auto,
 * active Pair CTA — NOT stale "My computer" / disabled-send theater.
 *
 * Network-dependent; skip with THUMBGATE_PROD_SMOKE=0.
 * Fail-closed on stale prod: absence of new strings is a failed deploy, not a pass.
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

assert.match(js, /Which machine\?/);
// NEW pair-copy UX required (post-#1347). Stale "My computer" means deploy lag or failed ship.
assert.match(js, /needs a paired Mac first/);
assert.match(js, /Pair computer/);
assert.doesNotMatch(js, /My computer/);
assert.doesNotMatch(js, /Which Mac\?/);
assert.doesNotMatch(js, /My Mac only/);
assert.doesNotMatch(js, /Pair a Mac first/);
assert.doesNotMatch(js, /Add another Mac/);

console.log(
  JSON.stringify({
    ok: true,
    suite: "prod-dashboard-copy-smoke",
    base,
    dashboardClient: file,
    bytes: js.length,
    required: ["needs a paired Mac first", "Pair computer", "no My computer"],
  }),
);
