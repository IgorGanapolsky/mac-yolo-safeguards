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

test("leash panel is a compact run-target, not an account-switcher or legal dump", () => {
  const leash = dashboard.match(/id="leash-control"[\s\S]*?<\/section>/);
  assert.ok(leash, "expected #leash-control section");
  assert.match(leash[0], /Sends go to Hosted VPS/);
  assert.match(leash[0], /Send to a paired Mac instead/);
  assert.match(leash[0], /leash-signed-in/);
  assert.doesNotMatch(leash[0], /wrong workspace/);
  assert.doesNotMatch(leash[0], /Switch account/);
  assert.doesNotMatch(leash[0], /Optional: send the next task/);
  assert.doesNotMatch(leash[0], /Bounded Hermes thread context/);
  assert.doesNotMatch(leash[0], /isolated serverless leases/);
  assert.doesNotMatch(leash[0], /HOSTED_NOT_COMPUTER_HISTORY/);
  assert.doesNotMatch(leash[0], /privacy-boundary/);
  assert.doesNotMatch(leash[0], /account-recovery/);
  assert.doesNotMatch(leash[0], /style=\{\{/);
  assert.match(dashboard, /hosted-not-computer-history/);
  assert.match(dashboard, /id="execution-safety"/);
  assert.match(dashboard, /dashboard-sign-out/);
});
