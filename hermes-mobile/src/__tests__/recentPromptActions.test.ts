import type { HermesSession } from '../types/chat';
import {
  buildFallbackPromptActions,
  buildRecentPromptActions,
  E2E_CHAT_SEND_PERSISTENCE_PROMPT,
  isBlockedRecentPromptText,
  isPromptVisibleInTranscript,
} from '../utils/recentPromptActions';

describe('recentPromptActions', () => {
  it('uses stored recent prompts before fallback templates', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [],
        localRecentPrompts: ['fix the mobile app connection', 'make money today'],
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
        messages: [],
        localRecentPrompts: ['print money', '  print   money  '],
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].prompt).toBe('print money');
  });

  it('returns no chips when no user prompts or usable session titles exist', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [{ role: 'assistant', content: 'hello' }],
      },
      buildFallbackPromptActions({ approvalCount: 1, isRunActive: true }),
    );

    expect(actions).toEqual([]);
  });

  it('skips e2e persistence session previews and titles', () => {
    const sessions: HermesSession[] = [
      {
        id: 'session-a',
        title: 'e2e-persistence-check-ls',
        preview: E2E_CHAT_SEND_PERSISTENCE_PROMPT,
        last_active_at: '2026-06-24T12:00:00Z',
      },
    ];

    const actions = buildRecentPromptActions(
      {
        messages: [],
        sessions,
        currentSessionId: 'session-a',
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions).toEqual([]);
  });

  it('uses session title when preview is cron boilerplate', () => {
    const sessions: HermesSession[] = [
      {
        id: 'session-a',
        title: 'safeguards setup inquiry',
        preview: '[IMPORTANT: You are running as a scheduled cron job',
        last_active_at: '2026-06-24T12:00:00Z',
      },
    ];

    const actions = buildRecentPromptActions(
      {
        messages: [],
        sessions,
        currentSessionId: 'session-a',
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions[0].prompt).toBe('safeguards setup inquiry');
    expect(actions[0].detail).toBe('this chat');
  });

  it('uses pinned outbound text before transcript history', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [{ role: 'user', content: 'older prompt' }],
        pinnedOutboundText: 'ship hermes mobile fix',
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions[0].prompt).toBe('ship hermes mobile fix');
    expect(actions[0].detail).toBe('current prompt');
    expect(actions[1]).toBeUndefined();
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
    expect(isBlockedRecentPromptText('Merged Hermes threads from your Mac')).toBe(true);
    expect(isBlockedRecentPromptText('e2e-persistence-check-ls')).toBe(true);
    expect(isBlockedRecentPromptText('e2e persistence check')).toBe(true);
    expect(isBlockedRecentPromptText(E2E_CHAT_SEND_PERSISTENCE_PROMPT)).toBe(true);
    expect(isBlockedRecentPromptText('print money, make money faster')).toBe(true);
    expect(
      isBlockedRecentPromptText(
        'Print money, make money faster. Use Data Science, ML and Agentic RAG.',
      ),
    ).toBe(true);
  });

  it('prioritizes local recent prompts over messages history', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [{ role: 'user', content: 'older prompt' }],
        localRecentPrompts: ['first local', 'second local'],
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions[0].prompt).toBe('first local');
    expect(actions[1].prompt).toBe('second local');
    expect(actions[2]).toBeUndefined();
  });

  it('filters out the Telegram inbox virtual session', () => {
    const sessions: HermesSession[] = [
      {
        id: '__telegram_inbox__',
        title: 'Active — all threads',
        preview: 'Merged Hermes threads from your Mac (includes Telegram-linked sessions)',
        last_active_at: '2026-06-24T12:00:00Z',
      },
      {
        id: 'session-normal',
        preview: 'This is a normal session preview',
        last_active_at: '2026-06-24T11:00:00Z',
      },
    ];

    const actions = buildRecentPromptActions(
      {
        messages: [],
        sessions,
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions.map((a) => a.prompt)).not.toContain(
      'Merged Hermes threads from your Mac (includes Telegram-linked sessions)',
    );
    expect(actions.map((a) => a.prompt)).toContain('This is a normal session preview');
  });

  it('skips recent prompts already visible in the transcript', () => {
    const prompt = 'print money, make money faster. Use Data Science, ML and Agentic RAG.';
    expect(
      isPromptVisibleInTranscript([{ role: 'user', content: prompt }], prompt),
    ).toBe(true);

    const actions = buildRecentPromptActions(
      {
        messages: [{ role: 'user', content: prompt }],
        localRecentPrompts: [prompt, 'other prompt'],
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions.map((action) => action.prompt)).toEqual(['other prompt']);
  });

  it('stores full prompt text on chips for reliable dismiss', () => {
    const longPrompt = `${'ship hermes '.repeat(80)}mobile`;
    const actions = buildRecentPromptActions(
      {
        messages: [],
        localRecentPrompts: [longPrompt],
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions[0].prompt).toBe(longPrompt);
    expect(actions[0].label.length).toBeLessThan(longPrompt.length);
  });

  it('filters out prompts matching dismissedPrompts list', () => {
    const actions = buildRecentPromptActions(
      {
        messages: [
          { role: 'user', content: 'hello hermes' },
          { role: 'user', content: 'run local test' },
        ],
        localRecentPrompts: ['keep this prompt', 'dismiss this prompt'],
        dismissedPrompts: ['dismiss this prompt', 'hello hermes'],
      },
      buildFallbackPromptActions({ approvalCount: 0, isRunActive: false }),
    );

    expect(actions.map((action) => action.prompt)).toEqual([
      'keep this prompt',
    ]);
  });
});
