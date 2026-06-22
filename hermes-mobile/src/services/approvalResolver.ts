import type { ApprovalChoice, HermesApprovalRequest } from '../types/approval';
import { submitRunApproval } from './hermesGatewayClient';
import { buildGateActionMessage } from './gatewayClient';

export type ApprovalResolveContext = {
  gatewayUrl: string;
  apiKey?: string | null;
  /** Send GATE.ACTION over an open events WebSocket. */
  sendGateAction?: (message: string) => void;
  /** Chat fallback for text nudges and edit messages. */
  sendChatText?: (text: string) => Promise<void>;
};

export const CHAT_APPROVAL_UNDO_TEXT =
  'UNDO — cancel the last approval; do not execute.';

export const CHAT_APPROVAL_DENY_TEXT =
  'DENY — operator rejected this action; do not execute.';

export const CHAT_APPROVAL_EDIT_PREFIX = 'EDIT — revise this plan: ';

export async function resolveApprovalChoice(
  request: HermesApprovalRequest,
  choice: ApprovalChoice,
  ctx: ApprovalResolveContext,
): Promise<void> {
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
        return;
      }
      if (!ctx.sendChatText) {
        throw new Error('Chat text sender required for text nudge deny');
      }
      await ctx.sendChatText(CHAT_APPROVAL_DENY_TEXT);
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
      return;
    }
    if (!ctx.sendChatText || !request.approveText) {
      throw new Error('Chat text sender required for text nudge approve');
    }
    await ctx.sendChatText(request.approveText);
    return;
  }

  if (request.runId) {
    await submitRunApproval(ctx.gatewayUrl, request.runId, choice, ctx.apiKey);
    return;
  }

  if (!ctx.sendGateAction) {
    throw new Error('No resolver available for this approval (missing run id or socket)');
  }

  const decision = (choice as string) === 'deny' ? 'reject' : 'approve';
  const message = buildGateActionMessage(request.id, decision, undefined, choice, request.source);
  ctx.sendGateAction(JSON.stringify(message));
}
