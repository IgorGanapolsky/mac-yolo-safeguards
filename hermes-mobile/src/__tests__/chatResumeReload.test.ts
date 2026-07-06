import {
  resolveTranscriptReloadOnResume,
  shouldReloadTranscriptOnAppResume,
} from '../utils/chatResumeReload';

describe('chatResumeReload', () => {
  it('requires active app state and a bound session', () => {
    expect(
      shouldReloadTranscriptOnAppResume({ appState: 'active', hasActiveSession: true }),
    ).toBe(true);
    expect(
      shouldReloadTranscriptOnAppResume({ appState: 'background', hasActiveSession: true }),
    ).toBe(false);
    expect(
      shouldReloadTranscriptOnAppResume({ appState: 'active', hasActiveSession: false }),
    ).toBe(false);
  });

  it('force-reloads when transcript is empty on resume', () => {
    expect(
      resolveTranscriptReloadOnResume({
        appState: 'active',
        macChatLive: true,
        messageCount: 0,
        hasActiveSession: true,
      }),
    ).toEqual({ background: false, force: true });
  });

  it('force-reloads when mac HTTP is not live yet on resume', () => {
    expect(
      resolveTranscriptReloadOnResume({
        appState: 'active',
        macChatLive: false,
        messageCount: 4,
        hasActiveSession: true,
      }),
    ).toEqual({ background: false, force: true });
  });

  it('background-refreshes a warm transcript on quick resume', () => {
    expect(
      resolveTranscriptReloadOnResume({
        appState: 'active',
        macChatLive: true,
        messageCount: 3,
        hasActiveSession: true,
        backgroundDurationMs: 5_000,
      }),
    ).toEqual({ background: true, force: false });
  });

  it('force-refreshes stale transcripts after long background', () => {
    expect(
      resolveTranscriptReloadOnResume({
        appState: 'active',
        macChatLive: true,
        messageCount: 8,
        hasActiveSession: true,
        backgroundDurationMs: 60_000,
      }),
    ).toEqual({ background: true, force: true });
  });

  it('returns null when resume preconditions are not met', () => {
    expect(
      resolveTranscriptReloadOnResume({
        appState: 'inactive',
        macChatLive: true,
        messageCount: 0,
        hasActiveSession: true,
      }),
    ).toBeNull();
  });
});
