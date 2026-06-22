import type {
  ApprovalChoice,
  ApprovalPolicy,
  ApprovalRiskTier,
  ApprovalSource,
  HermesApprovalRequest,
} from '../types/approval';
import { choicesForRequest } from '../types/approval';

/** Wire / gateway JSON shape (snake_case). */
export type HermesApprovalProposalJson = {
  id: string;
  source: ApprovalSource;
  run_id?: string;
  tool_name?: string;
  title: string;
  reason?: string;
  command?: string;
  workspace_path?: string;
  approve_text?: string;
  risk_tier?: ApprovalRiskTier;
  rollback_hint?: string;
  allow_permanent?: boolean;
  choices?: ApprovalChoice[];
  received_at?: string;
};

const HIGH_RISK_RE =
  /vercel\s+--prod|--prod\b|stripe\s+live|production\s+deploy|rm\s+-rf|delete\s+account|DROP\s+TABLE/i;
const MEDIUM_RISK_RE =
  /git\s+push|send.*email|post.*comment|skool.*dm|checkout|payment|deploy/i;

export function inferRiskTier(command?: string, title?: string): ApprovalRiskTier {
  const blob = `${command ?? ''} ${title ?? ''}`;
  if (HIGH_RISK_RE.test(blob)) {
    return 'high';
  }
  if (MEDIUM_RISK_RE.test(blob)) {
    return 'medium';
  }
  return 'low';
}

export function rollbackHintForRisk(tier: ApprovalRiskTier): string | undefined {
  if (tier === 'high') {
    return 'Rollback: redeploy previous build or abort pipeline before retrying.';
  }
  if (tier === 'medium') {
    return 'Rollback: undo in chat or revert the last commit if needed.';
  }
  return undefined;
}

export function toApprovalProposalJson(request: HermesApprovalRequest): HermesApprovalProposalJson {
  const riskTier = request.riskTier ?? inferRiskTier(request.command, request.title);
  return {
    id: request.id,
    source: request.source,
    run_id: request.runId,
    tool_name: request.toolName,
    title: request.title,
    reason: request.reason,
    command: request.command,
    workspace_path: request.workspacePath,
    approve_text: request.approveText,
    risk_tier: riskTier,
    rollback_hint: request.rollbackHint ?? rollbackHintForRisk(riskTier),
    allow_permanent: request.allowPermanent,
    choices: choicesForRequest(request),
    received_at: request.receivedAt,
  };
}

export function fromApprovalProposalJson(
  json: HermesApprovalProposalJson,
): HermesApprovalRequest {
  const riskTier = json.risk_tier ?? inferRiskTier(json.command, json.title);
  return {
    id: json.id,
    source: json.source,
    runId: json.run_id,
    toolName: json.tool_name,
    title: json.title,
    reason: json.reason,
    command: json.command,
    workspacePath: json.workspace_path,
    approveText: json.approve_text,
    riskTier,
    rollbackHint: json.rollback_hint ?? rollbackHintForRisk(riskTier),
    allowPermanent: json.allow_permanent ?? json.source !== 'text_nudge',
    receivedAt: json.received_at,
  };
}

export function enrichApprovalRequest(
  request: HermesApprovalRequest,
  policy: ApprovalPolicy = 'balanced',
): HermesApprovalRequest {
  const riskTier = request.riskTier ?? inferRiskTier(request.command, request.title);
  const rollbackHint = request.rollbackHint ?? rollbackHintForRisk(riskTier);
  let allowPermanent = request.allowPermanent;
  if (policy === 'strict' || request.source === 'text_nudge') {
    allowPermanent = false;
  }
  if (policy === 'strict' && riskTier === 'high') {
    allowPermanent = false;
  }
  return { ...request, riskTier, rollbackHint, allowPermanent };
}
