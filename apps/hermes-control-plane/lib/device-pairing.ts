/**
 * Device pairing helpers — fingerprint reuse so re-approving the same Mac
 * never creates a second ghost row with the same hostname.
 */

export type FailoverMode = "disabled" | "manual" | "auto";

export type ExistingDevice = {
  id: string;
  failoverMode: string;
  revokedAt: number | null;
};

export type PairingDecision =
  | {
      kind: "reuse";
      deviceId: string;
      failoverMode: FailoverMode;
      reused: true;
    }
  | {
      kind: "create";
      deviceId: string;
      failoverMode: FailoverMode;
      reused: false;
    };

export function isFailoverMode(value: string): value is FailoverMode {
  return value === "disabled" || value === "manual" || value === "auto";
}

/**
 * Decide whether to reuse an existing device row (same org + fingerprint)
 * or mint a new device id.
 *
 * When reviving a previously revoked row, apply the org's current default
 * failover mode. When reusing an active row, keep the user's offline policy.
 */
export function decideDevicePairing(options: {
  existing: ExistingDevice | null;
  defaultFailover: FailoverMode;
  newDeviceId: string;
}): PairingDecision {
  const { existing, defaultFailover, newDeviceId } = options;
  if (!existing) {
    return {
      kind: "create",
      deviceId: newDeviceId,
      failoverMode: defaultFailover,
      reused: false,
    };
  }
  const failoverMode = existing.revokedAt == null && isFailoverMode(existing.failoverMode)
    ? existing.failoverMode
    : defaultFailover;
  return {
    kind: "reuse",
    deviceId: existing.id,
    failoverMode,
    reused: true,
  };
}

/** Online when a heartbeat arrived within the last 60s (matches /api/devices). */
export function isDeviceOnline(lastSeenAt: number | null, now = Date.now()): boolean {
  return Boolean(lastSeenAt && now - lastSeenAt < 60_000);
}

/** Stale: has heartbeated before but has been quiet for 2+ hours. */
export function isDeviceStale(lastSeenAt: number | null, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  if (isDeviceOnline(lastSeenAt, now)) return false;
  return now - lastSeenAt >= 2 * 60 * 60 * 1000;
}

export function devicePresenceLabel(lastSeenAt: number | null, now = Date.now()): "online" | "stale" | "offline" {
  if (isDeviceOnline(lastSeenAt, now)) return "online";
  if (isDeviceStale(lastSeenAt, now)) return "stale";
  return "offline";
}
