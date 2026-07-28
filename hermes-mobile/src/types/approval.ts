/** Canonical Hermes approval model — aligned with gateway `approval_data` + transport metadata. */

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

export type ApprovalSource = 'gateway_guard' | 'text_nudge' | 'relay_hook';

export type ApprovalRiskTier = 'low' | 'medium' | 'high';

/** Mobile operator preference — mirrors Mac `approvals.mode` tiers in UX only. */
export type ApprovalPolicy = 'strict' | 'balanced' | 'autonomous';

export type HermesApprovalRequest = {
  /** Stable id for dedupe — run_id, actionId, or synthetic for text nudges. */
  id: string;
  source: ApprovalSource;
  /** When present, resolve via POST /v1/runs/{runId}/approval */
  runId?: string;
  toolName?: string;
  title: string;
  reason?: string;
  command?: string;
  workspacePath?: string;
  /** Text nudge: exact phrase sent on approve-once (legacy agent path). */
  approveText?: string;
  riskTier?: ApprovalRiskTier;
  rollbackHint?: string;
  allowPermanent: boolean;
  receivedAt?: string;
  /** When set, approve/deny routes to this gateway session (Telegram), not mobile chat only. */
  sessionKey?: string;
  /** Unified diff from gate / git — Codex-style review before approve. */
  diff?: string;
};

export const DEFAULT_APPROVAL_CHOICES: ApprovalChoice[] = ['once', 'session', 'always', 'deny'];

/** Human labels for the approval buttons — shared by the cards and the Settings preview. */
export const APPROVAL_CHOICE_LABELS: Record<ApprovalChoice, string> = {
  once: 'Once',
  session: 'This session',
  always: 'Always allow',
  deny: 'Deny',
};

/**
 * Which buttons an approval card offers, given the operator's policy.
 *
 * The tiers are a MONOTONIC ladder — strict ⊂ balanced ⊂ autonomous — so raising the policy can
 * only ever add choices. Before 2026-07-28 `autonomous` returned ['once','deny'] for low-risk
 * requests, making it *stricter* than balanced and identical to strict, which is the opposite of
 * what the label promises. That branch had zero test coverage and arrived inside an unrelated
 * grab-bag commit (3fdf156a4 "analytics, monetization UX, and launch plumbing"), so it reads as a
 * slip rather than a decision. Igor hit the symptom on a physical device: toggling the three chips
 * changed nothing he could observe.
 *
 * `always` writes a PERMANENT standing rule, so it is now the thing the most permissive tier
 * unlocks rather than a default-tier button.
 */
/**
 * Whether the CURRENT transport can actually carry a lasting decision back to the Mac.
 *
 * The cloud relay cannot: `GatewayContext.submitApprovalChoice` collapses every non-deny choice to
 * a single `allow` verdict (`const verdict = choice === 'deny' ? 'block' : 'allow'`), so over relay
 * "Always allow" creates no standing rule — it behaves exactly like "Once". Offering it there would
 * be a button that silently does less than it says, which is the precise failure this whole change
 * exists to remove. So the transport gets a veto, the same way the gateway's `allowPermanent` does.
 */
export type ApprovalTransportCapabilities = {
  /** false when the decision rides the cloud relay, which cannot express scope. */
  canPersistDecision?: boolean;
};

export function choicesForRequest(
  request: HermesApprovalRequest,
  policy: ApprovalPolicy = 'balanced',
  transport: ApprovalTransportCapabilities = {},
): ApprovalChoice[] {
  // A text nudge is answered by sending one phrase back to the agent — there is no gateway-side
  // rule to persist, so only this single reply is meaningful regardless of policy.
  if (request.source === 'text_nudge') {
    return ['once', 'deny'];
  }
  if (policy === 'strict') {
    return ['once', 'deny'];
  }
  // The GATEWAY decides whether a lasting rule is possible at all; policy can never override it.
  if (!request.allowPermanent) {
    return ['once', 'deny'];
  }
  // ...and neither can policy override the TRANSPORT. Never render a scope the wire drops.
  if (transport.canPersistDecision === false) {
    return ['once', 'deny'];
  }
  if (policy === 'autonomous') {
    return DEFAULT_APPROVAL_CHOICES;
  }
  return ['once', 'session', 'deny'];
}

/**
 * The choices a typical gateway approval will offer under `policy` — what Settings previews so the
 * operator can see the effect of the toggle immediately, instead of having to wait for a real
 * approval to arrive and compare from memory.
 */
export function policyChoicePreview(policy: ApprovalPolicy): ApprovalChoice[] {
  return choicesForRequest(
    {
      id: 'preview',
      source: 'gateway_guard',
      title: 'preview',
      allowPermanent: true,
      riskTier: 'low',
    },
    policy,
  );
}
