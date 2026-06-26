import {
  threadActivityForSession,
  threadActivityLabel,
  sortSessionsForAgentRail,
} from '../utils/threadActivity';
import type { HermesSession } from '../types/chat';

describe('threadActivity', () => {
  const baseSession: HermesSession = {
    id: 'sess-1',
    title: 'Fix login bug',
    preview: 'Running tests…',
  };

  it('marks current session as running when isSending', () => {
    const result = threadActivityForSession(baseSession, {
      currentSessionId: 'sess-1',
      isSending: true,
    });
    expect(result.state).toBe('running');
    expect(threadActivityLabel(result.state)).toBe('Running');
  });

  it('marks session as needs approval when id is in pending set', () => {
    const result = threadActivityForSession(baseSession, {
      pendingApprovalSessionIds: new Set(['sess-1']),
    });
    expect(result.state).toBe('needs_approval');
    expect(threadActivityLabel(result.state)).toBe('Approve');
  });

  it('marks session running from active run progress', () => {
    const result = threadActivityForSession(baseSession, {
      currentSessionId: 'sess-1',
      runProgress: {
        phase: 'streaming',
        startedAtMs: Date.now(),
        sessionId: 'sess-1',
        detail: 'Editing files',
      },
    });
    expect(result.state).toBe('running');
  });

  it('returns idle for unrelated sessions', () => {
    const result = threadActivityForSession({ id: 'other', title: 'Other' }, {
      currentSessionId: 'sess-1',
      isSending: true,
    });
    expect(result.state).toBe('idle');
  });

  it('sorts sessions by recency for agent rail', () => {
    const older: HermesSession = { id: 'a', last_active: 100 };
    const newer: HermesSession = { id: 'b', last_active: 200 };
    const sorted = sortSessionsForAgentRail([older, newer]);
    expect(sorted[0].id).toBe('b');
  });
});
