import type { ApprovalChoice, HermesApprovalRequest } from '../types/approval';
import {
  CHAT_APPROVAL_DENY_TEXT,
  resolveApprovalChoice,
  type ApprovalResolveContext,
} from '../services/approvalResolver';
import { submitRunApproval } from '../services/hermesGatewayClient';

jest.mock('../services/hermesGatewayClient', () => ({
  submitRunApproval: jest.fn().mockResolvedValue(undefined),
}));

const mockSubmitRunApproval = submitRunApproval as jest.MockedFunction<
  typeof submitRunApproval
>;

function makeRequest(
  overrides: Partial<HermesApprovalRequest> = {},
): HermesApprovalRequest {
  return {
    id: 'action-123',
    source: 'gateway_guard',
    title: 'Delete old entries',
    allowPermanent: true,
    ...overrides,
  };
}

function makeCtx(
  overrides: Partial<ApprovalResolveContext> = {},
): ApprovalResolveContext {
  return {
    gatewayUrl: 'http://100.87.85.85:8642',
    apiKey: 'secret-key',
    ...overrides,
  };
}

/** Parse the single JSON string handed to a sendGateAction mock. */
function parseGateMessage(mock: jest.Mock) {
  expect(mock).toHaveBeenCalledTimes(1);
  return JSON.parse(mock.mock.calls[0][0] as string);
}

function gateActionThatDelivers(): jest.Mock {
  return jest.fn().mockReturnValue(true);
}

function gateActionThatMisses(): jest.Mock {
  return jest.fn().mockReturnValue(false);
}

describe('resolveApprovalChoice', () => {
  beforeEach(() => {
    mockSubmitRunApproval.mockClear();
    mockSubmitRunApproval.mockResolvedValue(undefined);
  });

  describe('text_nudge routing', () => {
    it('routes text_nudge DENY over the WebSocket when a socket and sessionKey exist', async () => {
      const sendGateAction = gateActionThatDelivers();
      const sendChatText = jest.fn().mockResolvedValue(undefined);
      const request = makeRequest({
        source: 'text_nudge',
        sessionKey: 'tg:42',
        approveText: 'APPROVE DEPLOY',
      });

      await resolveApprovalChoice(request, 'deny', makeCtx({ sendGateAction, sendChatText }));

      const message = parseGateMessage(sendGateAction);
      expect(message.event).toBe('GATE.ACTION');
      expect(message.payload.actionId).toBe('action-123');
      expect(message.payload.decision).toBe('reject');
      expect(message.payload.choice).toBe('deny');
      expect(message.payload.source).toBe('text_nudge');
      // WS path wins — no chat fallback, no run POST.
      expect(sendChatText).not.toHaveBeenCalled();
      expect(mockSubmitRunApproval).not.toHaveBeenCalled();
    });

    it('falls back to chat DENY text when the events socket is closed', async () => {
      const sendGateAction = gateActionThatMisses();
      const sendChatText = jest.fn().mockResolvedValue(undefined);
      const request = makeRequest({ source: 'text_nudge', sessionKey: 'tg:42' });

      await resolveApprovalChoice(request, 'deny', makeCtx({ sendGateAction, sendChatText }));

      expect(sendGateAction).toHaveBeenCalledTimes(1);
      expect(sendChatText).toHaveBeenCalledTimes(1);
      expect(sendChatText).toHaveBeenCalledWith(CHAT_APPROVAL_DENY_TEXT);
    });

    it('falls back to chat DENY text when there is no socket', async () => {
      const sendChatText = jest.fn().mockResolvedValue(undefined);
      const request = makeRequest({ source: 'text_nudge', sessionKey: 'tg:42' });

      await resolveApprovalChoice(request, 'deny', makeCtx({ sendChatText }));

      expect(sendChatText).toHaveBeenCalledTimes(1);
      expect(sendChatText).toHaveBeenCalledWith(CHAT_APPROVAL_DENY_TEXT);
    });

    it('falls back to chat DENY text when a socket exists but no sessionKey', async () => {
      const sendGateAction = gateActionThatDelivers();
      const sendChatText = jest.fn().mockResolvedValue(undefined);
      const request = makeRequest({ source: 'text_nudge' }); // no sessionKey

      await resolveApprovalChoice(
        request,
        'deny',
        makeCtx({ sendGateAction, sendChatText }),
      );

      expect(sendGateAction).not.toHaveBeenCalled();
      expect(sendChatText).toHaveBeenCalledWith(CHAT_APPROVAL_DENY_TEXT);
    });

    it('throws when a text_nudge DENY has no transport at all', async () => {
      const request = makeRequest({ source: 'text_nudge' });

      await expect(
        resolveApprovalChoice(request, 'deny', makeCtx()),
      ).rejects.toThrow('Chat text sender required for text nudge deny');
    });

    it('routes text_nudge APPROVE over the WebSocket as approve/once', async () => {
      const sendGateAction = gateActionThatDelivers();
      const request = makeRequest({
        source: 'text_nudge',
        sessionKey: 'tg:42',
        approveText: 'APPROVE DEPLOY',
      });

      await resolveApprovalChoice(request, 'once', makeCtx({ sendGateAction }));

      const message = parseGateMessage(sendGateAction);
      expect(message.payload.decision).toBe('approve');
      expect(message.payload.choice).toBe('once');
      expect(message.payload.source).toBe('text_nudge');
    });

    it('coerces any non-deny text_nudge choice to approve/once over the socket', async () => {
      const sendGateAction = gateActionThatDelivers();
      const request = makeRequest({
        source: 'text_nudge',
        sessionKey: 'tg:42',
        approveText: 'APPROVE DEPLOY',
      });

      // choice 'session' still normalizes to approve/once for the legacy nudge path.
      await resolveApprovalChoice(request, 'session', makeCtx({ sendGateAction }));

      const message = parseGateMessage(sendGateAction);
      expect(message.payload.decision).toBe('approve');
      expect(message.payload.choice).toBe('once');
    });

    it('sends the exact approveText phrase via chat when there is no socket', async () => {
      const sendChatText = jest.fn().mockResolvedValue(undefined);
      const request = makeRequest({
        source: 'text_nudge',
        approveText: 'APPROVE DEPLOY TRIAGE',
      });

      await resolveApprovalChoice(request, 'once', makeCtx({ sendChatText }));

      expect(sendChatText).toHaveBeenCalledTimes(1);
      expect(sendChatText).toHaveBeenCalledWith('APPROVE DEPLOY TRIAGE');
    });

    it('throws when a text_nudge APPROVE has no socket and no approveText', async () => {
      const sendChatText = jest.fn().mockResolvedValue(undefined);
      const request = makeRequest({ source: 'text_nudge' }); // no approveText

      await expect(
        resolveApprovalChoice(request, 'once', makeCtx({ sendChatText })),
      ).rejects.toThrow('Chat text sender required for text nudge approve');
      expect(sendChatText).not.toHaveBeenCalled();
    });

    it('throws when a text_nudge APPROVE has no chat sender at all', async () => {
      const request = makeRequest({
        source: 'text_nudge',
        approveText: 'APPROVE DEPLOY',
      });

      await expect(
        resolveApprovalChoice(request, 'once', makeCtx()),
      ).rejects.toThrow('Chat text sender required for text nudge approve');
    });
  });

  describe('run-id (gateway REST) routing', () => {
    it('POSTs the run approval when a runId is present, ahead of the socket', async () => {
      const sendGateAction = jest.fn();
      const request = makeRequest({ runId: 'run-777', source: 'gateway_guard' });

      await resolveApprovalChoice(
        request,
        'session',
        makeCtx({ sendGateAction }),
      );

      expect(mockSubmitRunApproval).toHaveBeenCalledTimes(1);
      expect(mockSubmitRunApproval).toHaveBeenCalledWith(
        'http://100.87.85.85:8642',
        'run-777',
        'session',
        'secret-key',
      );
      // Run POST wins — the socket is not used.
      expect(sendGateAction).not.toHaveBeenCalled();
    });

    it('propagates a rejected submitRunApproval', async () => {
      mockSubmitRunApproval.mockRejectedValueOnce(new Error('HTTP 500'));
      const request = makeRequest({ runId: 'run-777' });

      await expect(
        resolveApprovalChoice(request, 'once', makeCtx()),
      ).rejects.toThrow('HTTP 500');
    });
    it('POSTs run approval for text_nudge when runId is present', async () => {
      const sendGateAction = gateActionThatDelivers();
      const request = makeRequest({
        runId: 'run-888',
        source: 'text_nudge',
        sessionKey: 'tg:42',
        approveText: 'APPROVE DEPLOY',
      });

      await resolveApprovalChoice(request, 'once', makeCtx({ sendGateAction }));

      expect(mockSubmitRunApproval).toHaveBeenCalledWith(
        'http://100.87.85.85:8642',
        'run-888',
        'once',
        'secret-key',
      );
      expect(sendGateAction).not.toHaveBeenCalled();
    });
  });

  describe('gate-action (WebSocket) routing for guard approvals', () => {
    it('sends an approve GATE.ACTION for a non-deny choice', async () => {
      const sendGateAction = gateActionThatDelivers();
      const request = makeRequest({ source: 'gateway_guard' }); // no runId

      await resolveApprovalChoice(request, 'always', makeCtx({ sendGateAction }));

      const message = parseGateMessage(sendGateAction);
      expect(message.event).toBe('GATE.ACTION');
      expect(message.payload.decision).toBe('approve');
      expect(message.payload.choice).toBe('always');
      expect(message.payload.source).toBe('gateway_guard');
      expect(mockSubmitRunApproval).not.toHaveBeenCalled();
    });

    it('maps a DENY choice to a reject GATE.ACTION', async () => {
      const sendGateAction = gateActionThatDelivers();
      const request = makeRequest({ source: 'relay_hook' });

      await resolveApprovalChoice(request, 'deny', makeCtx({ sendGateAction }));

      const message = parseGateMessage(sendGateAction);
      expect(message.payload.decision).toBe('reject');
      expect(message.payload.choice).toBe('deny');
      expect(message.payload.source).toBe('relay_hook');
    });

    it('throws when there is no runId and no socket', async () => {
      const request = makeRequest({ source: 'gateway_guard' });

      await expect(
        resolveApprovalChoice(request, 'once', makeCtx()),
      ).rejects.toThrow(
        'No resolver available for this approval (missing run id or socket)',
      );
    });

    it('throws when the events socket is closed', async () => {
      const sendGateAction = gateActionThatMisses();
      const request = makeRequest({ source: 'gateway_guard' });

      await expect(
        resolveApprovalChoice(request, 'once', makeCtx({ sendGateAction })),
      ).rejects.toThrow('Computer events socket is not connected — reconnect and try again.');
    });
  });
});
