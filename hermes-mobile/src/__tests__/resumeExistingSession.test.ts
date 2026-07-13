import { findResumableSessionByPromptTitle } from '../utils/resumeExistingSession';
import type { HermesSession } from '../types/chat';

describe('findResumableSessionByPromptTitle', () => {
  const older: HermesSession = {
    id: 'old',
    title: 'Print money make money faster',
    last_active_at: '2026-07-07T14:00:00.000Z',
  };
  const newer: HermesSession = {
    id: 'new',
    title: 'Print money make money faster',
    last_active_at: '2026-07-07T16:00:00.000Z',
  };

  it('returns the most recently active session with a matching title', () => {
    expect(
      findResumableSessionByPromptTitle([older, newer], 'Print money make money faster'),
    ).toEqual(newer);
  });

  it('matches case-insensitively and ignores extra whitespace', () => {
    const session: HermesSession = {
      id: 's1',
      title: '  PRINT money   make money faster  ',
      last_active_at: '2026-07-07T15:00:00.000Z',
    };
    expect(findResumableSessionByPromptTitle([session], 'print money make money faster')).toEqual(
      session,
    );
  });

  it('does not match numbered dedup titles (#2, #3)', () => {
    const numbered: HermesSession = {
      id: 's2',
      title: 'Print money make money faster #2',
      last_active_at: '2026-07-07T17:00:00.000Z',
    };
    expect(
      findResumableSessionByPromptTitle([numbered], 'Print money make money faster'),
    ).toBeNull();
  });

  it('returns null when no session matches', () => {
    expect(
      findResumableSessionByPromptTitle(
        [{ id: 'x', title: 'Different topic', last_active_at: '2026-07-07T15:00:00.000Z' }],
        'Print money make money faster',
      ),
    ).toBeNull();
  });

  it('returns null for empty prompt', () => {
    expect(findResumableSessionByPromptTitle([newer], '   ')).toBeNull();
  });

  it('prefers last_active unix seconds when last_active_at is missing', () => {
    const unixSession: HermesSession = {
      id: 'unix',
      title: 'Ship the fix today',
      last_active: 1783450000,
    };
    const isoSession: HermesSession = {
      id: 'iso',
      title: 'Ship the fix today',
      last_active_at: '2026-07-07T10:00:00.000Z',
    };
    expect(findResumableSessionByPromptTitle([isoSession, unixSession], 'Ship the fix today.')).toEqual(
      unixSession,
    );
  });

  it('never resumes a hard-blocked mega session even when the title matches', () => {
    const mega: HermesSession = {
      id: 'mega',
      title: 'make money today',
      last_active_at: '2026-07-13T20:00:00.000Z',
      input_tokens: 1_500_000,
      output_tokens: 50_000,
      cache_read_tokens: 10_000,
    };
    expect(findResumableSessionByPromptTitle([mega], 'make money today')).toBeNull();
  });
});
