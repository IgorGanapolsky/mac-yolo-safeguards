/**
 * Hosted tool approval policy.
 * Deny always wins over allow. always-allow still respects deny.
 * A remote session never reads secrets or changes settings.
 * Overnight hosted runs open a HITL interrupt on send/spend/customer/prod/calendar.
 * Unresolved interrupts fail closed. Approvals stay in thumbgate.app.
 * Outbound email is drafts-only.
 */

import { evaluateRemoteAction, type RemoteAction } from "./hosted-remote-surface.ts";

export const HOSTED_APPROVAL_MODES = ["always-ask", "accept-edits", "always-allow"] as const;
export type HostedApprovalMode = (typeof HOSTED_APPROVAL_MODES)[number];

export const GATED_TOOL_CLASSES = ["money", "customer", "production", "send", "calendar"] as const;
export type GatedToolClass = (typeof GATED_TOOL_CLASSES)[number];

export const HITL_APPROVAL_SURFACE = "thumbgate.app" as const;
export const OUTBOUND_EMAIL_MODE = "drafts_only" as const;

export type HitlInterruptConfig = {
  allow_ignore: boolean;
  allow_accept: boolean;
  allow_edit: boolean;
};

/** Default for send / spend / customer / prod / calendar. Never auto-accept. */
export const DEFAULT_GATED_INTERRUPT_CONFIG: HitlInterruptConfig = Object.freeze({
  allow_ignore: true,
  allow_accept: true,
  allow_edit: true,
});

export type ToolRule = {
  tool?: string;
  action?: string;
  toolClass?: string;
  decision: "allow" | "deny";
};

export type HostedToolPolicy = {
  mode: HostedApprovalMode;
  rules: ToolRule[];
};

export type ToolDecision =
  | { allowed: true; mode: HostedApprovalMode }
  | { allowed: false; mode: HostedApprovalMode; reason: string; source: "deny_rule" | "always_ask" | "remote_cap" };

export type HostedHitlInterrupt = {
  action_request: { action: string; args: Record<string, unknown> };
  config: HitlInterruptConfig;
  description: string;
  status: "open" | "accepted" | "ignored" | "edited" | "denied";
  toolClass: GatedToolClass;
  surface: typeof HITL_APPROVAL_SURFACE;
};

export type HostedToolReceipt = {
  actor: string;
  verb: string;
  target: string;
  timestamp: number;
  outcome: "paused" | "denied" | "done" | "draft_only";
  note: string;
  interruptStatus?: HostedHitlInterrupt["status"];
};

export type HumanHitlDecision = {
  type: "accept" | "ignore" | "edit" | "deny";
  args?: Record<string, unknown>;
  surface?: string | null;
};

const DEFAULT_POLICY: HostedToolPolicy = { mode: "always-ask", rules: [] };

const CLASS_FROM_NAME: ReadonlyArray<{ toolClass: GatedToolClass; re: RegExp }> = Object.freeze([
  { toolClass: "money", re: /\b(stripe|charge|spend|pay|invoice|checkout|refund|billing|purchase)\b/i },
  { toolClass: "send", re: /\b(send_email|write_email|gmail|smtp|outbound_email|send_message|send)\b/i },
  { toolClass: "calendar", re: /\b(schedule_meeting|calendar|create_event|meeting)\b/i },
  { toolClass: "customer", re: /\b(customer|crm|hubspot|salesforce)\b/i },
  { toolClass: "production", re: /\b(production|deploy|migrate_prod|\bprod\b)\b/i },
]);

const EMAIL_TOOL_RE = /\b(send_email|write_email|gmail|smtp|outbound_email|email)\b/i;
const EMAIL_SEND_RE = /\b(send|deliver|dispatch)\b/i;

function sameTarget(a: ToolRule, b: ToolRule): boolean {
  return (
    String(a.tool ?? "").trim().toLowerCase() === String(b.tool ?? "").trim().toLowerCase() &&
    String(a.action ?? "").trim().toLowerCase() === String(b.action ?? "").trim().toLowerCase() &&
    String(a.toolClass ?? "").trim().toLowerCase() === String(b.toolClass ?? "").trim().toLowerCase()
  );
}

function stickyDenyRules(previous?: HostedToolPolicy | null): ToolRule[] {
  return (previous?.rules ?? []).filter((rule) => rule && rule.decision === "deny");
}

function mergeDenyWins(parsedRules: ToolRule[], previous?: HostedToolPolicy | null): ToolRule[] {
  const next = parsedRules.slice();
  for (const deny of stickyDenyRules(previous)) {
    if (!next.some((rule) => rule.decision === "deny" && sameTarget(rule, deny))) {
      next.push(deny);
    }
  }
  return next;
}

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
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.filter((rule) => rule && (rule.decision === "allow" || rule.decision === "deny"))
      : [];
    return { policy: { mode, rules: mergeDenyWins(rules, previous) }, error: null };
  } catch (error) {
    return {
      policy: fallback,
      error: error instanceof Error ? error.message : "policy parse failed; kept last-known-good",
    };
  }
}

function matchesRule(rule: ToolRule, input: { tool?: string; action?: string; toolClass?: string }): boolean {
  const tool = String(input.tool ?? "").trim().toLowerCase();
  const action = String(input.action ?? "").trim().toLowerCase();
  const toolClass = String(input.toolClass ?? "").trim().toLowerCase();
  const ruleTool = String(rule.tool ?? "").trim().toLowerCase();
  const ruleAction = String(rule.action ?? "").trim().toLowerCase();
  const ruleClass = String(rule.toolClass ?? "").trim().toLowerCase();
  if (ruleClass && ruleClass !== toolClass) return false;
  if (ruleTool && ruleTool !== tool) return false;
  if (ruleAction && ruleAction !== action) return false;
  return Boolean(ruleTool || ruleAction || ruleClass);
}

export function classifyGatedTool(input: {
  tool?: string;
  action?: string;
  actionClass?: string;
} = {}): GatedToolClass | null {
  const explicit = String(input.actionClass ?? "").trim().toLowerCase();
  if ((GATED_TOOL_CLASSES as readonly string[]).includes(explicit)) {
    return explicit as GatedToolClass;
  }
  const haystack = `${input.tool ?? ""} ${input.action ?? ""}`;
  for (const row of CLASS_FROM_NAME) {
    if (row.re.test(haystack)) return row.toolClass;
  }
  return null;
}

export function interruptConfigForClass(toolClass: GatedToolClass): HitlInterruptConfig {
  if (!(GATED_TOOL_CLASSES as readonly string[]).includes(toolClass)) {
    return { ...DEFAULT_GATED_INTERRUPT_CONFIG };
  }
  return { ...DEFAULT_GATED_INTERRUPT_CONFIG };
}

export function isOutboundEmailTool(input: { tool?: string; action?: string } = {}): boolean {
  const haystack = `${input.tool ?? ""} ${input.action ?? ""}`;
  return EMAIL_TOOL_RE.test(haystack);
}

export function evaluateOutboundEmail(input: {
  tool?: string;
  action?: string;
  mode?: "send" | "draft";
} = {}):
  | { allowed: false; mode: typeof OUTBOUND_EMAIL_MODE; reason: string }
  | { allowed: true; mode: "draft" } {
  const mode = String(input.mode ?? input.action ?? "").trim().toLowerCase();
  const wantsSend = mode === "send" || EMAIL_SEND_RE.test(String(input.action ?? ""));
  if (isOutboundEmailTool(input) && wantsSend) {
    return {
      allowed: false,
      mode: OUTBOUND_EMAIL_MODE,
      reason: "Outbound email is drafts-only. The send does not complete; open a HITL interrupt in thumbgate.app.",
    };
  }
  if (isOutboundEmailTool(input)) {
    return { allowed: true, mode: "draft" };
  }
  return { allowed: true, mode: "draft" };
}

export function persistHumanDeny(
  policy: HostedToolPolicy | null | undefined,
  input: { tool?: string; action?: string; toolClass?: string } = {},
): HostedToolPolicy {
  const current: HostedToolPolicy = {
    mode: policy?.mode ?? "always-ask",
    rules: [...(policy?.rules ?? [])],
  };
  const deny: ToolRule = {
    decision: "deny",
    ...(input.tool ? { tool: String(input.tool).trim() } : {}),
    ...(input.action ? { action: String(input.action).trim() } : {}),
    ...(input.toolClass ? { toolClass: String(input.toolClass).trim().toLowerCase() } : {}),
  };
  if (!deny.tool && !deny.action && !deny.toolClass) return current;
  if (!current.rules.some((rule) => rule.decision === "deny" && sameTarget(rule, deny))) {
    current.rules.push(deny);
  }
  return current;
}

export function evaluateHostedToolApproval(input: {
  policy?: HostedToolPolicy | null;
  tool?: string;
  action?: string;
  toolClass?: string;
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
  const classified = input.toolClass ?? classifyGatedTool(input) ?? undefined;
  const deny = (policy.rules ?? []).some((rule) => rule.decision === "deny" && matchesRule(rule, { ...input, toolClass: classified }));
  if (deny) {
    return {
      allowed: false,
      mode: policy.mode,
      reason: "A deny rule always wins over allow.",
      source: "deny_rule",
    };
  }
  const allow = (policy.rules ?? []).some((rule) => rule.decision === "allow" && matchesRule(rule, { ...input, toolClass: classified }));
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

export function createHostedHitlInterrupt(input: {
  tool?: string;
  action?: string;
  actionClass?: string;
  args?: Record<string, unknown>;
  description?: string;
} = {}): HostedHitlInterrupt | null {
  const toolClass = classifyGatedTool(input);
  if (!toolClass) return null;
  const action = String(input.action ?? input.tool ?? toolClass).trim() || toolClass;
  return {
    action_request: {
      action,
      args: input.args && typeof input.args === "object" ? { ...input.args } : {},
    },
    config: interruptConfigForClass(toolClass),
    description: String(input.description ?? `${toolClass}:${action} waits for a human in thumbgate.app`).trim(),
    status: "open",
    toolClass,
    surface: HITL_APPROVAL_SURFACE,
  };
}

function receipt(input: {
  tool?: string;
  action?: string;
  outcome: HostedToolReceipt["outcome"];
  note: string;
  interruptStatus?: HostedHitlInterrupt["status"];
  now?: number;
}): HostedToolReceipt {
  return {
    actor: "hosted-hermes",
    verb: String(input.tool ?? input.action ?? "tool").trim() || "tool",
    target: String(input.action ?? input.tool ?? "gated").trim() || "gated",
    timestamp: Number.isFinite(input.now) ? Number(input.now) : Date.now(),
    outcome: input.outcome,
    note: input.note,
    interruptStatus: input.interruptStatus,
  };
}

/**
 * Overnight $10 wedge: a gated send/spend/customer/prod/calendar tool cannot
 * complete until a human decides in thumbgate.app. Unresolved = fail-closed pause.
 */
export function completeGatedHostedTool(input: {
  policy?: HostedToolPolicy | null;
  tool?: string;
  action?: string;
  actionClass?: string;
  args?: Record<string, unknown>;
  description?: string;
  humanDecision?: HumanHitlDecision | null;
  surface?: string | null;
  now?: number;
} = {}): {
  completed: boolean;
  sent: boolean;
  spent: boolean;
  mutatedProd: boolean;
  interrupt: HostedHitlInterrupt | null;
  receipt: HostedToolReceipt;
  policy: HostedToolPolicy;
  args: Record<string, unknown>;
} {
  const policy = input.policy ?? DEFAULT_POLICY;
  const args = input.args && typeof input.args === "object" ? { ...input.args } : {};
  const toolClass = classifyGatedTool(input);
  const closed = {
    sent: false,
    spent: false,
    mutatedProd: false,
    args,
    policy,
  };

  if (isOutboundEmailTool(input)) {
    const email = evaluateOutboundEmail(input);
    if (!email.allowed) {
      const interrupt = createHostedHitlInterrupt({ ...input, args, actionClass: "send" });
      return {
        ...closed,
        completed: false,
        interrupt,
        receipt: receipt({
          tool: input.tool,
          action: input.action,
          outcome: "draft_only",
          note: email.reason,
          interruptStatus: interrupt?.status ?? "open",
          now: input.now,
        }),
      };
    }
  }

  if (!toolClass) {
    const decision = evaluateHostedToolApproval(input);
    return {
      ...closed,
      completed: decision.allowed,
      interrupt: null,
      receipt: receipt({
        tool: input.tool,
        action: input.action,
        outcome: decision.allowed ? "done" : "denied",
        note: decision.allowed ? "not_gated" : ("reason" in decision ? decision.reason : "denied"),
        now: input.now,
      }),
    };
  }

  const interrupt = createHostedHitlInterrupt({ ...input, args });
  const approval = evaluateHostedToolApproval({ ...input, toolClass });
  if (!approval.allowed && approval.source === "deny_rule") {
    return {
      ...closed,
      completed: false,
      interrupt: interrupt ? { ...interrupt, status: "denied" } : null,
      receipt: receipt({
        tool: input.tool,
        action: input.action,
        outcome: "denied",
        note: approval.reason,
        interruptStatus: "denied",
        now: input.now,
      }),
    };
  }

  const decision = input.humanDecision ?? null;
  if (!decision || !decision.type) {
    return {
      ...closed,
      completed: false,
      interrupt,
      receipt: receipt({
        tool: input.tool,
        action: input.action,
        outcome: "paused",
        note: "HITL interrupt is open in thumbgate.app. The tool does not send, spend, or mutate prod.",
        interruptStatus: "open",
        now: input.now,
      }),
    };
  }

  if (decision.type === "ignore" || decision.type === "deny") {
    if (decision.type === "ignore" && interrupt && !interrupt.config.allow_ignore) {
      return {
        ...closed,
        completed: false,
        interrupt,
        receipt: receipt({
          tool: input.tool,
          action: input.action,
          outcome: "paused",
          note: "ignore is not allowed for this interrupt",
          interruptStatus: "open",
          now: input.now,
        }),
      };
    }
    const nextPolicy = persistHumanDeny(policy, {
      tool: input.tool,
      action: input.action,
      toolClass,
    });
    return {
      ...closed,
      completed: false,
      policy: nextPolicy,
      interrupt: interrupt ? { ...interrupt, status: decision.type === "ignore" ? "ignored" : "denied" } : null,
      receipt: receipt({
        tool: input.tool,
        action: input.action,
        outcome: "denied",
        note: "Human ignored or denied this tool class in thumbgate.app.",
        interruptStatus: decision.type === "ignore" ? "ignored" : "denied",
        now: input.now,
      }),
    };
  }

  if (decision.type === "edit") {
    if (!interrupt?.config.allow_edit) {
      return {
        ...closed,
        completed: false,
        interrupt,
        receipt: receipt({
          tool: input.tool,
          action: input.action,
          outcome: "paused",
          note: "edit is not allowed for this interrupt",
          interruptStatus: "open",
          now: input.now,
        }),
      };
    }
    const editedArgs = decision.args && typeof decision.args === "object" ? { ...decision.args } : args;
    const stillOpen = createHostedHitlInterrupt({ ...input, args: editedArgs });
    return {
      ...closed,
      completed: false,
      args: editedArgs,
      interrupt: stillOpen ? { ...stillOpen, status: "open" } : null,
      receipt: receipt({
        tool: input.tool,
        action: input.action,
        outcome: "paused",
        note: "Args were rewritten. The tool is still gated until a human accepts in thumbgate.app.",
        interruptStatus: "edited",
        now: input.now,
      }),
    };
  }

  if (decision.type === "accept") {
    const surface = String(decision.surface ?? input.surface ?? "").trim().toLowerCase();
    if (surface !== HITL_APPROVAL_SURFACE) {
      return {
        ...closed,
        completed: false,
        interrupt,
        receipt: receipt({
          tool: input.tool,
          action: input.action,
          outcome: "paused",
          note: "Accept only counts on thumbgate.app. The interrupt stays open.",
          interruptStatus: "open",
          now: input.now,
        }),
      };
    }
    if (!interrupt?.config.allow_accept) {
      return {
        ...closed,
        completed: false,
        interrupt,
        receipt: receipt({
          tool: input.tool,
          action: input.action,
          outcome: "paused",
          note: "accept is not allowed for this interrupt",
          interruptStatus: "open",
          now: input.now,
        }),
      };
    }
    if (isOutboundEmailTool(input) && EMAIL_SEND_RE.test(String(input.action ?? input.tool ?? ""))) {
      return {
        ...closed,
        completed: false,
        interrupt: interrupt ? { ...interrupt, status: "accepted" } : null,
        receipt: receipt({
          tool: input.tool,
          action: input.action,
          outcome: "draft_only",
          note: "Accepted draft only. Outbound email is never sent.",
          interruptStatus: "accepted",
          now: input.now,
        }),
      };
    }
    return {
      completed: true,
      sent: false,
      spent: toolClass === "money" ? true : false,
      mutatedProd: toolClass === "production" ? true : false,
      args,
      policy,
      interrupt: interrupt ? { ...interrupt, status: "accepted" } : null,
      receipt: receipt({
        tool: input.tool,
        action: input.action,
        outcome: "done",
        note: "Human accepted in thumbgate.app.",
        interruptStatus: "accepted",
        now: input.now,
      }),
    };
  }

  return {
    ...closed,
    completed: false,
    interrupt,
    receipt: receipt({
      tool: input.tool,
      action: input.action,
      outcome: "paused",
      note: "HITL interrupt is open in thumbgate.app. The tool does not send, spend, or mutate prod.",
      interruptStatus: "open",
      now: input.now,
    }),
  };
}
