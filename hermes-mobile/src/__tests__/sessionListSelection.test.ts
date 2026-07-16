import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { resolveSessionAfterListLoad } from '../utils/sessionListSelection';

const sessions: HermesSession[] = [
  { id: 'sess_a', title: 'Print money', last_active_at: '2026-06-28T12:00:00Z' },
  { id: 'sess_b', title: 'Hermes Telegram', last_active_at: '2026-06-15T12:00:00Z' },
];

const projectState: ChatProjectState = {
  projects: [
    {
      id: 'proj',
      name: 'hermes-mobile',
      workspacePath: '~/workspace/git/igor/mac-yolo-safeguards/hermes-mobile',
      sessionIds: ['sess_a', 'sess_b'],
      activeSessionId: 'sess_a',
    },
  ],
  sessionProjectMap: { sess_a: 'proj', sess_b: 'proj' },
  sessionLabels: {},
  activeProjectId: 'proj',
};

describe('resolveSessionAfterListLoad', () => {
  it('prefers manual recent tap over stale project binding', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: 'sess_b',
        manualSelectSessionId: 'sess_b',
        selectLatest: true,
      }),
    ).toBeUndefined();

    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: 'sess_a',
        manualSelectSessionId: 'sess_b',
        selectLatest: true,
      })?.id,
    ).toBe('sess_b');
  });

  it('preserves in-flight user selection when project binding is stale', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: 'sess_b',
        selectLatest: true,
      }),
    ).toBeUndefined();
  });

  it('does not override manual pick when listSessions has not returned that thread yet', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions: [sessions[0]],
        projectState,
        currentSessionId: 'sess_b',
        manualSelectSessionId: 'sess_b',
        selectLatest: true,
      }),
    ).toBeUndefined();
  });

  it('uses project preferred session when nothing is selected yet', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: null,
        selectLatest: true,
      })?.id,
    ).toBe('sess_a');
  });

  it('restores the last selected session for the active computer before project fallback', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: null,
        rememberedSessionId: 'sess_b',
        selectLatest: true,
      })?.id,
    ).toBe('sess_b');
  });

  it('falls back when the remembered computer session is no longer on the server', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: null,
        rememberedSessionId: 'sess_gone',
        selectLatest: true,
      })?.id,
    ).toBe('sess_a');
  });

  it('returns undefined when already on resolved session', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: 'sess_a',
      }),
    ).toBeUndefined();
  });

  it('clears when current session vanished from a non-empty server list', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions: [sessions[1]],
        projectState,
        currentSessionId: 'sess_a',
      }),
    ).toBeNull();
  });

  it('keeps sticky session when reconnect returns an empty list', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions: [],
        projectState,
        currentSessionId: 'sess_a',
        selectLatest: true,
      }),
    ).toBeUndefined();
  });

  it('respects skipAutoSelect for new chat', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: null,
        skipAutoSelect: true,
        selectLatest: true,
      }),
    ).toBeUndefined();
  });

  it('skipAutoSelect clears stale current session when it vanished', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState,
        currentSessionId: 'sess_gone',
        skipAutoSelect: true,
        selectLatest: true,
      }),
    ).toBeNull();
  });
});
