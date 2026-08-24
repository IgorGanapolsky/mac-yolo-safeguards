import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  new URL("../app/dashboard/DashboardClient.tsx", import.meta.url),
  "utf8",
);

test("dashboard header does not show a fake always-green ThumbGate online chip", () => {
  assert.doesNotMatch(client, /ThumbGate online/);
  assert.doesNotMatch(client, /status-chip online/);
});
