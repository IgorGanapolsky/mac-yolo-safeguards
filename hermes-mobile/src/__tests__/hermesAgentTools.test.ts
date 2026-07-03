import { runHermesAgentTool } from '../services/hermesAgentTools';
import type {
  HermesAgentToolContext,
  HermesAgentToolName,
} from '../services/hermesAgentTools';
import type { GatewayHealthSnapshot, PendingApproval } from '../types/gateway';

function makePending(overrides: Partial<PendingApproval> = {}): PendingApproval {
  return {
    actionId: 'act_1',
    toolName: 'run_terminal',
    reason: 'needs approval',
    receivedAt: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<HermesAgentToolContext> = {},
): { ctx: HermesAgentToolContext; resolveApproval: jest.Mock } {
  const resolveApproval = jest.fn();
  const ctx: HermesAgentToolContext = {
    pendingApprovals: [],
    health: null,
    resolveApproval,
    ...overrides,
  };
  return { ctx, resolveApproval };
}

describe('runHermesAgentTool', () => {
  describe('get_pending_approval_count', () => {
    it('reports zero for an empty queue', async () => {
      const { ctx } = makeContext();
      const result = await runHermesAgentTool('get_pending_approval_count', ctx);
      expect(result).toEqual({ ok: true, data: { count: 0 } });
    });

    it('counts every pending approval', async () => {
      const { ctx } = makeContext({
        pendingApprovals: [
          makePending({ actionId: 'a' }),
          makePending({ actionId: 'b' }),
          makePending({ actionId: 'c' }),
        ],
      });
      const result = await runHermesAgentTool('get_pending_approval_count', ctx);
      expect(result).toEqual({ ok: true, data: { count: 3 } });
    });
  });

  describe('get_gateway_health', () => {
    it('falls back to "unknown" level when health is null', async () => {
      const { ctx } = makeContext({ health: null });
      const result = await runHermesAgentTool('get_gateway_health', ctx);
      expect(result).toEqual({
        ok: true,
        data: { level: 'unknown', status: undefined, gatewayState: undefined },
      });
    });

    it('surfaces level, status and gatewayState from the snapshot', async () => {
      const health: GatewayHealthSnapshot = {
        level: 'green',
        status: 'ok',
        gatewayState: 'running',
        checkedAt: '2026-07-03T00:00:00.000Z',
      };
      const { ctx } = makeContext({ health });
      const result = await runHermesAgentTool('get_gateway_health', ctx);
      expect(result).toEqual({
        ok: true,
        data: { level: 'green', status: 'ok', gatewayState: 'running' },
      });
    });
  });

  describe('list_pending_tools', () => {
    it('returns an empty tool list when nothing is pending', async () => {
      const { ctx } = makeContext();
      const result = await runHermesAgentTool('list_pending_tools', ctx);
      expect(result).toEqual({ ok: true, data: { tools: [] } });
    });

    it('projects only actionId and toolName, preserving order', async () => {
      const { ctx } = makeContext({
        pendingApprovals: [
          makePending({ actionId: 'a1', toolName: 'edit_file', reason: 'secret' }),
          makePending({ actionId: 'a2', toolName: 'delete_file', diff: 'huge diff' }),
        ],
      });
      const result = await runHermesAgentTool('list_pending_tools', ctx);
      expect(result).toEqual({
        ok: true,
        data: {
          tools: [
            { actionId: 'a1', toolName: 'edit_file' },
            { actionId: 'a2', toolName: 'delete_file' },
          ],
        },
      });
      // Verify the projection does not leak other fields.
      if (result.ok) {
        const tools = result.data.tools as Array<Record<string, unknown>>;
        expect(Object.keys(tools[0])).toEqual(['actionId', 'toolName']);
      }
    });
  });

  describe('approve_top_pending', () => {
    it('resolves the first approval with an approve decision', async () => {
      const { ctx, resolveApproval } = makeContext({
        pendingApprovals: [
          makePending({ actionId: 'top' }),
          makePending({ actionId: 'second' }),
        ],
      });
      const result = await runHermesAgentTool('approve_top_pending', ctx);
      expect(result).toEqual({
        ok: true,
        data: { actionId: 'top', decision: 'approve' },
      });
      expect(resolveApproval).toHaveBeenCalledTimes(1);
      expect(resolveApproval).toHaveBeenCalledWith('top', 'approve');
    });

    it('errors and does not resolve when nothing is pending', async () => {
      const { ctx, resolveApproval } = makeContext();
      const result = await runHermesAgentTool('approve_top_pending', ctx);
      expect(result).toEqual({ ok: false, error: 'No pending approvals' });
      expect(resolveApproval).not.toHaveBeenCalled();
    });
  });

  describe('reject_top_pending', () => {
    it('resolves the first approval with a reject decision', async () => {
      const { ctx, resolveApproval } = makeContext({
        pendingApprovals: [makePending({ actionId: 'top' })],
      });
      const result = await runHermesAgentTool('reject_top_pending', ctx);
      expect(result).toEqual({
        ok: true,
        data: { actionId: 'top', decision: 'reject' },
      });
      expect(resolveApproval).toHaveBeenCalledWith('top', 'reject');
    });

    it('errors and does not resolve when nothing is pending', async () => {
      const { ctx, resolveApproval } = makeContext();
      const result = await runHermesAgentTool('reject_top_pending', ctx);
      expect(result).toEqual({ ok: false, error: 'No pending approvals' });
      expect(resolveApproval).not.toHaveBeenCalled();
    });
  });

  describe('unknown tools', () => {
    it('returns a descriptive error for an unregistered tool name', async () => {
      const { ctx, resolveApproval } = makeContext();
      const result = await runHermesAgentTool(
        'not_a_real_tool' as HermesAgentToolName,
        ctx,
      );
      expect(result).toEqual({ ok: false, error: 'Unknown tool: not_a_real_tool' });
      expect(resolveApproval).not.toHaveBeenCalled();
    });
  });
});
