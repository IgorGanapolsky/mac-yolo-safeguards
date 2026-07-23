/**
 * Explicit execution target for web-created tasks.
 *
 * - local: always Mac connector (wait/blocked if offline — no silent Continuity)
 * - cloud: always Continuity VPS runner when entitled (even if Mac is online)
 * - auto:  legacy offline-failover behavior (online→local, offline→device policy)
 */
export type RoutePreference = "local" | "cloud" | "auto";

export type DeviceRouteInput = {
  failoverMode: "disabled" | "manual" | "auto";
  lastSeenAt: number | null;
};

export type TaskRouteDecision = {
  status: string;
  route: "local" | "cloud" | "blocked";
  preference: RoutePreference;
};

const ONLINE_MS = 60_000;

export function parseRoutePreference(value: unknown): RoutePreference {
  if (value === "local" || value === "cloud" || value === "auto") return value;
  return "auto";
}

export function isDeviceOnline(lastSeenAt: number | null, now = Date.now()): boolean {
  return Boolean(lastSeenAt && now - lastSeenAt < ONLINE_MS);
}

/**
 * Decide task status + route from user preference and device presence.
 * Entitlement / tool policy are enforced by the caller after this decision.
 */
export function decideTaskRoute(input: {
  preference: RoutePreference;
  device: DeviceRouteInput;
  now?: number;
}): TaskRouteDecision {
  const preference = input.preference;
  const now = input.now ?? Date.now();
  const online = isDeviceOnline(input.device.lastSeenAt, now);

  if (preference === "cloud") {
    return { status: "cloud_pending", route: "cloud", preference };
  }

  if (preference === "local") {
    if (online) return { status: "local_pending", route: "local", preference };
    return { status: "offline_blocked", route: "blocked", preference };
  }

  // auto — offline failover only
  if (online) return { status: "local_pending", route: "local", preference: "auto" };
  if (input.device.failoverMode === "auto") {
    return { status: "cloud_pending", route: "cloud", preference: "auto" };
  }
  if (input.device.failoverMode === "manual") {
    return { status: "needs_failover", route: "blocked", preference: "auto" };
  }
  return { status: "offline_blocked", route: "blocked", preference: "auto" };
}
