/**
 * Hosted Hermes source of truth is the fenced VPS.
 * A laptop is a cache. Never toast leftover Mac-pair as "machine found".
 * Never acknowledge a cloud send as live until it is persisted on the VPS.
 */

export const HOSTED_SOURCE_OF_TRUTH = "hosted-vps" as const;

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
