import assert from "node:assert/strict";
import test from "node:test";
import {
  GATED_ACTION_KINDS,
  HOSTED_PRIMITIVES,
  TRAIN_ON_CUSTOMER_RUNS,
  approveHosted,
  checkpointHosted,
  mayUseRunForTraining,
  recordRecoveredRun,
  resumeHosted,
  runHosted,
} from "../lib/hosted-primitives.mjs";

const NOW = 1_800_000_000_000;

test("four hosted primitives and no training on customer runs", () => {
  assert.deepEqual([...HOSTED_PRIMITIVES], ["run", "approve", "checkpoint", "resume"]);
  assert.equal(TRAIN_ON_CUSTOMER_RUNS, false);
  assert.equal(mayUseRunForTraining(), false);
  assert.deepEqual([...GATED_ACTION_KINDS], ["money", "customer", "production"]);
});

test("run is VPS-only and pauses gated actions", () => {
  assert.equal(runHosted({ runtime: "laptop", workId: "w1" }).reason, "not_vps");
  assert.equal(runHosted({ runtime: "vps" }).reason, "missing_work");
  assert.equal(runHosted({ runtime: "vps", workId: "w1", kind: "money" }).reason, "needs_approval");
  assert.deepEqual(runHosted({ runtime: "vps", workId: "w1", kind: "draft" }), {
    ok: true,
    primitive: "run",
    workId: "w1",
    runtime: "vps",
  });
});

test("approve only counts in thumbgate.app", () => {
  assert.equal(approveHosted({ workId: "w1", decision: "approve" }).reason, "wrong_surface");
  assert.equal(
    approveHosted({ workId: "w1", decision: "maybe", surface: "thumbgate.app" }).reason,
    "needs_decision",
  );
  assert.equal(
    approveHosted({ workId: "w1", decision: "deny", surface: "thumbgate.app" }).allowed,
    false,
  );
  assert.equal(
    approveHosted({ workId: "w1", decision: "approve", surface: "thumbgate.app" }).allowed,
    true,
  );
});

test("checkpoint and resume stay on the VPS and do not auto-approve gated work", () => {
  assert.equal(checkpointHosted({ runtime: "laptop", workId: "w1", state: {} }).reason, "not_vps");
  const saved = checkpointHosted({
    runtime: "vps",
    workId: "w1",
    kind: "production",
    state: { step: 2 },
    now: NOW,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.snapshot.gated, true);
  assert.equal(
    resumeHosted({ runtime: "laptop", snapshot: saved.snapshot, snapshotId: saved.snapshot.id }).reason,
    "not_vps",
  );
  assert.equal(
    resumeHosted({ runtime: "vps", snapshot: saved.snapshot, snapshotId: saved.snapshot.id }).reason,
    "needs_approval",
  );
  const resumed = resumeHosted({
    runtime: "vps",
    snapshot: saved.snapshot,
    snapshotId: saved.snapshot.id,
    approved: true,
  });
  assert.equal(resumed.recovered, true);
  assert.deepEqual(resumed.state, { step: 2 });
  assert.equal(recordRecoveredRun({ runtime: "laptop", snapshotId: saved.snapshot.id }).reason, "not_vps");
  assert.equal(recordRecoveredRun({ runtime: "vps", snapshotId: saved.snapshot.id }).metric, "recovered_run");
});
