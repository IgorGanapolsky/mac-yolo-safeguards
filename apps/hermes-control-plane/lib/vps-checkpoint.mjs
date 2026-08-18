/**
 * Qoder steal: execution snapshots only make sense on the hosted VPS.
 * Laptop / unknown runtimes cannot checkpoint. Rollback is by snapshot id.
 */
export const CHECKPOINT_INTERVAL_HINT = "per_turn";

export function canCheckpoint(runtime) {
  return runtime === "vps";
}

export function takeCheckpoint(input) {
  if (!canCheckpoint(input?.runtime)) {
    return { ok: false, reason: "not_vps" };
  }
  const turn = String(input?.turnId || "").trim();
  const state = input?.state;
  if (!turn || state == null || typeof state !== "object") {
    return { ok: false, reason: "invalid_state" };
  }
  const now = Number.isFinite(input?.now) ? input.now : Date.now();
  return {
    ok: true,
    snapshot: {
      id: `ckpt_${turn}_${now.toString(36)}`,
      turnId: turn,
      createdAt: now,
      state,
    },
  };
}

export function restoreCheckpoint(input) {
  const snapshot = input?.snapshot;
  const wanted = String(input?.snapshotId || "").trim();
  if (!snapshot || snapshot.id !== wanted) {
    return { ok: false, reason: "missing_snapshot" };
  }
  if (!canCheckpoint(input?.runtime)) {
    return { ok: false, reason: "not_vps" };
  }
  return { ok: true, turnId: snapshot.turnId, state: snapshot.state };
}
