import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import {
  isSendableChatSession,
  isUnsendableChatSession,
  pickResumeSessionAfterStaleTarget,
  planStaleSessionRecovery,
} from '../utils/sessionSendTarget';

function session(
  partial: Partial<HermesSession> & { id: string },
): HermesSession {
  return {
    title: partial.title ?? partial.id,
    last_active_at: partial.last_active_at ?? '2026-07-22T15:00:00.000Z',
    source: partial.source ?? 'api_server',
    ...partial,
  };
}

describe('sessionSendTarget', () => {
  const projectState: ChatProjectState = {
    projects: [],
    sessionProjectMap: {},
    sessionLabels: {},
    activeProjectId: null,
  };

  it('marks cron and automation probe sessions unsendable', () => {
    expect(
      isUnsendableChatSession(
        session({ id: 'cron_0eb498680d96_20260721_204200', source: 'cron' }),
      ),
    ).toBe(true);
    expect(
      isUnsendableChatSession(
        session({
          id: 'api_probe',
          source: 'api_server',
          title: 'Reply with exactly: GUARDRAILS OK',
          preview: 'Reply with exactly: GUARDRAILS OK',
        }),
      ),
    ).toBe(true);
    expect(
      isSendableChatSession(
        session({
          id: 'mobile_1784665204206_b230283b',
          title: 'Why we made zero dollars',
          source: 'api_server',
        }),
      ),
    ).toBe(true);
  });

  it('on dead cron sticky, resumes the real mobile thread instead of create_fresh', () => {
    const real = session({
      id: 'mobile_1784665204206_b230283b',
      title: 'Why we made zero dollars',
      last_active_at: '2026-07-22T12:00:00.000Z',
      input_tokens: 40_000,
      api_call_count: 36,
    });
    const staleCron = 'cron_0eb498680d96_20260721_204200';
    const plan = planStaleSessionRecovery({
      sessions: [
        session({ id: staleCron, source: 'cron', title: 'cron job' }),
        real,
        session({
          id: 'mobile_older',
          title: 'older',
          last_active_at: '2026-07-21T12:00:00.000Z',
        }),
      ],
      staleSessionId: staleCron,
      rememberedSessionId: staleCron,
      projectState,
    });
    expect(plan).toEqual({ action: 'resume', session: real });
  });

  it('prefers remembered sendable id when present', () => {
    const remembered = session({
      id: 'mobile_remembered',
      title: 'Remembered thread',
      last_active_at: '2026-07-20T12:00:00.000Z',
    });
    const newer = session({
      id: 'mobile_newer',
      title: 'Newer',
      last_active_at: '2026-07-22T12:00:00.000Z',
    });
    expect(
      pickResumeSessionAfterStaleTarget({
        sessions: [newer, remembered],
        staleSessionId: 'cron_dead',
        rememberedSessionId: remembered.id,
        projectState,
      }),
    ).toEqual(remembered);
  });

  it('falls back to create_fresh only when no sendable thread exists', () => {
    expect(
      planStaleSessionRecovery({
        sessions: [
          session({ id: 'cron_only', source: 'cron', title: 'cron' }),
        ],
        staleSessionId: 'cron_only',
        projectState,
      }),
    ).toEqual({ action: 'create_fresh' });
  });
});
