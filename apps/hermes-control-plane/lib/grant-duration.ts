/**
 * Vellum computer-use grant windows, adapted for hosted Hermes on a fenced VPS.
 *
 * Steal: once / 10 minutes / always. Default deny. Approvals stay in thumbgate.app.
 * Do not steal: a hosting picker, memory-handoff as the public noun, or companion-app approvals.
 */

export const GRANT_DURATION_POLICY_VERSION = "2026-08-18.1";

export const GRANT_DURATIONS = ["once", "10m", "always"] as const;
export type GrantDuration = (typeof GRANT_DURATIONS)[number];

export const TEN_MINUTE_GRANT_MS = 10 * 60 * 1000;

export type GrantDenialCode =
  | "default_deny"
  | "expired"
  | "consumed"
  | "revoked"
  | "tool_mismatch"
  | "invalid_duration"
  | "operator_deny";

export type GrantDecision =
  | {
      allowed: true;
      policyVersion: string;
      duration: GrantDuration;
      grantId: string | null;
      remainingMs: number | null;
    }
  | {
      allowed: false;
      policyVersion: string;
      code: GrantDenialCode;
      message: string;
    };

export type ApprovalGrant = {
  id: string;
  toolName: string;
  duration: GrantDuration;
  createdAt: number;
  expiresAt: number | null;
  remainingUses: number | null;
  revokedAt: number | null;
};

function deny(code: GrantDenialCode, message: string): GrantDecision {
  return { allowed: false, policyVersion: GRANT_DURATION_POLICY_VERSION, code, message };
}

function allow(duration: GrantDuration, grantId: string | null, remainingMs: number | null): GrantDecision {
  return { allowed: true, policyVersion: GRANT_DURATION_POLICY_VERSION, duration, grantId, remainingMs };
}

export function isGrantDuration(value: unknown): value is GrantDuration {
  return value === "once" || value === "10m" || value === "always";
}

export function normalizeToolName(toolName: string): string {
  return String(toolName ?? "").trim();
}

export function remainingGrantMs(grant: ApprovalGrant, now: number): number | null {
  if (grant.duration === "always") return null;
  if (grant.expiresAt == null) return null;
  return Math.max(0, grant.expiresAt - now);
}

export function mintGrant(input: {
  toolName: string;
  duration: unknown;
  now?: number;
  id?: string;
}): ApprovalGrant {
  const now = input.now ?? Date.now();
  if (!isGrantDuration(input.duration)) {
    throw new Error("invalid_duration");
  }
  const toolName = normalizeToolName(input.toolName);
  if (!toolName) {
    throw new Error("invalid_tool");
  }
  return {
    id: input.id ?? `grant_${now.toString(36)}`,
    toolName,
    duration: input.duration,
    createdAt: now,
    expiresAt: input.duration === "10m" ? now + TEN_MINUTE_GRANT_MS : null,
    remainingUses: input.duration === "once" ? 1 : null,
    revokedAt: null,
  };
}

export function evaluateGrant(
  grant: ApprovalGrant | null | undefined,
  input: { toolName: string; now?: number },
): GrantDecision {
  const now = input.now ?? Date.now();
  const toolName = normalizeToolName(input.toolName);
  if (!grant) {
    return deny("default_deny", "no grant; default deny");
  }
  if (grant.revokedAt != null) {
    return deny("revoked", "grant was revoked");
  }
  if (!toolName || grant.toolName !== toolName) {
    return deny("tool_mismatch", "grant does not match this tool");
  }
  if (grant.duration === "once" && (grant.remainingUses ?? 0) <= 0) {
    return deny("consumed", "once grant already consumed");
  }
  if (grant.duration === "10m") {
    if (grant.expiresAt == null || now >= grant.expiresAt) {
      return deny("expired", "10-minute grant expired");
    }
  }
  return allow(grant.duration, grant.id, remainingGrantMs(grant, now));
}

export function consumeGrant(
  grant: ApprovalGrant,
  input: { toolName: string; now?: number },
): { decision: GrantDecision; grant: ApprovalGrant } {
  const decision = evaluateGrant(grant, input);
  if (!decision.allowed) return { decision, grant };
  if (grant.duration === "once") {
    return { decision, grant: { ...grant, remainingUses: 0 } };
  }
  return { decision, grant };
}

export function revokeGrant(grant: ApprovalGrant, now = Date.now()): ApprovalGrant {
  return { ...grant, revokedAt: now };
}

/**
 * In-memory grant table keyed by exact tool name.
 * Latest decide() for a tool replaces the previous grant (fail-closed on mismatch).
 */
export class GrantStore {
  #grants = new Map<string, ApprovalGrant>();

  get(toolName: string): ApprovalGrant | undefined {
    return this.#grants.get(normalizeToolName(toolName));
  }

  decide(input: { toolName: string; action: "deny" | GrantDuration | unknown; now?: number }): GrantDecision {
    const toolName = normalizeToolName(input.toolName);
    const now = input.now ?? Date.now();
    if (!toolName) {
      return deny("invalid_duration", "tool name required");
    }
    if (input.action === "deny") {
      this.#grants.delete(toolName);
      return deny("operator_deny", "denied by operator");
    }
    if (!isGrantDuration(input.action)) {
      return deny("invalid_duration", "grant duration must be once, 10m, or always");
    }
    const grant = mintGrant({ toolName, duration: input.action, now });
    if (grant.duration === "once") {
      // This call is the consume. Nothing leftover for the next call.
      this.#grants.delete(toolName);
      return allow("once", grant.id, null);
    }
    this.#grants.set(toolName, grant);
    return allow(grant.duration, grant.id, remainingGrantMs(grant, now));
  }

  authorize(toolName: string, now = Date.now()): GrantDecision {
    const key = normalizeToolName(toolName);
    const grant = this.#grants.get(key);
    if (!grant) {
      return deny("default_deny", "no grant; default deny");
    }
    const { decision, grant: next } = consumeGrant(grant, { toolName: key, now });
    if (!decision.allowed || next.duration === "once") {
      this.#grants.delete(key);
      return decision;
    }
    this.#grants.set(key, next);
    return decision;
  }

  revoke(toolName: string, now = Date.now()): void {
    const key = normalizeToolName(toolName);
    const grant = this.#grants.get(key);
    if (grant) this.#grants.set(key, revokeGrant(grant, now));
  }

  get size(): number {
    return this.#grants.size;
  }
}
