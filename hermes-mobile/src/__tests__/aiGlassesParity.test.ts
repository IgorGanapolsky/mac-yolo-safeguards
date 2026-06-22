import {
  buildSessionGreeting,
  resolvePresentationState,
} from '../utils/presentationMode';
import { runHermesAgentTool } from '../services/hermesAgentTools';
import type { GatewaySettings } from '../types/gateway';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

describe('presentationMode', () => {
  const base: GatewaySettings = { ...DEFAULT_GATEWAY_SETTINGS };

  it('uses full visual mode by default', () => {
    expect(resolvePresentationState(base)).toEqual({
      mode: 'visual',
      isDisplayCapable: true,
      visualsOn: true,
      preferAudioFeedback: false,
    });
  });

  it('switches to audio-first stack when glance mode is on', () => {
    const state = resolvePresentationState({ ...base, glanceMode: true });
    expect(state.mode).toBe('audio-first');
    expect(state.visualsOn).toBe(false);
    expect(state.preferAudioFeedback).toBe(true);
  });

  it('builds sign-of-life greeting with pending count', () => {
    expect(
      buildSessionGreeting({
        pendingCount: 2,
        healthLevel: 'green',
        connectionState: 'connected',
        glanceMode: true,
      }),
    ).toMatch(/2 pending approvals/);
  });
});

describe('hermesAgentTools', () => {
  const approval = {
    actionId: 'act-1',
    toolName: 'run_command',
    reason: 'dangerous',
    receivedAt: '2026-06-18T12:00:00Z',
  };

  it('approves top pending item via agent tool', async () => {
    const resolveApproval = jest.fn();
    const result = await runHermesAgentTool('approve_top_pending', {
      pendingApprovals: [approval],
      health: null,
      resolveApproval,
    });
    expect(result.ok).toBe(true);
    expect(resolveApproval).toHaveBeenCalledWith('act-1', 'approve');
  });

  it('fails when no pending approvals', async () => {
    const result = await runHermesAgentTool('reject_top_pending', {
      pendingApprovals: [],
      health: null,
      resolveApproval: jest.fn(),
    });
    expect(result.ok).toBe(false);
  });
});
