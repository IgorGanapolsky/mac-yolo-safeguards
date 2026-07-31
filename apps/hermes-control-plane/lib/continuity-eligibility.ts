/**
 * Public Continuity eligibility matrix.
 *
 * Continuity is queued prompt/thread handoff to a fenced VPS runner — not process
 * migration and not Mac tool parity. This module is the single source of truth for
 * what we claim in marketing, llms.txt, and GET /api/continuity/eligibility.
 *
 * Enforcement of local-only prompts lives in cloud-tool-policy.ts (claim path).
 * Entitlement limits live in agent-governance.ts. Lease fencing is task-leases.ts.
 */

import {
  LOCAL_ONLY_PROMPT_PATTERNS,
  evaluateCloudPromptToolPolicy,
} from "./cloud-tool-policy";
import { AGENT_GOVERNANCE_LIMITS, cloudTaskLimit } from "./agent-governance";

export const CONTINUITY_ELIGIBILITY_VERSION = "2026-07-31.1";

/**
 * Keep in lockstep with TASK_LEASE_MS in task-leases.ts.
 * Duplicated here so the public eligibility API never pulls the D1 runtime graph.
 */
export const CONTINUITY_LEASE_MS = 90_000;
export const CONTINUITY_RENEW_RECOMMENDED_MS = 30_000;

/** Classes that are fair game for Continuity when entitled + not local-only. */
export const CONTINUITY_ELIGIBLE_CLASSES = Object.freeze([
  {
    id: "code_review_and_diff",
    label: "Code review, diffs, and PR draft text",
    reason: "Text-only analysis that does not need Mac-attached hardware.",
  },
  {
    id: "docs_and_summaries",
    label: "Docs, changelogs, and research summaries",
    reason: "Writes and reads content the VPS workspace can hold.",
  },
  {
    id: "public_internet_api",
    label: "Public internet API / SaaS calls",
    reason: "VPS has outbound HTTPS; not a substitute for private LAN services.",
  },
  {
    id: "unit_and_ci_in_clone",
    label: "Unit tests and CI-style commands in a cloud clone",
    reason: "Runs only if the runner has the repo and tools; not your local uncommitted tree.",
  },
  {
    id: "refactor_and_rewrite",
    label: "Refactors and rewrites of checked-in sources",
    reason: "File edits on the VPS checkout; Mac-only secrets stay on the Mac.",
  },
] as const);

/** Classes that stay on the Mac (or pause) — Continuity must not claim them. */
export const CONTINUITY_LOCAL_ONLY_CLASSES = Object.freeze([
  {
    id: "applescript",
    label: "AppleScript / tell application",
    reason: "macOS GUI automation is not available on the VPS.",
  },
  {
    id: "keychain",
    label: "macOS Keychain",
    reason: "Secrets and the Security CLI live on the paired machine.",
  },
  {
    id: "imessage",
    label: "Messages / iMessage",
    reason: "Phone/Messages surfaces are device-local.",
  },
  {
    id: "local_usb",
    label: "USB / device tooling (adb, ideviceinstaller, ios-deploy)",
    reason: "Physical devices attach to the Mac, not the VPS.",
  },
  {
    id: "private_lan",
    label: "Private LAN hosts (RFC1918)",
    reason: "Home/office network addresses are not routable from the VPS.",
  },
  {
    id: "localhost_gateway",
    label: "Local Hermes gateway (:8642)",
    reason: "Gateway credential and loopback stay on the Mac.",
  },
  {
    id: "macos_ui",
    label: "macOS UI helpers (open -a, screencapture, pbcopy)",
    reason: "Desktop UI and pasteboard are Mac-local.",
  },
  {
    id: "simctl",
    label: "iOS Simulator (simctl)",
    reason: "Simulators run on the Mac host.",
  },
  {
    id: "browser_profile",
    label: "Operator Chrome / logged-in browser profile",
    reason: "Social publish and SSO sessions must not fork onto a cloud browser.",
  },
  {
    id: "local_docker_sock",
    label: "Local Docker socket",
    reason: "Host docker.sock is not the fenced Continuity runtime.",
  },
] as const);

export const CONTINUITY_INVARIANTS = Object.freeze([
  {
    id: "one_thread_one_executor",
    label: "One thread, one executor",
    detail: "At most one unexpired lease holder may complete a task.",
  },
  {
    id: "fenced_lease",
    label: "90-second renewable lease",
    detail: `Lease TTL is ${CONTINUITY_LEASE_MS / 1000}s; renew must present the current token before expiry.`,
  },
  {
    id: "generation_cas",
    label: "Generation compare-and-swap",
    detail: "Claim bumps lease_generation; stale generations cannot complete.",
  },
  {
    id: "queued_handoff_not_migration",
    label: "Queued handoff, not process migration",
    detail: "Continuity re-runs from the prompt/thread snapshot — it does not migrate live process memory.",
  },
  {
    id: "entitlement_required",
    label: "Trial or paid entitlement",
    detail: `Trial: ${AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days} cloud runs / 14 days. Pro: ${cloudTaskLimit("pro")} / 30 days.`,
  },
  {
    id: "proving_in_real_use",
    label: "Still proving in real use",
    detail: "Canaries pass; do not claim always-on or seamless failover for every task.",
  },
] as const);

export type ContinuityEligibilityDecision =
  | { eligible: true; version: string }
  | {
      eligible: false;
      version: string;
      code: "local_only_tool";
      matched: string;
      message: string;
    };

/** Evaluate a prompt against the public matrix (same deny set as claim path). */
export function evaluateContinuityEligibility(prompt: string): ContinuityEligibilityDecision {
  const policy = evaluateCloudPromptToolPolicy(prompt);
  if (!policy.allowed) {
    return {
      eligible: false,
      version: CONTINUITY_ELIGIBILITY_VERSION,
      code: policy.code,
      matched: policy.matched,
      message: policy.message,
    };
  }
  return { eligible: true, version: CONTINUITY_ELIGIBILITY_VERSION };
}

/** Machine-readable matrix for landing, llms.txt consumers, and ops. */
export function buildContinuityEligibilityMatrix() {
  return {
    version: CONTINUITY_ELIGIBILITY_VERSION,
    model: "queued_prompt_handoff",
    not: "process_migration",
    leaseMs: CONTINUITY_LEASE_MS,
    renewRecommendedMs: CONTINUITY_RENEW_RECOMMENDED_MS,
    eligible: CONTINUITY_ELIGIBLE_CLASSES,
    localOnly: CONTINUITY_LOCAL_ONLY_CLASSES,
    enforcedLocalOnlyPatternIds: LOCAL_ONLY_PROMPT_PATTERNS.map((p) => p.id),
    invariants: CONTINUITY_INVARIANTS,
    limits: {
      trialCloudTasksPer30Days: AGENT_GOVERNANCE_LIMITS.trialCloudTasksPer30Days,
      paidCloudTasksPer30Days: AGENT_GOVERNANCE_LIMITS.paidCloudTasksPer30Days,
      maxActiveTasks: AGENT_GOVERNANCE_LIMITS.maxActiveTasks,
    },
    honesty: {
      claim: "Eligible Continuity tasks can continue on a fenced VPS when the Mac is offline.",
      avoid: [
        "always works",
        "seamless failover for every conversation",
        "process migration / live memory handoff",
        "Mac tool parity on the VPS",
      ],
    },
  };
}
