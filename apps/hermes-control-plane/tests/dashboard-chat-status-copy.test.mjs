import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("user bubble does not dump cloud_pending next to SENT", () => {
  assert.match(dashboard, /<span>You<\/span>/);
  assert.match(dashboard, /taskPromptMeta\(task\)/);
  assert.doesNotMatch(
    dashboard,
    /role-user[\s\S]{0,400}task-status status-\$\{task\.status\}/,
  );
  assert.doesNotMatch(dashboard, /Waiting for the fenced VPS runner to pick this up/);
  assert.match(dashboard, /pendingWaitCopy\(task\.status\)/);
  assert.match(dashboard, /data-testid="conversation-pending"/);
});

test("pairing and account live in Settings, not an always-on Leash essay", () => {
  assert.doesNotMatch(dashboard, /id="leash-control"/);
  assert.doesNotMatch(dashboard, /id="execution-safety"/);
  assert.doesNotMatch(dashboard, /HOSTED HERMES/);
  assert.doesNotMatch(dashboard, /What “Fenced” means/);
  assert.match(dashboard, /Sends always run on Hosted VPS/);
  assert.match(dashboard, /Prefer a Mac for session sync/);
  assert.match(dashboard, /leash-signed-in/);
  assert.match(dashboard, /id="web-settings"/);
  assert.match(dashboard, /dashboard-sign-out/);
  assert.doesNotMatch(dashboard, /wrong workspace/);
  assert.doesNotMatch(dashboard, /Switch account/);
});
