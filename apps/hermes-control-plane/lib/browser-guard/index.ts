/**
 * Entry point for the browser toolset guard.
 *
 * The toolset ships 31 members and no controls of its own; its docs place every
 * control on the executor. This composes the three rule sets into one decision.
 *
 * It is a decision function, not an enforcement point. The caller must refuse a
 * "deny" and must route a "confirm" to a person before running the action.
 *
 * Relative specifiers carry an explicit .ts extension so the module loads under
 * node's ESM loader as well as the bundler, matching lib/content-lane.ts and
 * lib/hosted-tool-approvals.ts. Without it the unit tests cannot import this.
 */

import { evaluateNavigation, type NetDecision } from "./network.ts";
import { evaluateMember, matchGuardedLabel, type MemberDecision } from "./members.ts";

export * from "./network.ts";
export * from "./members.ts";
export * from "./sanitize.ts";

export type BrowserDecision = NetDecision | MemberDecision;

export interface BrowserGuardConfig {
  /** Hostnames the agent may reach. Fails closed when empty. */
  allowedDomains?: string[];
  /** Optional members explicitly turned on; anything else is denied. */
  enabledOptionalMembers?: string[];
  /** Pause on guarded labels. Default true; opt out knowingly. */
  confirmGuarded?: boolean;
  /** Operator-supplied substrings marking an element as irreversible. */
  guardedLabels?: string[];
}

export interface BrowserActionContext {
  /** Accessible label of the target, from read_page or find. */
  targetLabel?: string;
  /** URL of the tab the action runs against, when known. */
  currentUrl?: string;
}

export interface BrowserActionInput {
  member: string;
  input?: Record<string, unknown>;
  config?: BrowserGuardConfig;
  context?: BrowserActionContext;
}

export function evaluateBrowserAction({
  member,
  input = {},
  config = {},
  context = {},
}: BrowserActionInput): BrowserDecision {
  // Member availability first: a disabled member is denied whatever it targets.
  const memberDecision = evaluateMember(member, config.enabledOptionalMembers ?? []);
  if (memberDecision.decision !== "allow") return memberDecision;

  if (member === "navigate") {
    return evaluateNavigation(input.url, config.allowedDomains ?? []);
  }

  if (config.confirmGuarded ?? true) {
    const hit = matchGuardedLabel(member, context.targetLabel, config.guardedLabels ?? []);
    if (hit) {
      return {
        decision: "confirm",
        code: "guarded_action_requires_approval",
        reason: `"${context.targetLabel}" matched the guarded label "${hit}". Confirm before the agent commits to it.`,
      };
    }
  }

  return { decision: "allow" };
}
