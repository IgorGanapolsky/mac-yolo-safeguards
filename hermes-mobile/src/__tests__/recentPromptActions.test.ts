import type { HermesSession } from '../types/chat';
import {
  buildFallbackPromptActions,
  buildRecentPromptActions,
  isBlockedRecentPromptText,
} from '../utils/recentPromptActions';

describe('recentPromptActions', () => {
  it('uses actual recent user prompts before fallback templates', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [
          { role: 'user', content: 'make money today' },
          { role: 'assistant', content: 'working' },
          { role: 'user', content: 'fix the mobile app connection' },
        ],
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions.map((action) => action.prompt)).toEqual([
      'fix the mobile app connection',
      'make money today',
    ]);
    expect(actions[0].id).toBe('recent-0');
    expect(actions[0].detail).toBe('recent prompt');
    expect(actions.some((action) => action.id === 'continue')).toBe(false);
  });

  it('dedupes repeated recent prompts', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [
          { role: 'user', content: 'print money' },
          { role: 'user', content: '  print   money  ' },
        ],
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].prompt).toBe('print money');
  });

  it('falls back only when no user prompts exist', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [{ role: 'assistant', content: 'hello' }],
      },
      buildFallbackPromptActions({ approvalCount: 1, isRunActive: true }),
    );

    expect(actions.map((action) => action.id)).toEqual(['continue', 'fix', 'money', 'status']);
    expect(actions[0].prompt).toContain('current run may still be active');
    expect(actions[1].prompt).toContain('Handle pending approval first');
  });

  it('uses pinned outbound text before transcript history', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [{ role: 'user', content: 'older prompt' }],
        pinnedOutboundText: 'e2e persistence check',
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions[0].prompt).toBe('e2e persistence check');
    expect(actions[0].detail).toBe('current prompt');
    expect(actions[1].prompt).toBe('older prompt');
  });

  it('uses session previews when transcript has no user prompts', () => {
    const sessions: HermesSession[] = [
      {
        id: 'session-a',
        preview: 'run ls in workspace',
        last_active_at: '2026-06-24T12:00:00Z',
      },
      {
        id: 'session-b',
        preview: 'ship hermes mobile fix',
        last_active_at: '2026-06-24T11:00:00Z',
      },
    ];

    const actions = buildRecentPromptActions(
      {
        messages: [{ role: 'assistant', content: 'done' }],
        sessions,
        currentSessionId: 'session-b',
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions.map((action) => action.prompt)).toEqual([
      'ship hermes mobile fix',
      'run ls in workspace',
    ]);
    expect(actions[0].detail).toBe('this chat');
    expect(actions[1].detail).toBe('recent chat');
  });

  it('blocks smoke and operator template previews', () => {
    expect(isBlockedRecentPromptText('Reply with exactly OK')).toBe(true);
    expect(
      isBlockedRecentPromptText(
        'continue from the current state, verify what changed, and execute the next concrete step with evidence.',
      ),
    ).toBe(true);
    expect(isBlockedRecentPromptText('run ls in workspace')).toBe(false);
  });
});
