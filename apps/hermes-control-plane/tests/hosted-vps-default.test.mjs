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
  assert.match(dashboard, /Pairing a Mac is optional/);
  assert.doesNotMatch(dashboard, /Which machine should run tasks/);
  assert.match(dashboard, /aria-label="Hosted VPS is the default run target"/);
  assert.match(dashboard, /<h2>Hosted VPS runner<\/h2>/);
  assert.doesNotMatch(dashboard, /<h2>Paired Hermes connectors<\/h2>/);
  assert.match(dashboard, /<details className="leash-device-picker"/);
  assert.match(dashboard, /<summary>Send to a paired Mac instead<\/summary>/);
  assert.match(dashboard, /<option value="cloud">Hosted VPS \(default\)<\/option>/);
  assert.doesNotMatch(dashboard, /HOSTED VPS IS THE DEFAULT/);
  assert.doesNotMatch(dashboard, /Hosted VPS is the default<\/label>/);
});
