import type { GatewayHealthSnapshot, PendingApproval } from '../types/gateway';

/** Named agent tools — same pattern as Gemini Live function calling on AI glasses. */
export type HermesAgentToolName =
  | 'get_pending_approval_count'
  | 'get_gateway_health'
  | 'approve_top_pending'
  | 'reject_top_pending'
  | 'list_pending_tools';

export type HermesAgentToolResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export type HermesAgentToolContext = {
  pendingApprovals: PendingApproval[];
  health: GatewayHealthSnapshot | null;
  resolveApproval: (actionId: string, decision: 'approve' | 'reject') => void;
};

export async function runHermesAgentTool(
  name: HermesAgentToolName,
  ctx: HermesAgentToolContext,
): Promise<HermesAgentToolResult> {
  switch (name) {
    case 'get_pending_approval_count':
      return { ok: true, data: { count: ctx.pendingApprovals.length } };

    case 'get_gateway_health':
      return {
        ok: true,
        data: {
          level: ctx.health?.level ?? 'unknown',
          status: ctx.health?.status,
          gatewayState: ctx.health?.gatewayState,
        },
      };

    case 'list_pending_tools':
      return {
        ok: true,
        data: {
          tools: ctx.pendingApprovals.map((item) => ({
            actionId: item.actionId,
            toolName: item.toolName,
          })),
        },
      };

    case 'approve_top_pending': {
      const top = ctx.pendingApprovals[0];
      if (!top) {
        return { ok: false, error: 'No pending approvals' };
      }
      ctx.resolveApproval(top.actionId, 'approve');
      return { ok: true, data: { actionId: top.actionId, decision: 'approve' } };
    }

    case 'reject_top_pending': {
      const top = ctx.pendingApprovals[0];
      if (!top) {
        return { ok: false, error: 'No pending approvals' };
      }
      ctx.resolveApproval(top.actionId, 'reject');
      return { ok: true, data: { actionId: top.actionId, decision: 'reject' } };
    }

    default:
      return { ok: false, error: `Unknown tool: ${name as string}` };
  }
}
