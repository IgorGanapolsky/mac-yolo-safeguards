import type { ApprovalChoice, HermesApprovalRequest } from '../types/approval';
import type { GatewaySettings } from '../types/gateway';
import { submitRunApproval } from './hermesGatewayClient';
import { buildGateActionMessage } from './gatewayClient';
import { recordLeashDecision, type LeashDecisionSource } from './leashDecisionHistory';
import { consumeFreeLeashApproval, getFreeLeashWeeklyStateSync } from '../utils/freeLeashAllowance';
import { hasThumbgateLeashPro, isProEntitledFromSnapshot } from '../utils/thumbgateLeash';

export type ApprovalResolveContext = {
  gatewayUrl: string;
  apiKey?: string | null;
  /** Send GATE.ACTION over an open events WebSocket. */
  sendGateAction?: (message: string) => void;
  /** Chat fallback for text nudges and edit messages. */
  sendChatText?: (text: string) => Promise<void>;
  /** When set, free-tier weekly allowance is enforced and consumed on routed approvals. */
  leashSettings?: GatewaySettings | null;
  /** Which surface the user tapped Approve/Deny on — recorded to local Leash history. */
  decisionSource?: LeashDecisionSource;
};

export const CHAT_APPROVAL_UNDO_TEXT =
  'UNDO — cancel the last approval; do not execute.';

export const CHAT_APPROVAL_DENY_TEXT =
  'DENY — operator rejected this action; do not execute.';

export const CHAT_APPROVAL_EDIT_PREFIX = 'EDIT — revise this plan: ';

export class FreeLeashWeeklyLimitError extends Error {
  constructor() {
    super('Free Leash weekly limit reached');
    this.name = 'FreeLeashWeeklyLimitError';
  }
}

function isProForAllowance(settings: GatewaySettings | null | undefined): boolean {
  if (settings) {
    return hasThumbgateLeashPro(settings);
  }
  return isProEntitledFromSnapshot();
}

function assertFreeLeashAllowance(settings: GatewaySettings | null | undefined): void {
  if (isProForAllowance(settings)) {
    return;
  }
  const { remaining } = getFreeLeashWeeklyStateSync();
  if (remaining <= 0) {
    throw new FreeLeashWeeklyLimitError();
  }
}

async function recordDecisionHistory(
  request: HermesApprovalRequest,
  choice: ApprovalChoice,
  ctx: ApprovalResolveContext,
): Promise<void> {
  await recordLeashDecision({
    actionId: request.id,
    decision: choice === 'deny' ? 'denied' : 'approved',
    title: request.title || request.reason || request.approveText || '',
    command: request.command,
    toolName: request.toolName,
    source: ctx.decisionSource ?? 'leash',
  });
}

async function recordFreeLeashConsumption(
  settings: GatewaySettings | null | undefined,
  choice: ApprovalChoice,
): Promise<void> {
  if (isProForAllowance(settings)) {
    return;
  }
  if (choice === 'deny') {
    return;
  }
  await consumeFreeLeashApproval();
}

export async function resolveApprovalChoice(
  request: HermesApprovalRequest,
  choice: ApprovalChoice,
  ctx: ApprovalResolveContext,
): Promise<void> {
  assertFreeLeashAllowance(ctx.leashSettings);
  if (request.source === 'text_nudge') {
    if (choice === 'deny') {
      if (ctx.sendGateAction && request.sessionKey) {
        const message = buildGateActionMessage(
          request.id,
          'reject',
          undefined,
          'deny',
          'text_nudge',
        );
        ctx.sendGateAction(JSON.stringify(message));
        await recordFreeLeashConsumption(ctx.leashSettings, choice);
        await recordDecisionHistory(request, choice, ctx);
        return;
      }
      if (!ctx.sendChatText) {
        throw new Error('Chat text sender required for text nudge deny');
      }
      await ctx.sendChatText(CHAT_APPROVAL_DENY_TEXT);
      await recordDecisionHistory(request, choice, ctx);
      return;
    }
    if (ctx.sendGateAction && request.sessionKey) {
      const message = buildGateActionMessage(
        request.id,
        'approve',
        undefined,
        'once',
        'text_nudge',
      );
      ctx.sendGateAction(JSON.stringify(message));
      await recordFreeLeashConsumption(ctx.leashSettings, choice);
      await recordDecisionHistory(request, choice, ctx);
      return;
    }
    if (!ctx.sendChatText || !request.approveText) {
      throw new Error('Chat text sender required for text nudge approve');
    }
    await ctx.sendChatText(request.approveText);
    await recordFreeLeashConsumption(ctx.leashSettings, choice);
    await recordDecisionHistory(request, choice, ctx);
    return;
  }

  if (request.runId) {
    await submitRunApproval(ctx.gatewayUrl, request.runId, choice, ctx.apiKey);
    await recordFreeLeashConsumption(ctx.leashSettings, choice);
    await recordDecisionHistory(request, choice, ctx);
    return;
  }

  if (!ctx.sendGateAction) {
    throw new Error('No resolver available for this approval (missing run id or socket)');
  }

  const decision = (choice as string) === 'deny' ? 'reject' : 'approve';
  const message = buildGateActionMessage(request.id, decision, undefined, choice, request.source);
  ctx.sendGateAction(JSON.stringify(message));
  await recordFreeLeashConsumption(ctx.leashSettings, choice);
  await recordDecisionHistory(request, choice, ctx);
}
