import type { HermesSession } from '../types/chat';
import {
  formatCronSchedule,
  formatSessionDate,
  formatSessionLastActive,
  formatSessionTitle,
  filterDismissedThreadSessions,
  isRecentsRailSession,
  parseGatewayTimestamp,
  sessionDisplayTitle,
  sessionPickerLabel,
  sessionLastActiveValue,
  deriveThreadTitleFromMessage,
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

  it('sessionPickerLabel treats numbered mobile session titles as placeholders', () => {
    expect(
      sessionPickerLabel({
        id: 'sess_3',
        title: 'New mobile session #3',
        preview: 'Print money make money faster',
        started_at: '2026-07-02T18:24:00.000Z',
      }),
    ).toBe('Print money make money faster');
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

  it('formats cron session IDs with smarter titles', () => {
    const session = { id: 'cron_42446aa3dc68', last_active: Date.now() / 1000 - 90 };
    expect(sessionPickerLabel(session)).toBe('Scheduled job · 1m ago');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job · 1m ago');
  });

  it('humanizes gateway cron titles instead of raw hex ids', () => {
    const session: HermesSession = {
      id: 'cron_42446aa3dc68',
      title: 'Session cron 42446aa3dc68',
      last_active: Date.now() / 1000 - 120,
      preview: '[IMPORTANT: You are running as a scheduled cron job',
    };
    expect(sessionPickerLabel(session)).toBe('Scheduled job · 2m ago');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job · 2m ago');
  });
  it('humanizes IMPORTANT cron prompt used as session title', () => {
    const session: HermesSession = {
      id: '20260625_120000_abc',
      title: '[IMPORTANT: You are running as a scheduled cron job. Check revenue pipeline.',
      preview: '[IMPORTANT: You are running as a scheduled cron job. Check revenue pipeline.',
      last_active: Date.now() / 1000 - 60,
    };
    expect(sessionPickerLabel(session)).toBe('Scheduled job · 1m ago');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job · 1m ago');
  });

  it('humanizes IMPORTANT cron prompt with literal backslash-n in title', () => {
    const session: HermesSession = {
      id: '20260625_120000_abc',
      title: '[IMPORTANT:\\nYou are running as a scheduled cron job',
      preview: '[IMPORTANT:\\nYou are running as a scheduled cron job',
      last_active: Date.now() / 1000 - 60,
    };
    expect(sessionPickerLabel(session)).toBe('Scheduled job · 1m ago');
    expect(sessionDisplayTitle(session)).toBe('Scheduled job · 1m ago');
  });

  it('formatSessionTitle humanizes cron boilerplate for chat header', () => {
    const session: HermesSession = {
      id: '20260625_120000_abc',
      title: '[IMPORTANT: You are running as a scheduled cron job',
      preview: '[IMPORTANT: You are running as a scheduled cron job',
      last_active: Date.now() / 1000 - 90,
    };
    expect(formatSessionTitle(session)).toBe('Scheduled job · 1m ago');
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
});
