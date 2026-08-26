import { attachLastMileToReceipt, type LastMileAttach } from "./hosted-last-mile.ts";

/**
 * Hosted Hermes source of truth is the fenced VPS.
 * A laptop is a cache. Never toast leftover Mac-pair as "machine found".
 * Never acknowledge a cloud send as live until it is persisted on the VPS.
 * Never advertise $10 checkout as live unless runner and model are verified.
 */

export const HOSTED_SOURCE_OF_TRUTH = "hosted-vps" as const;

export const HOSTED_TRUST_STATES = ["verified", "reachable", "failed"] as const;
export type HostedTrustState = (typeof HOSTED_TRUST_STATES)[number];

export type HostedAckOk = {
  ok: true;
  live: true;
  persistedId: string;
};

export type HostedAckFail = {
  ok: false;
  live: false;
  reason: "laptop_is_cache" | "not_admitted" | "not_persisted";
  message: string;
};

export type HostedAck = HostedAckOk | HostedAckFail;

export function isLaptopCache(runtime: string | null | undefined): boolean {
  const value = String(runtime ?? "").trim().toLowerCase();
  return value !== "vps" && value !== "cloud";
}

/** Leftover ?pair= must never become a dashboard toast. */
export function pairQueryNotice(_code?: string | null): null {
  return null;
}

export function ackHostedSend(input: {
  runtime?: string | null;
  persistedId?: string | null;
  admitted?: boolean;
} = {}): HostedAck {
  if (isLaptopCache(input.runtime)) {
    return {
      ok: false,
      live: false,
      reason: "laptop_is_cache",
      message: "Hosted Hermes runs on a fenced VPS. A laptop is not the source of truth.",
    };
  }
  if (input.admitted === false) {
    return {
      ok: false,
      live: false,
      reason: "not_admitted",
      message: "Cloud send is not admitted until the hosted runner and model are healthy.",
    };
  }
  const persistedId = String(input.persistedId ?? "").trim();
  if (!persistedId) {
    return {
      ok: false,
      live: false,
      reason: "not_persisted",
      message: "Cloud send is not live until it is persisted on the hosted VPS.",
    };
  }
  return { ok: true, live: true, persistedId };
}

export function trustFromResource(status: "healthy" | "waiting" | "unhealthy" | null | undefined): HostedTrustState {
  if (status === "healthy") return "verified";
  if (status === "unhealthy") return "failed";
  return "reachable";
}

/** Fail-closed while HTTPS/runner is not verified. Does not add a fourth badge. */
export function isTurningOn(input: {
  runnerTrust?: HostedTrustState | null;
  modelTrust?: HostedTrustState | null;
  cacheKnown?: boolean;
  httpsTrusted?: boolean;
} = {}): boolean {
  if (input.cacheKnown === false) return true;
  if (input.httpsTrusted === false) return true;
  return input.runnerTrust !== "verified" || input.modelTrust !== "verified";
}

export function advertiseHostedPaid(input: {
  runnerTrust?: HostedTrustState | null;
  modelTrust?: HostedTrustState | null;
  stripeConfigured?: boolean;
  cacheKnown?: boolean;
  httpsTrusted?: boolean;
} = {}): boolean {
  if (input.stripeConfigured === false) return false;
  if (input.cacheKnown === false) return false;
  if (input.httpsTrusted === false) return false;
  return input.runnerTrust === "verified" && input.modelTrust === "verified";
}

export function publicRunReceipt(input: {
  taskId?: string | null;
  route?: string | null;
  status?: string | null;
  prompt?: string | null;
} = {}): {
  ok: true;
  taskId: string;
  route: string;
  status: string;
  sourceOfTruth: "hosted-vps";
  lastMile: LastMileAttach;
} | { ok: false; reason: "not_persisted" } {
  const taskId = String(input.taskId ?? "").trim();
  if (!taskId) return { ok: false, reason: "not_persisted" };
  const route = String(input.route ?? "cloud").trim() || "cloud";
  const cloud = route === "cloud";
  return {
    ok: true,
    taskId,
    route,
    status: String(input.status ?? "pending").trim() || "pending",
    sourceOfTruth: HOSTED_SOURCE_OF_TRUTH,
    lastMile: attachLastMileToReceipt({
      runtime: cloud ? "vps" : "mac",
      sandbox: cloud,
      schedule: cloud ? "once" : "none",
      credentialsBound: cloud,
      generatedByAgent: true,
      taskId,
    }),
  };
}
