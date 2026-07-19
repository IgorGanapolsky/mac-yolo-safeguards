import type { HermesSession } from '../types/chat';
import {
  formatCronSchedule,
  formatSessionCreated,
  formatSessionDate,
  formatSessionLastActive,
  formatSessionTitle,
  filterDismissedThreadSessions,
  isRecentsRailSession,
  parseGatewayTimestamp,
  sessionCreatedValue,
  sessionDisplayTitle,
  sessionPickerLabel,
  sessionLastActiveValue,
  deriveThreadTitleFromMessage,
  titleFromFirstPrompt,
  shouldAutoTitleSession,
  isBackfillPreservedSessionTitle,
  ensureSessionCreatedAt,
} from '../utils/sessionDisplay';

describe('sessionDisplay', () => {
  const gatewaySession: HermesSession = {
    id: '20260617_133715_583ecd',
    source: 'cli',
    title: null,
    last_active: 1781717841.604179,
    preview: 'Run pwd and reply with exactly the working directory output,...',
  };

  it('formats relative last-active labels', () => {
    const recent = Date.now() - 120_000;
    expect(formatSessionLastActive(recent)).toBe('2m ago');
  });

  it('formats gateway Unix seconds without epoch date bug', () => {
    const date = parseGatewayTimestamp(gatewaySession.last_active);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(formatSessionDate(gatewaySession.last_active)).not.toBe('1/21/1970');
  });

  it('uses preview when title is null', () => {
    expect(sessionDisplayTitle(gatewaySession)).toBe(
      'Run pwd and reply with exactly the working directory…',
    );
  });

  it('prefers explicit title', () => {
    expect(
      sessionDisplayTitle({
        ...gatewaySession,
        title: 'Fixing Conversion Leak via Telegram Stripe Outreach',
      }),
    ).toBe('Fixing Conversion Leak via Telegram Stripe Outreach');
  });

  it('sessionPickerLabel prefers preview over project lane when title drifts', () => {
    expect(
      sessionPickerLabel(
        {
          id: 'sess_1',
          title: 'Are you sure?',
          preview: 'Are you sure?',
        },
        {
          sessionLabels: {},
          projectName: 'Resolving CUA Driver Installation',
        },
      ),
    ).toBe('Are you sure?');
  });

  it('sessionPickerLabel uses preview when title mirrors preview', () => {
    expect(
      sessionPickerLabel({
        id: '20260623_004900_abc',
        title: 'Are you sure?',
        preview: 'Are you sure?',
      }),
    ).toBe('Are you sure?');
  });

  it('sessionPickerLabel keeps topic title when preview moved on', () => {
    expect(
      sessionPickerLabel({
        id: 'sess_1',
        title: 'Resolving CUA Driver Installation',
        preview: 'Are you sure?',
      }),
    ).toBe('Resolving CUA Driver Installation');
  });

  it('sessionPickerLabel ignores pinned generic placeholder labels', () => {
    expect(
      sessionPickerLabel(
        {
          id: 'sess_1',
          title: 'New mobile session',
          preview: 'print money, make money faster. Use Data Science, ML and Agentic RAG.',
        },
        {
          sessionLabels: { sess_1: 'New mobile session' },
        },
      ),
    ).toBe('print money, make money faster. Use Data Science, ML and Agentic RAG.');

    const longPreview = 'a'.repeat(130);
    expect(
      sessionPickerLabel(
        {
          id: 'sess_2',
          title: 'New mobile session',
          preview: longPreview,
        },
        {
          sessionLabels: { sess_2: 'New mobile session' },
        },
      ),
    ).toBe('a'.repeat(119) + '…');
  });

  it('deriveThreadTitleFromMessage truncates long prompts', () => {
    const long = 'a'.repeat(70);
    expect(deriveThreadTitleFromMessage(long)?.endsWith('…')).toBe(true);
  });

  it('titleFromFirstPrompt uses the opening question as title', () => {
    expect(titleFromFirstPrompt('Print money make money faster')).toBe(
      'Print money make money faster',
    );
  });

  it('titleFromFirstPrompt strips newlines and uses first sentence', () => {
    expect(titleFromFirstPrompt('Ship the fix today.\nAlso check CI.')).toBe('Ship the fix today.');
  });

  it('titleFromFirstPrompt truncates long single-line prompts', () => {
    const long = 'Optimize '.repeat(20).trim();
    const title = titleFromFirstPrompt(long);
    expect(title?.endsWith('…')).toBe(true);
    expect(title!.length).toBeLessThanOrEqual(56);
  });

  it('shouldAutoTitleSession skips pinned and backfill titles', () => {
    expect(
      shouldAutoTitleSession({ id: 's1', title: 'New mobile session' }, {}),
    ).toBe(true);
    expect(
      shouldAutoTitleSession(
        { id: 's1', title: 'New mobile session' },
        { s1: 'Pinned name' },
      ),
    ).toBe(false);
    expect(
      shouldAutoTitleSession({ id: 's1', title: 'Hermes Mobile — Jun 18, 3:00 PM' }, {}),
    ).toBe(false);
    expect(isBackfillPreservedSessionTitle('Session #3')).toBe(true);
  });

  it('formatSessionCreated renders absolute created timestamp', () => {
    const label = formatSessionCreated('2026-07-02T22:53:00.000Z');
    expect(label).toMatch(/Jul/);
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/53/);
  });

  it('ensureSessionCreatedAt copies gateway started_at to created_at', () => {
    const stamped = ensureSessionCreatedAt({ id: 's1', started_at: 1781717688.445973 });
    expect(stamped.created_at).toBeTruthy();
    expect(sessionCreatedValue(stamped)).toBe(stamped.created_at);
  });

  it('sessionPickerLabel prefers pinned mobile label', () => {
    expect(
      sessionPickerLabel(
        { id: 'sess_1', title: 'Are you sure?' },
        {
          sessionLabels: { sess_1: 'Pinned lane name' },
          projectName: 'Project name',
        },
      ),
    ).toBe('Pinned lane name');
  });

  it('sessionPickerLabel ignores pinned cron boilerplate labels', () => {
    const session = { id: 'cron_123', title: 'Session cron 123', last_active: undefined };
    expect(
      sessionPickerLabel(
        session,
        {
          sessionLabels: { cron_123: '[IMPORTANT: You are running as a scheduled cron job' },
        },
      ),
    ).toBe('Scheduled job');
  });

  it('falls back to started_at for last active', () => {
    expect(sessionLastActiveValue({ id: 'x', started_at: 1781717688.445973 })).toBe(1781717688.445973);
  });

  it('formats gateway cron schedule objects', () => {
    expect(formatCronSchedule('0 */6 * * *')).toBe('0 */6 * * *');
    expect(formatCronSchedule({ kind: 'cron', expr: '0 9 * * 1', display: 'Mon 9am' })).toBe('Mon 9am');
    expect(formatCronSchedule(null)).toBe('no schedule');
  });

  it('formats cron session IDs with stable titles (no embedded last_active time)', () => {
    const session = { id: 'cron_42446aa3dc68', last_active: Date.now() / 1000 - 90 };
    expect(sessionPickerLabel(session)).toBe('Scheduled job');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job');
  });

  it('humanizes gateway cron titles instead of raw hex ids', () => {
    const session: HermesSession = {
      id: 'cron_42446aa3dc68',
      title: 'Session cron 42446aa3dc68',
      last_active: Date.now() / 1000 - 120,
      preview: '[IMPORTANT: You are running as a scheduled cron job',
    };
    expect(sessionPickerLabel(session)).toBe('Scheduled job');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job');
  });
  it('humanizes IMPORTANT cron prompt used as session title', () => {
    const session: HermesSession = {
      id: '20260625_120000_abc',
      title: '[IMPORTANT: You are running as a scheduled cron job. Check revenue pipeline.',
      preview: '[IMPORTANT: You are running as a scheduled cron job. Check revenue pipeline.',
      last_active: Date.now() / 1000 - 60,
    };
    expect(sessionPickerLabel(session)).toBe('Scheduled job');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job');
  });

  it('humanizes IMPORTANT cron prompt with literal backslash-n in title', () => {
    const session: HermesSession = {
      id: '20260625_120000_abc',
      title: '[IMPORTANT:\\nYou are running as a scheduled cron job',
      preview: '[IMPORTANT:\\nYou are running as a scheduled cron job',
      last_active: Date.now() / 1000 - 60,
    };
    expect(sessionPickerLabel(session)).toBe('Scheduled job');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job');
  });

  it('formatSessionTitle humanizes cron boilerplate for chat header', () => {
    const session: HermesSession = {
      id: '20260625_120000_abc',
      title: '[IMPORTANT: You are running as a scheduled cron job',
      preview: '[IMPORTANT: You are running as a scheduled cron job',
      last_active: Date.now() / 1000 - 90,
    };
    expect(formatSessionTitle(session)).toBe('Scheduled job');
  });

  it('cron title does not embed last_active when created_at differs (Jul 8 screenshot regression)', () => {
    const createdAt = '2026-07-08T21:23:00.000Z';
    const lastActiveAt = '2026-07-08T21:25:00.000Z';
    const session: HermesSession = {
      id: 'cron_42446aa3dc68',
      title: 'Session cron 42446aa3dc68',
      source: 'cron',
      created_at: createdAt,
      last_active_at: lastActiveAt,
    };
    const title = formatSessionTitle(session);
    const subtitle = formatSessionCreated(sessionCreatedValue(session));

    expect(title).toBe('Scheduled job');
    expect(subtitle).toBe(formatSessionCreated(createdAt));
    expect(title).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('formatSessionTitle end-truncates long user titles for header', () => {
    const session: HermesSession = {
      id: 'sess_long',
      title:
        'we are working on skool_top_level_integration_branch today and still need several more words to exceed the header cap',
    };
    const title = formatSessionTitle(session);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(72);
    expect(title.startsWith('we are working on skool_top_level_integration_branch')).toBe(true);
  });

  it('formatSessionTitle strips IMPORTANT prefix from non-cron titles', () => {
    const session: HermesSession = {
      id: 'sess_1',
      title: '[IMPORTANT: Ship the Hermes mobile header fix today',
    };
    expect(formatSessionTitle(session)).toBe('Ship the Hermes mobile header fix today');
  });

  it('isRecentsRailSession hides cron and telegram inbox', () => {
    expect(
      isRecentsRailSession({
        id: 'cron_abc',
        source: 'cron',
        title: '[IMPORTANT: You are running as a scheduled cron job',
      }),
    ).toBe(false);
    expect(
      isRecentsRailSession({
        id: '__telegram_inbox__',
        title: 'Active — all threads',
      }),
    ).toBe(false);
    expect(isRecentsRailSession({ id: 'sess_user', title: 'Print money' })).toBe(true);
  });

  it('filterDismissedThreadSessions hides dismissed ids and optional cron jobs', () => {
    const sessions: HermesSession[] = [
      { id: 'sess_a', title: 'Print money', last_active_at: '2026-06-27T12:00:00Z' },
      { id: 'sess_b', title: 'Hermes Telegram', last_active_at: '2026-06-15T12:00:00Z' },
      {
        id: 'cron_x',
        source: 'cron',
        title: '[IMPORTANT: You are running as a scheduled cron job',
        last_active_at: '2026-06-28T12:00:00Z',
      },
    ];

    expect(
      filterDismissedThreadSessions(sessions, {
        dismissedSessionIds: ['sess_a', 'sess_b'],
        hideCronSessions: false,
      }).map((session) => session.id),
    ).toEqual(['cron_x']);

    expect(
      filterDismissedThreadSessions(sessions, {
        dismissedSessionIds: [],
        hideCronSessions: true,
      }).map((session) => session.id),
    ).toEqual(['sess_a', 'sess_b']);
  });

  it('post-clear suppression hides harness probes recreated with fresh ids', () => {
    // Clear all dismissed the old probe ids; the harness then recreated the same
    // probes under brand-new ids. Only the persisted class suppression can catch them.
    const recreated: HermesSession[] = [
      {
        id: 'api-brand-new-run-1',
        source: 'api_server',
        preview: 'Reply with exactly: GUARDRAILS OK',
        last_active_at: '2026-07-13T18:00:00Z',
      },
      {
        id: '20260713_190000_fresh1',
        source: 'cli',
        preview: "Run the shell command 'hostname' and report its exact output...",
        last_active_at: '2026-07-13T19:00:00Z',
      },
      {
        id: 'sess_user_new',
        source: 'api_server',
        title: 'Plan tomorrow standup notes',
        preview: 'Draft the standup notes for tomorrow',
        last_active_at: '2026-07-13T19:30:00Z',
      },
      {
        id: 'sess_mobile_new',
        source: 'hermes mobile',
        title: 'make money today',
        last_active_at: '2026-07-13T19:45:00Z',
      },
    ];

    // Post-clear: hide the whole API_SERVER/CLI class (including real titles).
    // Only mobile-created threads remain visible.
    expect(
      filterDismissedThreadSessions(recreated, {
        dismissedSessionIds: ['api-old-run-id', '20260713_120000_old'],
        hideCronSessions: true,
        hideAutomationSessions: true,
      }).map((session) => session.id),
    ).toEqual(['sess_mobile_new']);

    // Without the pref (never cleared), automation rows still list (Debug / Threads).
    expect(
      filterDismissedThreadSessions(recreated, {
        dismissedSessionIds: [],
        hideCronSessions: false,
      }).map((session) => session.id),
    ).toEqual([
      'api-brand-new-run-1',
      '20260713_190000_fresh1',
      'sess_user_new',
      'sess_mobile_new',
    ]);
  });

  it('keeps automation probes off the recents rail', () => {
    expect(
      isRecentsRailSession({
        id: 'api-1f52b9d7dfb32d11',
        source: 'api_server',
        preview: 'Reply with exactly: GUARDRAILS OK',
      }),
    ).toBe(false);
  });
});
