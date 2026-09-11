import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("hosted VPS is the default run target and never auto-picks a paired Mac", () => {
  assert.match(dashboard, /function pickDefaultDeviceId\([\s\S]*?\)\s*:\s*string\s*\{\s*return "";\s*\}/);
  assert.match(dashboard, /routePreference: "cloud"/);
  assert.match(dashboard, /deviceOverrideId && devices\.some/);
  assert.doesNotMatch(dashboard, /deviceId: selectedDeviceId \|\| undefined/);
  assert.match(dashboard, /data-testid="hosted-run-default"/);
  assert.match(dashboard, /Sends always run on Hosted VPS/);
  assert.match(dashboard, /cloud work syncs back/);
  assert.doesNotMatch(dashboard, /Which machine should run tasks/);
  assert.match(dashboard, /aria-label="Hosted VPS always runs sends; Mac is for session sync"/);
  assert.match(dashboard, /<h2[^>]*>Hosted VPS runner<\/h2>/);
  assert.doesNotMatch(dashboard, /<h2>Paired Hermes connectors<\/h2>/);
  assert.match(dashboard, /<details className="leash-device-picker"/);
  assert.match(dashboard, /<summary>Prefer a Mac for session sync<\/summary>/);
  assert.match(dashboard, /<option value="cloud">Hosted VPS \(default\)<\/option>/);
  assert.doesNotMatch(dashboard, /Send to a paired Mac instead/);
  assert.doesNotMatch(dashboard, /routePreference: "local"/);
  assert.doesNotMatch(dashboard, /HOSTED VPS IS THE DEFAULT/);
  assert.doesNotMatch(dashboard, /Hosted VPS is the default<\/label>/);
});
