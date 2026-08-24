/**
 * Hosted Hermes primitives. You own the work. We own the machine.
 *
 * Four verbs: run, approve, checkpoint, resume.
 * Checkpoint and resume only fire on the hosted VPS.
 * Money, customer, and production actions never auto-run.
 * We do not train our models on your runs.
 * Hosted `completed` is not quality (TINKER-DEPLOY-OK analog lives in distill).
 */

import { distillHostedPrompt as distillPrompt, gradeHostedTask as gradeTask } from "./hosted-prompt-distill.mjs";

export const HOSTED_PRIMITIVES = Object.freeze(["run", "approve", "checkpoint", "resume"]);
export const TRAIN_ON_CUSTOMER_RUNS = false;
export const GATED_ACTION_KINDS = Object.freeze(["money", "customer", "production"]);

export {
  HOSTED_COMPLETED_IS_NOT_QUALITY,
  HOST_EXECUTES_TOOLS,
  distillHostedPrompt,
  gradeHostedTask,
} from "./hosted-prompt-distill.mjs";

export function mayUseRunForTraining() {
  return TRAIN_ON_CUSTOMER_RUNS;
}

function isVps(runtime) {
  return runtime === "vps";
}

function normalizeKind(kind) {
  return String(kind || "").trim().toLowerCase();
}

export function isGatedAction(kind) {
  return GATED_ACTION_KINDS.includes(normalizeKind(kind));
}

export function runHosted(input = {}) {
  if (!isVps(input.runtime)) {
    return { ok: false, reason: "not_vps" };
  }
  const workId = String(input.workId || "").trim();
  if (!workId) {
    return { ok: false, reason: "missing_work" };
  }
  if (isGatedAction(input.kind)) {
    return { ok: false, reason: "needs_approval", workId, kind: normalizeKind(input.kind) };
  }
  if (input.system != null || input.context != null || input.source) {
    const distilled = distillPrompt(input);
    if (!distilled.ok) return distilled;
    const graded = gradeTask({ status: "running" });
    return {
      ok: true,
      primitive: "run",
      workId,
      runtime: "vps",
      quality: graded.quality,
      completedIsNotQuality: true,
      distilled,
    };
  }
  const graded = gradeTask({ status: "running" });
  return {
    ok: true,
    primitive: "run",
    workId,
    runtime: "vps",
    quality: graded.quality,
    completedIsNotQuality: true,
  };
}

export function approveHosted(input = {}) {
  const workId = String(input.workId || "").trim();
  const decision = String(input.decision || "").trim().toLowerCase();
  if (!workId) {
    return { ok: false, reason: "missing_work" };
  }
  if (input.surface !== "thumbgate.app") {
    return { ok: false, reason: "wrong_surface" };
  }
  if (decision !== "approve" && decision !== "deny") {
    return { ok: false, reason: "needs_decision" };
  }
  if (decision === "deny") {
    return { ok: true, primitive: "approve", workId, allowed: false };
  }
  return { ok: true, primitive: "approve", workId, allowed: true };
}

export function checkpointHosted(input = {}) {
  if (!isVps(input.runtime)) {
    return { ok: false, reason: "not_vps" };
  }
  const workId = String(input.workId || "").trim();
  const state = input.state;
  if (!workId || state == null || typeof state !== "object") {
    return { ok: false, reason: "invalid_state" };
  }
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  return {
    ok: true,
    primitive: "checkpoint",
    snapshot: {
      id: `ckpt_${workId}_${now.toString(36)}`,
      workId,
      createdAt: now,
      kind: normalizeKind(input.kind) || "work",
      gated: isGatedAction(input.kind),
      state,
    },
  };
}

export function resumeHosted(input = {}) {
  if (!isVps(input.runtime)) {
    return { ok: false, reason: "not_vps" };
  }
  const snapshot = input.snapshot;
  const wanted = String(input.snapshotId || "").trim();
  if (!snapshot || snapshot.id !== wanted) {
    return { ok: false, reason: "missing_snapshot" };
  }
  if (snapshot.gated && input.approved !== true) {
    return {
      ok: false,
      reason: "needs_approval",
      workId: snapshot.workId,
      snapshotId: snapshot.id,
    };
  }
  return {
    ok: true,
    primitive: "resume",
    workId: snapshot.workId,
    snapshotId: snapshot.id,
    state: snapshot.state,
    recovered: true,
  };
}

export function recordRecoveredRun(input = {}) {
  if (!isVps(input.runtime)) {
    return { ok: false, reason: "not_vps" };
  }
  const snapshotId = String(input.snapshotId || "").trim();
  if (!snapshotId) {
    return { ok: false, reason: "no_checkpoint" };
  }
  return { ok: true, metric: "recovered_run", snapshotId };
}
