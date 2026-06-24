import type { HermesApprovalRequest } from '../types/approval';
import type { PendingApproval } from '../types/gateway';
import type { ChatRunApproval, ChatTextApproval } from './chatApproval';
import { enrichApprovalRequest, inferRiskTier, rollbackHintForRisk } from './approvalProposal';

export function fromPendingApproval(
  pending: PendingApproval,
  policy?: 'strict' | 'balanced' | 'autonomous',
): HermesApprovalRequest {
  const runId = pending.runId ?? (pending.actionId.startsWith('run_') ? pending.actionId : undefined);
  const source = pending.source ?? (pending.approveText ? 'text_nudge' : 'gateway_guard');
  const riskTier = pending.riskTier ?? inferRiskTier(pending.command, pending.reason);
  const base: HermesApprovalRequest = {
    id: pending.actionId,
    source,
    runId,
    toolName: pending.toolName,
    title: pending.reason,
    reason: pending.reason,
    command: pending.command,
    workspacePath: pending.workspacePath,
    approveText: pending.approveText,
    riskTier,
    rollbackHint: pending.rollbackHint ?? rollbackHintForRisk(riskTier),
    allowPermanent: pending.allowPermanent ?? source !== 'text_nudge',
    receivedAt: pending.receivedAt,
    sessionKey: pending.sessionKey,
    diff: pending.diff,
  };
  return policy ? enrichApprovalRequest(base, policy) : base;
}

export function fromChatRunApproval(run: ChatRunApproval): HermesApprovalRequest {
  const riskTier = inferRiskTier(run.command, run.description);
  return {
    id: run.runId,
    source: 'gateway_guard',
    runId: run.runId,
    toolName: 'run_command',
    title: run.description || 'Command needs approval',
    reason: run.description,
    command: run.command,
    riskTier,
    rollbackHint: rollbackHintForRisk(riskTier),
    allowPermanent: run.allowPermanent ?? true,
  };
}

export function fromChatTextApproval(text: ChatTextApproval): HermesApprovalRequest {
  const riskTier = inferRiskTier(text.approveText, text.title);
  return {
    id: `text-${text.sourceMessageIndex}-${text.approveText}`,
    source: 'text_nudge',
    title: text.title,
    reason: text.title,
    command: text.approveText,
    approveText: text.approveText,
    riskTier,
    rollbackHint: rollbackHintForRisk(riskTier),
    allowPermanent: false,
  };
}

export function fromApprovalRequestEvent(
  data: Record<string, unknown>,
): HermesApprovalRequest | null {
  const runId = typeof data.run_id === 'string' ? data.run_id : '';
  if (!runId) {
    return null;
  }
  const allowPermanent = data.allow_permanent !== false;
  const description =
    typeof data.description === 'string' ? data.description : 'Dangerous command';
  const command = typeof data.command === 'string' ? data.command : undefined;
  const riskTier = inferRiskTier(command, description);
  return {
    id: runId,
    source: 'gateway_guard',
    runId,
    toolName:
      typeof data.pattern_key === 'string' ? data.pattern_key : 'run_command',
    title: description,
    reason: description,
    command,
    riskTier,
    rollbackHint: rollbackHintForRisk(riskTier),
    allowPermanent,
  };
}

export function dedupeApprovalRequests(
  requests: HermesApprovalRequest[],
): HermesApprovalRequest[] {
  const seen = new Set<string>();
  const out: HermesApprovalRequest[] = [];
  for (const request of requests) {
    const key = request.runId ?? request.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(request);
  }
  return out;
}
