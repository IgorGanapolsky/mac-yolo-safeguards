import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import {
  ensureCurrentSessionSelectable,
  resolveSessionAfterListLoad,
} from '../utils/sessionListSelection';

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

  it('ignores remembered automated cron stickies and picks a sendable thread', () => {
    const withCron: HermesSession[] = [
      {
        id: 'cron_0eb498680d96_20260721_204200',
        source: 'cron',
        title: 'Scheduled',
        last_active_at: '2026-07-22T15:28:00Z',
      },
      {
        id: 'mobile_1784665204206_b230283b',
        source: 'api_server',
        title: 'Why we made zero dollars',
        last_active_at: '2026-07-22T12:00:00Z',
      },
    ];
    expect(
      resolveSessionAfterListLoad({
        sessions: withCron,
        projectState: {
          projects: [],
          sessionProjectMap: {},
          sessionLabels: {},
          activeProjectId: null,
        },
        currentSessionId: null,
        rememberedSessionId: 'cron_0eb498680d96_20260721_204200',
        selectLatest: true,
      })?.id,
    ).toBe('mobile_1784665204206_b230283b');
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

  it('machine switch resumes this Mac remembered session and ignores continuity foreign id', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState: { ...projectState, activeProjectId: null, projects: [] },
        currentSessionId: null,
        rememberedSessionId: 'sess_b',
        continuityPreviousSessionId: 'sess_a',
        machineSwitch: true,
        selectLatest: true,
      })?.id,
    ).toBe('sess_b');
  });

  it('machine switch opens newest sendable when memory missing', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState: { ...projectState, activeProjectId: null, projects: [] },
        currentSessionId: null,
        rememberedSessionId: null,
        machineSwitch: true,
        selectLatest: true,
      })?.id,
    ).toBe('sess_a');
  });

  it('never restores a remembered mega-blocked session after relaunch', () => {
    const mega: HermesSession = {
      id: 'sess_mega',
      title: 'I believe we should separate th...',
      input_tokens: 1_632_047,
      last_active_at: '2026-07-14T21:38:00Z',
    };
    expect(
      resolveSessionAfterListLoad({
        sessions: [mega, ...sessions],
        projectState,
        currentSessionId: null,
        rememberedSessionId: 'sess_mega',
        selectLatest: true,
      })?.id,
    ).toBe('sess_a');
  });

  it('leaves an already-open mega thread so continue is not a Send-disabled trap', () => {
    const mega: HermesSession = {
      id: 'sess_mega',
      title: 'I believe we should separate th...',
      input_tokens: 1_632_047,
      last_active_at: '2026-07-14T21:38:00Z',
    };
    // Only mega exists → compose-first (null). Continuity injects on next send.
    expect(
      resolveSessionAfterListLoad({
        sessions: [mega],
        projectState: { ...projectState, activeProjectId: null, projects: [] },
        currentSessionId: 'sess_mega',
        rememberedSessionId: 'sess_mega',
        selectLatest: true,
      }),
    ).toBeNull();
  });

  it('leaves open mega and picks a healthy thread when one exists', () => {
    const mega: HermesSession = {
      id: 'sess_mega',
      title: '[IMPORTANT: The user has inv...',
      input_tokens: 521_000,
      last_active_at: '2026-07-23T14:40:00Z',
    };
    expect(
      resolveSessionAfterListLoad({
        sessions: [mega, ...sessions],
        projectState,
        currentSessionId: 'sess_mega',
        rememberedSessionId: 'sess_mega',
        selectLatest: true,
      })?.id,
    ).toBe('sess_a');
  });

  it('true-resumes continuity previousSessionId when that thread is still sendable', () => {
    expect(
      resolveSessionAfterListLoad({
        sessions,
        projectState: { ...projectState, activeProjectId: null, projects: [] },
        currentSessionId: null,
        rememberedSessionId: 'sess_a',
        continuityPreviousSessionId: 'sess_b',
        selectLatest: true,
      })?.id,
    ).toBe('sess_b');
  });

  it('never true-resumes continuity previousSessionId when it is mega-blocked', () => {
    const mega: HermesSession = {
      id: 'sess_mega',
      title: 'poison',
      input_tokens: 521_000,
      last_active_at: '2026-07-23T14:40:00Z',
    };
    expect(
      resolveSessionAfterListLoad({
        sessions: [mega, ...sessions],
        projectState: { ...projectState, activeProjectId: null, projects: [] },
        currentSessionId: null,
        continuityPreviousSessionId: 'sess_mega',
        rememberedSessionId: 'sess_a',
        selectLatest: true,
      })?.id,
    ).toBe('sess_a');
  });

  it('opens empty chat when every candidate is mega-blocked', () => {
    const mega: HermesSession = {
      id: 'sess_mega',
      title: 'too large',
      input_tokens: 900_000,
      last_active_at: '2026-07-14T21:38:00Z',
    };
    expect(
      resolveSessionAfterListLoad({
        sessions: [mega],
        projectState: { ...projectState, activeProjectId: null, projects: [] },
        currentSessionId: null,
        rememberedSessionId: 'sess_mega',
        selectLatest: true,
      }),
    ).toBeNull();
  });
});

describe('ensureCurrentSessionSelectable', () => {
  const cronSession: HermesSession = {
    id: 'cron_abc123',
    source: 'cron',
    title: 'Scheduled job',
    last_active_at: '2026-07-21T20:42:00Z',
  };
  const allSessions: HermesSession[] = [
    cronSession,
    { id: 'sess_other', title: 'Other thread', last_active_at: '2026-07-22T06:31:00Z' },
  ];

  it('leaves the filtered list untouched when the current session already survived filtering', () => {
    expect(ensureCurrentSessionSelectable(allSessions, allSessions, 'cron_abc123')).toBe(
      allSessions,
    );
  });

  it('leaves the filtered list untouched when there is no current session', () => {
    const filtered = [allSessions[1]];
    expect(ensureCurrentSessionSelectable(filtered, allSessions, null)).toBe(filtered);
  });

  it('re-adds the open session when a display filter (hide cron) dropped it', () => {
    // Simulates: user has "hide cron" on (e.g. from a prior Clear all) and is
    // actively viewing a cron/scheduled-job thread when the list refreshes.
    const filtered = allSessions.filter((session) => session.source !== 'cron');
    const result = ensureCurrentSessionSelectable(filtered, allSessions, 'cron_abc123');
    expect(result.map((s) => s.id)).toEqual(['cron_abc123', 'sess_other']);
  });

  it('does not resurrect a session that was actually deleted, not just filtered', () => {
    const filtered = [allSessions[1]];
    const result = ensureCurrentSessionSelectable(filtered, [allSessions[1]], 'cron_abc123');
    expect(result).toBe(filtered);
  });

  it('feeds resolveSessionAfterListLoad a list that keeps the open cron session selected', () => {
    const filtered = allSessions.filter((session) => session.source !== 'cron');
    const selectable = ensureCurrentSessionSelectable(filtered, allSessions, 'cron_abc123');
    expect(
      resolveSessionAfterListLoad({
        sessions: selectable,
        projectState,
        currentSessionId: 'cron_abc123',
        selectLatest: false,
      }),
    ).toBeUndefined(); // undefined = "keep the open thread", not a jump to sess_other
  });
});
