/**
 * Agent-ready "decision contract" layer for ThumbGate.
 *
 * Inspired by (not affiliated with) Towards Data Science:
 * "Building an Agent-Ready Data Warehouse: What Traditional Architectures Do Wrong"
 * (Shafeeq Ur Rahaman, 2026-08-10) — a queryable warehouse is not agent-ready until
 * business rules, completeness, and recommend-vs-execute boundaries are machine-readable.
 *
 * ThumbGate mapping:
 * - semantic / approved source  → Leash-approved tool path + Continuity entitlement
 * - completeness / freshness    → Mac heartbeat + lease + offline policy
 * - separate recommend vs action → free Leash gate before any risky tool runs
 */

export const DECISION_CONTRACT_VERSION = "2026-08-12.1";

/** Whether the agent may only interpret/recommend, or may execute a side-effecting tool. */
export type DecisionMode = "recommend" | "execute";

export type OfflinePolicy = "disabled" | "manual" | "auto";

export type DecisionClass =
  | "tool_call_local"
  | "tool_call_cloud_continuity"
  | "campaign_style_recommendation" // reserved for future analytics agents
  | "demo_leash_path";

export type EvidenceSnapshot = {
  /** Paired machine has a recent heartbeat */
  machineOnline: boolean;
  /** A signed lease is held for this thread/tool generation */
  leaseHeld: boolean;
  /** Offline Continuity policy for this workspace */
  offlinePolicy: OfflinePolicy;
  /** Optional: caller asserts required inputs/data are complete enough to act */
  evidenceComplete?: boolean;
  /** Optional: tool/source is on an approved allowlist */
  sourceApproved?: boolean;
  /** Optional: seconds since last machine heartbeat (null = unknown) */
  heartbeatAgeSec?: number | null;
  /** Max acceptable heartbeat age for execute (default 90) */
  maxHeartbeatAgeSec?: number;
};

export type DecisionContractSpec = {
  version: string;
  decisionClass: DecisionClass;
  /** Human-readable decision this contract governs */
  title: string;
  /** Approved tools/sources the agent may use for this decision */
  approvedSources: string[];
  /** Evidence keys that must be true for execute */
  requiredEvidence: Array<keyof EvidenceSnapshot | "evidenceComplete" | "sourceApproved">;
  /** Soft ceiling: recommend is always allowed; execute needs Leash/entitlement */
  actionBoundary: "recommend_only" | "execute_with_leash" | "execute_if_entitled";
  /** Offline behavior when machine is not online */
  offlinePolicy: OfflinePolicy;
  notes?: string[];
};

export type DecisionContractEvaluation =
  | {
      allowed: true;
      mode: DecisionMode;
      policyVersion: string;
      contract: DecisionContractSpec;
      /** True when the system should surface a warning even though recommend is allowed */
      provisional: boolean;
      reasons: string[];
      receipt: DecisionReceipt;
    }
  | {
      allowed: false;
      mode: DecisionMode;
      policyVersion: string;
      contract: DecisionContractSpec;
      code:
        | "recommend_only_boundary"
        | "missing_evidence"
        | "machine_offline"
        | "lease_missing"
        | "source_unapproved"
        | "stale_heartbeat"
        | "local_only_on_cloud";
      message: string;
      reasons: string[];
      receipt: DecisionReceipt;
    };

export type DecisionReceipt = {
  product: "ThumbGate";
  kind: "decision_contract_receipt";
  version: string;
  decisionClass: DecisionClass;
  mode: DecisionMode;
  outcome: "allow" | "deny" | "recommend_only";
  offlinePolicy: OfflinePolicy;
  reasons: string[];
  evidence: {
    machineOnline: boolean;
    leaseHeld: boolean;
    evidenceComplete: boolean | null;
    sourceApproved: boolean | null;
    heartbeatAgeSec: number | null;
  };
  generatedAt: string;
};

const DEFAULT_MAX_HEARTBEAT_AGE_SEC = 90;

/** Canonical contracts for the two ThumbGate paths that matter today. */
export function contractForLocalToolCall(offlinePolicy: OfflinePolicy = "manual"): DecisionContractSpec {
  return {
    version: DECISION_CONTRACT_VERSION,
    decisionClass: "tool_call_local",
    title: "Execute a risky local tool call on a paired Mac",
    approvedSources: ["Hermes paired machine", "Leash approval UI", "PreToolUse hook"],
    requiredEvidence: ["machineOnline", "leaseHeld", "sourceApproved"],
    actionBoundary: "execute_with_leash",
    offlinePolicy,
    notes: [
      "Leash approve/deny is free table-stakes; this contract does not invent a paywall for gates.",
      "Separate recommend (agent proposes Bash) from execute (human Leash or standing rule).",
    ],
  };
}

export function contractForCloudContinuity(offlinePolicy: OfflinePolicy = "manual"): DecisionContractSpec {
  return {
    version: DECISION_CONTRACT_VERSION,
    decisionClass: "tool_call_cloud_continuity",
    title: "Continue eligible work on fenced VPS when Mac is offline",
    approvedSources: ["ThumbGate Continuity runner", "offline policy", "entitled workspace"],
    requiredEvidence: ["sourceApproved", "evidenceComplete"],
    actionBoundary: "execute_if_entitled",
    offlinePolicy,
    notes: [
      "Continuity is paid VPS failover — not a substitute for free Leash on the Mac.",
      "Local-only tools (Keychain, AppleScript, USB) must stay recommend_only on cloud.",
    ],
  };
}

function buildReceipt(
  contract: DecisionContractSpec,
  mode: DecisionMode,
  outcome: DecisionReceipt["outcome"],
  evidence: EvidenceSnapshot,
  reasons: string[],
  generatedAt: string,
): DecisionReceipt {
  return {
    product: "ThumbGate",
    kind: "decision_contract_receipt",
    version: DECISION_CONTRACT_VERSION,
    decisionClass: contract.decisionClass,
    mode,
    outcome,
    offlinePolicy: contract.offlinePolicy,
    reasons,
    evidence: {
      machineOnline: Boolean(evidence.machineOnline),
      leaseHeld: Boolean(evidence.leaseHeld),
      evidenceComplete: evidence.evidenceComplete ?? null,
      sourceApproved: evidence.sourceApproved ?? null,
      heartbeatAgeSec:
        evidence.heartbeatAgeSec === undefined || evidence.heartbeatAgeSec === null
          ? null
          : Number(evidence.heartbeatAgeSec),
    },
    generatedAt,
  };
}

/**
 * Evaluate whether the agent may recommend or execute under a decision contract.
 * Pure function — same inputs → same outcome (except generatedAt if omitted).
 */
export function evaluateDecisionContract(input: {
  contract: DecisionContractSpec;
  mode: DecisionMode;
  evidence: EvidenceSnapshot;
  /** When false, Continuity/execute path is not entitled (trial/paid). */
  entitled?: boolean;
  generatedAt?: string;
}): DecisionContractEvaluation {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const { contract, mode, evidence } = input;
  const entitled = input.entitled !== false;
  const reasons: string[] = [];
  const maxAge = evidence.maxHeartbeatAgeSec ?? DEFAULT_MAX_HEARTBEAT_AGE_SEC;

  // Recommend is always allowed as interpretation — but may be provisional.
  if (mode === "recommend") {
    if (evidence.machineOnline === false) reasons.push("machine_offline_provisional");
    if (evidence.evidenceComplete === false) reasons.push("incomplete_evidence_provisional");
    if (evidence.sourceApproved === false) reasons.push("unapproved_source_provisional");
    const receipt = buildReceipt(contract, mode, "allow", evidence, reasons, generatedAt);
    return {
      allowed: true,
      mode,
      policyVersion: DECISION_CONTRACT_VERSION,
      contract,
      provisional: reasons.length > 0,
      reasons,
      receipt,
    };
  }

  // Execute path
  if (contract.actionBoundary === "recommend_only") {
    const message = "This decision class is recommend-only; execution requires a separate approval service.";
    reasons.push("recommend_only_boundary");
    return {
      allowed: false,
      mode,
      policyVersion: DECISION_CONTRACT_VERSION,
      contract,
      code: "recommend_only_boundary",
      message,
      reasons,
      receipt: buildReceipt(contract, mode, "recommend_only", evidence, reasons, generatedAt),
    };
  }

  if (contract.actionBoundary === "execute_if_entitled" && !entitled) {
    reasons.push("not_entitled");
    return {
      allowed: false,
      mode,
      policyVersion: DECISION_CONTRACT_VERSION,
      contract,
      code: "missing_evidence",
      message: "Continuity execute requires an active trial or paid plan.",
      reasons,
      receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
    };
  }

  if (contract.requiredEvidence.includes("sourceApproved") && evidence.sourceApproved === false) {
    reasons.push("source_unapproved");
    return {
      allowed: false,
      mode,
      policyVersion: DECISION_CONTRACT_VERSION,
      contract,
      code: "source_unapproved",
      message: "Tool/source is not on the approved decision-contract allowlist.",
      reasons,
      receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
    };
  }

  if (contract.decisionClass === "tool_call_local") {
    if (!evidence.machineOnline) {
      reasons.push("machine_offline");
      // Offline: honor policy rather than silent execute
      if (contract.offlinePolicy === "disabled") {
        return {
          allowed: false,
          mode,
          policyVersion: DECISION_CONTRACT_VERSION,
          contract,
          code: "machine_offline",
          message: "Mac offline; offline policy is pause — no cloud execute.",
          reasons,
          receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
        };
      }
      if (contract.offlinePolicy === "manual") {
        return {
          allowed: false,
          mode,
          policyVersion: DECISION_CONTRACT_VERSION,
          contract,
          code: "machine_offline",
          message: "Mac offline; needs explicit Continuity failover approval (needs_failover).",
          reasons,
          receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
        };
      }
      // auto → defer to cloud continuity contract; local execute still denied
      return {
        allowed: false,
        mode,
        policyVersion: DECISION_CONTRACT_VERSION,
        contract,
        code: "machine_offline",
        message: "Mac offline; local execute denied — use Continuity contract for fenced cloud.",
        reasons,
        receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
      };
    }

    if (!evidence.leaseHeld) {
      reasons.push("lease_missing");
      return {
        allowed: false,
        mode,
        policyVersion: DECISION_CONTRACT_VERSION,
        contract,
        code: "lease_missing",
        message: "No signed 90s lease held for this tool generation.",
        reasons,
        receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
      };
    }

    if (
      evidence.heartbeatAgeSec != null &&
      Number.isFinite(evidence.heartbeatAgeSec) &&
      evidence.heartbeatAgeSec > maxAge
    ) {
      reasons.push("stale_heartbeat");
      return {
        allowed: false,
        mode,
        policyVersion: DECISION_CONTRACT_VERSION,
        contract,
        code: "stale_heartbeat",
        message: `Machine heartbeat is ${evidence.heartbeatAgeSec}s old (max ${maxAge}s).`,
        reasons,
        receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
      };
    }
  }

  if (contract.requiredEvidence.includes("evidenceComplete") && evidence.evidenceComplete === false) {
    reasons.push("incomplete_evidence");
    return {
      allowed: false,
      mode,
      policyVersion: DECISION_CONTRACT_VERSION,
      contract,
      code: "missing_evidence",
      message: "Required evidence is incomplete for an execute decision.",
      reasons,
      receipt: buildReceipt(contract, mode, "deny", evidence, reasons, generatedAt),
    };
  }

  reasons.push("execute_allowed");
  return {
    allowed: true,
    mode,
    policyVersion: DECISION_CONTRACT_VERSION,
    contract,
    provisional: false,
    reasons,
    receipt: buildReceipt(contract, mode, "allow", evidence, reasons, generatedAt),
  };
}

/** Portable YAML-ish JSON document for export / version control with models. */
export function formatDecisionContractDocument(
  contract: DecisionContractSpec,
  evaluation?: DecisionContractEvaluation,
): string {
  const doc = {
    decision_contract: {
      version: contract.version,
      decision_class: contract.decisionClass,
      title: contract.title,
      approved_sources: contract.approvedSources,
      required_evidence: contract.requiredEvidence,
      action_boundary: contract.actionBoundary,
      offline_policy: contract.offlinePolicy,
      notes: contract.notes ?? [],
    },
    last_evaluation: evaluation
      ? {
          allowed: evaluation.allowed,
          mode: evaluation.mode,
          provisional: "provisional" in evaluation ? evaluation.provisional : false,
          reasons: evaluation.reasons,
          receipt: evaluation.receipt,
        }
      : null,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
