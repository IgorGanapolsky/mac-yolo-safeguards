/**
 * Hosted tool approval policy.
 * Deny always wins over allow. always-allow still respects deny.
 * A remote session never reads secrets or changes settings.
 */

import { evaluateRemoteAction, type RemoteAction } from "./hosted-remote-surface.js";

export const HOSTED_APPROVAL_MODES = ["always-ask", "accept-edits", "always-allow"] as const;
export type HostedApprovalMode = (typeof HOSTED_APPROVAL_MODES)[number];

export type ToolRule = {
  tool?: string;
  action?: string;
  decision: "allow" | "deny";
};

export type HostedToolPolicy = {
  mode: HostedApprovalMode;
  rules: ToolRule[];
};

export type ToolDecision =
  | { allowed: true; mode: HostedApprovalMode }
  | { allowed: false; mode: HostedApprovalMode; reason: string; source: "deny_rule" | "always_ask" | "remote_cap" };

const DEFAULT_POLICY: HostedToolPolicy = { mode: "always-ask", rules: [] };

export function parseHostedToolPolicy(raw: string, previous?: HostedToolPolicy | null): {
  policy: HostedToolPolicy;
  error: string | null;
} {
  const fallback = previous ?? DEFAULT_POLICY;
  const text = String(raw ?? "").trim();
  if (!text) {
    return { policy: fallback, error: previous ? "empty policy kept last-known-good" : null };
  }
  try {
    const parsed = JSON.parse(text) as Partial<HostedToolPolicy> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { policy: fallback, error: "policy parse failed; kept last-known-good" };
    }
    const mode = HOSTED_APPROVAL_MODES.includes(parsed.mode as HostedApprovalMode)
      ? parsed.mode as HostedApprovalMode
      : "always-ask";
    const rules = Array.isArray(parsed.rules) ? parsed.rules.filter((rule) => rule && (rule.decision === "allow" || rule.decision === "deny")) : [];
    return { policy: { mode, rules }, error: null };
  } catch (error) {
    return {
      policy: fallback,
      error: error instanceof Error ? error.message : "policy parse failed; kept last-known-good",
    };
  }
}

function matchesRule(rule: ToolRule, input: { tool?: string; action?: string }): boolean {
  const tool = String(input.tool ?? "").trim().toLowerCase();
  const action = String(input.action ?? "").trim().toLowerCase();
  const ruleTool = String(rule.tool ?? "").trim().toLowerCase();
  const ruleAction = String(rule.action ?? "").trim().toLowerCase();
  if (ruleTool && ruleTool !== tool) return false;
  if (ruleAction && ruleAction !== action) return false;
  return Boolean(ruleTool || ruleAction);
}

export function evaluateHostedToolApproval(input: {
  policy?: HostedToolPolicy | null;
  tool?: string;
  action?: string;
  remote?: boolean;
  remoteAction?: RemoteAction;
} = {}): ToolDecision {
  const policy = input.policy ?? DEFAULT_POLICY;
  if (input.remote) {
    const remoteAction = input.remoteAction
      ?? (input.action === "read_secrets" || input.tool === "secrets" ? "read_secrets"
        : input.action === "change_settings" || input.tool === "settings" ? "change_settings"
        : "chat");
    const remote = evaluateRemoteAction(remoteAction);
    if (!remote.allowed) {
      return { allowed: false, mode: policy.mode, reason: remote.reason, source: "remote_cap" };
    }
  }
  const deny = (policy.rules ?? []).some((rule) => rule.decision === "deny" && matchesRule(rule, input));
  if (deny) {
    return {
      allowed: false,
      mode: policy.mode,
      reason: "A deny rule always wins over allow.",
      source: "deny_rule",
    };
  }
  const allow = (policy.rules ?? []).some((rule) => rule.decision === "allow" && matchesRule(rule, input));
  if (policy.mode === "always-allow" || allow || (policy.mode === "accept-edits" && /edit|write|replace/i.test(String(input.action ?? input.tool ?? "")))) {
    return { allowed: true, mode: policy.mode };
  }
  return {
    allowed: false,
    mode: policy.mode,
    reason: "This tool waits for an approval in thumbgate.app.",
    source: "always_ask",
  };
}
