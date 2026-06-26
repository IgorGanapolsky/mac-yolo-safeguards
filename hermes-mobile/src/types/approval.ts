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

export function choicesForRequest(
  request: HermesApprovalRequest,
  policy: ApprovalPolicy = 'balanced',
): ApprovalChoice[] {
  if (request.source === 'text_nudge') {
    return ['once', 'deny'];
  }
  if (!request.allowPermanent || policy === 'strict') {
    return ['once', 'deny'];
  }
  if (policy === 'autonomous' && request.riskTier === 'low') {
    return ['once', 'deny'];
  }
  return DEFAULT_APPROVAL_CHOICES;
}
