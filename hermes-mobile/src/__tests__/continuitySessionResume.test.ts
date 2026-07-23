import { resolveContinuitySessionResumeId } from '../utils/continuitySessionResume';
import type { SessionContinuityHandoff } from '../utils/sessionContinuityHandoff';

const handoff = (previousSessionId?: string): SessionContinuityHandoff => ({
  version: 1,
  writtenAt: '2026-07-23T00:00:00.000Z',
  lastGoal: 'make money today',
  openTodos: [],
  lastAssistantSummary: 'Working on it.',
  previousSessionId,
  vaultRelativePath: 'Handoffs/hermes-mobile-last.md',
});

describe('resolveContinuitySessionResumeId', () => {
  it('returns null after intentional Start fresh / New chat', () => {
    expect(
      resolveContinuitySessionResumeId({
        handoff: handoff('sess-prior'),
        skipAutoSelect: true,
        sessionIds: ['sess-prior', 'sess-other'],
      }),
    ).toBeNull();
  });

  it('resumes previousSessionId when it still exists on the Mac', () => {
    expect(
      resolveContinuitySessionResumeId({
        handoff: handoff('sess-prior'),
        skipAutoSelect: false,
        sessionIds: ['sess-other', 'sess-prior'],
      }),
    ).toBe('sess-prior');
  });

  it('returns null when previous session is gone (no empty-banner lie path)', () => {
    expect(
      resolveContinuitySessionResumeId({
        handoff: handoff('sess-missing'),
        skipAutoSelect: false,
        sessionIds: ['sess-other'],
      }),
    ).toBeNull();
  });

  it('returns null without handoff or previousSessionId', () => {
    expect(
      resolveContinuitySessionResumeId({
        handoff: null,
        skipAutoSelect: false,
        sessionIds: ['sess-prior'],
      }),
    ).toBeNull();
    expect(
      resolveContinuitySessionResumeId({
        handoff: handoff(undefined),
        skipAutoSelect: false,
        sessionIds: ['sess-prior'],
      }),
    ).toBeNull();
  });
});
