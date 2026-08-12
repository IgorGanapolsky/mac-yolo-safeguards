/**
 * Amphi-style "visual path → native code you can run anywhere" export
 * for the public FailoverPathDemo. Pure helpers only — no React, no DOM.
 *
 * Source inspiration (not affiliation): amphi-ai/amphi-etl visual pipelines
 * generate exportable Python. ThumbGate exports a durable gate receipt +
 * PreToolUse-style matcher for the demo tool call path.
 *
 * Also embeds a TDS-style decision contract (recommend vs execute, evidence).
 */

import {
  contractForLocalToolCall,
  evaluateDecisionContract,
  formatDecisionContractDocument,
  type OfflinePolicy as DecisionOfflinePolicy,
} from "./decision-contract";

export type DemoPhase =
  | "pending"
  | "denied"
  | "running"
  | "offline_choice"
  | "paused"
  | "ask"
  | "cloud";

export type DemoOfflinePolicy = "disabled" | "manual" | "auto";

export type DemoGateExportInput = {
  phase: DemoPhase;
  policy: DemoOfflinePolicy;
  toolName?: string;
  command?: string;
  generatedAt?: string;
};

export type DemoGateExport = {
  /** Short product path label for the UI eyebrow */
  title: string;
  /** Human-readable visual pipeline steps (Amphi-style stage list) */
  steps: string[];
  /** Decision summary for the current demo state */
  decision: string;
  /** Language label for the code panel */
  language: "json" | "bash";
  /** Durable gate / offline policy receipt (JSON) */
  gateJson: string;
  /** TDS-style decision contract document (JSON) */
  decisionContractJson: string;
  /** Optional PreToolUse-style matcher shell/JSON for local hooks */
  hookSnippet: string;
  /** Single clipboard payload (gate + hook) */
  clipboardText: string;
};

const DEFAULT_TOOL = "Bash";
const DEFAULT_COMMAND = "npm run deploy -- --prod";

function offlinePolicyLabel(policy: DemoOfflinePolicy): string {
  switch (policy) {
    case "disabled":
      return "pause_until_online";
    case "manual":
      return "ask_before_cloud";
    case "auto":
      return "auto_cloud_continuity";
    default:
      return "ask_before_cloud";
  }
}

function decisionFor(phase: DemoPhase, policy: DemoOfflinePolicy): string {
  switch (phase) {
    case "pending":
      return "awaiting_human_leash";
    case "denied":
      return "deny_tool_call";
    case "running":
      return "approve_local_lease";
    case "offline_choice":
      return "mac_offline_choose_policy";
    case "paused":
      return "offline_blocked";
    case "ask":
      return "needs_failover";
    case "cloud":
      return policy === "auto" ? "cloud_auto_fenced_lease" : "cloud_explicit_fenced_lease";
    default:
      return "demo";
  }
}

function stepsFor(phase: DemoPhase): string[] {
  const base = [
    "01 Leash gate — approve or deny before the tool runs",
    "02 Local execution — one signed Mac holds a 90s lease while online",
    "03 Offline policy — pause, ask, or auto-continue when the lid closes",
    "04 Fenced failover — cloud runner takes generation N+1 only if enabled",
  ];
  // Highlight completed prefix based on phase
  if (phase === "pending" || phase === "denied") return base.slice(0, 1);
  if (phase === "running") return base.slice(0, 2);
  if (phase === "offline_choice" || phase === "paused" || phase === "ask") return base.slice(0, 3);
  return base;
}

/**
 * Build a copyable durable gate export from the interactive demo state.
 * Pure: same inputs → same clipboard payload (except generatedAt).
 */
export function buildDemoGateExport(input: DemoGateExportInput): DemoGateExport {
  const toolName = input.toolName ?? DEFAULT_TOOL;
  const command = input.command ?? DEFAULT_COMMAND;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const decision = decisionFor(input.phase, input.policy);
  const steps = stepsFor(input.phase);
  const offline = offlinePolicyLabel(input.policy);

  const gate = {
    product: "ThumbGate",
    kind: "demo_gate_export",
    version: 1,
    generatedAt,
    tool: { name: toolName, command },
    path: {
      phase: input.phase,
      decision,
      offlinePolicy: offline,
      leash: input.phase === "denied" ? "deny" : input.phase === "pending" ? "pending" : "approve_or_past",
    },
    notes: [
      "Generated from the public interactive demo on thumbgate.app — no real tools ran.",
      "Leash approvals are free table-stakes; Continuity VPS is the paid offline path.",
      "Not affiliated with Amphi ETL; pattern borrowed: visual path → portable artifact.",
    ],
  };

  const gateJson = `${JSON.stringify(gate, null, 2)}\n`;

  const offlinePolicy = input.policy as DecisionOfflinePolicy;
  const contract = contractForLocalToolCall(offlinePolicy);
  const mode = input.phase === "pending" || input.phase === "denied" ? "recommend" : "execute";
  const evaluation = evaluateDecisionContract({
    contract,
    mode: input.phase === "denied" ? "execute" : mode,
    generatedAt,
    evidence: {
      machineOnline: input.phase !== "offline_choice" && input.phase !== "paused" && input.phase !== "ask" && input.phase !== "cloud",
      leaseHeld: input.phase === "running" || input.phase === "cloud" || input.phase === "ask",
      offlinePolicy,
      sourceApproved: input.phase !== "denied",
      evidenceComplete: input.phase === "running" || input.phase === "cloud",
      heartbeatAgeSec: input.phase === "running" ? 5 : input.phase === "cloud" ? null : 5,
    },
  });
  // Force deny evaluation for explicit demo deny path
  const denyEval =
    input.phase === "denied"
      ? evaluateDecisionContract({
          contract,
          mode: "execute",
          generatedAt,
          evidence: {
            machineOnline: true,
            leaseHeld: false,
            offlinePolicy,
            sourceApproved: false,
          },
        })
      : evaluation;
  const decisionContractJson = formatDecisionContractDocument(contract, input.phase === "denied" ? denyEval : evaluation);

  // PreToolUse-style matcher: deny destructive-looking deploys when demo is denied;
  // otherwise export an allowlist receipt + offline policy comment for local hooks.
  const hookSnippet =
    input.phase === "denied"
      ? [
          "# ThumbGate demo → local PreToolUse-style deny matcher",
          `# decision=${decision}`,
          "if echo \"$TOOL_INPUT\" | grep -E 'npm run deploy|--prod' >/dev/null 2>&1; then",
          '  echo \'{"decision":"deny","reason":"demo_gate: deploy requires explicit human Leash"}\'',
          "  exit 0",
          "fi",
          'echo \'{"decision":"allow"}\'',
          "",
        ].join("\n")
      : [
          "# ThumbGate demo → local gate receipt (not auto-enforced)",
          `# phase=${input.phase} decision=${decision} offline=${offline}`,
          `# tool=${toolName} command=${JSON.stringify(command)}`,
          "# Paste into your agent PreToolUse / hooks layer after you review it.",
          `echo '${JSON.stringify({ decision, offlinePolicy: offline, tool: toolName, command })}'`,
          "",
        ].join("\n");

  const clipboardText = [
    "# Visual path (ThumbGate demo export)",
    ...steps.map((s) => `# ${s}`),
    `# decision: ${decision}`,
    "",
    "# --- durable gate JSON ---",
    gateJson.trimEnd(),
    "",
    "# --- decision contract (recommend vs execute) ---",
    decisionContractJson.trimEnd(),
    "",
    "# --- optional local hook snippet ---",
    hookSnippet.trimEnd(),
    "",
  ].join("\n");

  return {
    title: "Export gate as code",
    steps,
    decision,
    language: "json",
    gateJson,
    decisionContractJson,
    hookSnippet,
    clipboardText,
  };
}

/** True when the demo has made a decision worth exporting (not only pending idle). */
export function isDemoExportReady(phase: DemoPhase): boolean {
  return phase !== "pending" && phase !== "offline_choice";
}
