/**
 * Continuity is queued handoff, not Mac tool parity.
 * Block prompts that clearly require local-only surfaces before cloud claim/admission.
 *
 * Decision-contract framing (TDS agent-ready warehouse pattern):
 * local-only tools may be *recommended* from cloud context, but must not *execute*
 * on the Continuity runner — separate recommend vs action.
 */

import {
  contractForCloudContinuity,
  evaluateDecisionContract,
  type DecisionContractEvaluation,
} from "./decision-contract";

export type CloudToolDecision =
  | { allowed: true }
  | { allowed: false; code: "local_only_tool"; message: string; matched: string };

/** Patterns that should not auto-run on the VPS Continuity runner. */
export const LOCAL_ONLY_PROMPT_PATTERNS: ReadonlyArray<{ id: string; re: RegExp; hint: string }> = Object.freeze([
  { id: "applescript", re: /\b(osascript|applescript|tell\s+application)\b/i, hint: "AppleScript / macOS automation" },
  { id: "keychain", re: /\b(security\s+find-generic-password|keychain)\b/i, hint: "macOS Keychain" },
  { id: "imessage", re: /\b(imessage|messages\.app|bluebubbles)\b/i, hint: "Messages / iMessage" },
  { id: "local_usb", re: /\b(adb\s+(?:devices|reverse|shell)|ideviceinstaller|ios-deploy)\b/i, hint: "USB / local device tooling" },
  { id: "private_lan", re: /\b(192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[0-1])\.)\b/, hint: "private LAN address" },
  { id: "localhost_gateway", re: /\b(127\.0\.0\.1:8642|localhost:8642)\b/i, hint: "local Hermes gateway" },
]);

export function evaluateCloudPromptToolPolicy(prompt: string): CloudToolDecision {
  const text = String(prompt ?? "");
  for (const pattern of LOCAL_ONLY_PROMPT_PATTERNS) {
    if (pattern.re.test(text)) {
      return {
        allowed: false,
        code: "local_only_tool",
        matched: pattern.id,
        message: `Continuity cannot run this on the VPS (${pattern.hint}). Keep the Mac online or remove local-only steps.`,
      };
    }
  }
  return { allowed: true };
}

/**
 * Decision-contract view of Continuity tool policy:
 * - mode=recommend → always allowed (provisional if local-only matched)
 * - mode=execute → denied when local-only patterns match (action boundary)
 */
export function evaluateCloudPromptDecisionContract(input: {
  prompt: string;
  mode: "recommend" | "execute";
  entitled?: boolean;
  offlinePolicy?: "disabled" | "manual" | "auto";
  generatedAt?: string;
}): DecisionContractEvaluation & { matchedLocalOnly?: string } {
  const policy = evaluateCloudPromptToolPolicy(input.prompt);
  const matched = policy.allowed ? undefined : policy.matched;
  const contract = contractForCloudContinuity(input.offlinePolicy ?? "manual");
  // Local-only tools are never an approved execute source on cloud.
  const sourceApproved = policy.allowed;
  const evaluation = evaluateDecisionContract({
    contract,
    mode: input.mode,
    entitled: input.entitled,
    generatedAt: input.generatedAt,
    evidence: {
      machineOnline: false,
      leaseHeld: false,
      offlinePolicy: input.offlinePolicy ?? "manual",
      sourceApproved,
      evidenceComplete: policy.allowed,
    },
  });
  return matched ? { ...evaluation, matchedLocalOnly: matched } : evaluation;
}
