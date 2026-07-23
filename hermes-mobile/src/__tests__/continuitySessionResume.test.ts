import {
  findSendableSessionById,
  resolveContinuityResumeDecision,
  shouldLeaveMegaSessionForContinuity,
} from '../utils/continuitySessionResume';
import type { SessionContinuityHandoff } from '../utils/sessionContinuityHandoff';
import type { HermesSession } from '../types/chat';

const handoff = (previousSessionId?: string): SessionContinuityHandoff => ({
  version: 1,
  writtenAt: '2026-07-23T15:00:00.000Z',
  lastGoal: 'make money today',
  openTodos: ['ship continuity resume'],
  lastAssistantSummary: 'Working on revenue.',
  previousSessionId,
  vaultRelativePath: 'Handoffs/hermes-mobile-last.md',
});

const healthy: HermesSession = {
  id: 'sess_ok',
  title: 'make money today',
  input_tokens: 12_000,
  last_active_at: '2026-07-23T14:00:00Z',
};

const mega: HermesSession = {
  id: 'sess_mega',
  title: '[IMPORTANT: The user has inv...',
  input_tokens: 521_000,
  last_active_at: '2026-07-23T14:40:00Z',
};

describe('resolveContinuityResumeDecision', () => {
  it('returns none without a handoff', () => {
    expect(resolveContinuityResumeDecision({ handoff: null, sessions: [healthy] })).toEqual({
      action: 'none',
    });
  });

  it('true-resumes previousSessionId when the thread is still sendable', () => {
    const decision = resolveContinuityResumeDecision({
      handoff: handoff('sess_ok'),
      sessions: [mega, healthy],
    });
    expect(decision).toEqual({ action: 'resume_session', session: healthy });
  });

  it('compose-fresh when previous is mega-blocked (never trap on too-large)', () => {
    const decision = resolveContinuityResumeDecision({
      handoff: handoff('sess_mega'),
      sessions: [mega, healthy],
    });
    expect(decision).toEqual({
      action: 'compose_fresh_with_inject',
      reason: 'mega_previous',
    });
  });

  it('compose-fresh when previous id is gone from the Mac', () => {
    expect(
      resolveContinuityResumeDecision({
        handoff: handoff('sess_gone'),
        sessions: [healthy],
      }),
    ).toEqual({ action: 'compose_fresh_with_inject', reason: 'missing_previous' });
  });

  it('compose-fresh when handoff has no previousSessionId', () => {
    expect(
      resolveContinuityResumeDecision({
        handoff: handoff(undefined),
        sessions: [healthy],
      }),
    ).toEqual({ action: 'compose_fresh_with_inject', reason: 'no_previous_id' });
  });
});

describe('findSendableSessionById / shouldLeaveMegaSessionForContinuity', () => {
  it('rejects mega and empty ids', () => {
    expect(findSendableSessionById([mega, healthy], 'sess_mega')).toBeNull();
    expect(findSendableSessionById([healthy], 'sess_ok')?.id).toBe('sess_ok');
    expect(findSendableSessionById([healthy], '')).toBeNull();
  });

  it('flags mega sessions for leave', () => {
    expect(shouldLeaveMegaSessionForContinuity(mega)).toBe(true);
    expect(shouldLeaveMegaSessionForContinuity(healthy)).toBe(false);
  });
});
