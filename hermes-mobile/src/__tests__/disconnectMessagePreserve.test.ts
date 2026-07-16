import {
  composerTextAfterRejectedSend,
  shouldClearMissingCurrentSession,
  shouldPreserveTranscriptOnSessionChange,
  shouldSuppressConnectionHelpForLocalOutbound,
} from '../utils/disconnectMessagePreserve';

describe('shouldClearMissingCurrentSession', () => {
  it('keeps sticky session when reconnect returns an empty list', () => {
    expect(
      shouldClearMissingCurrentSession({
        sessionsLength: 0,
        currentSessionId: 'sess_a',
      }),
    ).toBe(false);
  });

  it('clears when server returned other threads and current id is gone', () => {
    expect(
      shouldClearMissingCurrentSession({
        sessionsLength: 2,
        currentSessionId: 'sess_gone',
      }),
    ).toBe(true);
  });

  it('clears under skipAutoSelect even on empty list', () => {
    expect(
      shouldClearMissingCurrentSession({
        sessionsLength: 0,
        currentSessionId: 'sess_a',
        skipAutoSelect: true,
      }),
    ).toBe(true);
  });
});

describe('shouldPreserveTranscriptOnSessionChange', () => {
  it('keeps transcript while an optimistic send is in flight', () => {
    expect(
      shouldPreserveTranscriptOnSessionChange({
        messages: [{ id: 'user-1', role: 'user', content: 'make money today', outboundStatus: 'pending' }],
        pendingOutboundSends: 1,
        isSending: true,
        hasActiveRun: false,
      }),
    ).toBe(true);
  });

  it('keeps failed optimistic bubble across disconnect', () => {
    expect(
      shouldPreserveTranscriptOnSessionChange({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'make money today',
            outboundStatus: 'failed',
          },
        ],
        pendingOutboundSends: 0,
        isSending: false,
        hasActiveRun: false,
      }),
    ).toBe(true);
  });

  it('allows clear when transcript is empty and idle', () => {
    expect(
      shouldPreserveTranscriptOnSessionChange({
        messages: [],
        pendingOutboundSends: 0,
        isSending: false,
        hasActiveRun: false,
      }),
    ).toBe(false);
  });
});

describe('composerTextAfterRejectedSend', () => {
  it('marks restored typed text for draft persistence', () => {
    expect(
      composerTextAfterRejectedSend({ rejectedText: 'make money today' }),
    ).toEqual({ text: 'make money today', shouldPersistDraft: true });
  });

  it('does not persist blank restore', () => {
    expect(composerTextAfterRejectedSend({ rejectedText: '   ' })).toEqual({
      text: '   ',
      shouldPersistDraft: false,
    });
  });
});

describe('shouldSuppressConnectionHelpForLocalOutbound', () => {
  it('keeps chat surface when a failed outbound bubble is retryable', () => {
    expect(
      shouldSuppressConnectionHelpForLocalOutbound({
        hasRetryableFailedSend: true,
        pendingOutboundSends: 0,
        messages: [],
      }),
    ).toBe(true);
  });

  it('keeps chat surface for unsynced local messages', () => {
    expect(
      shouldSuppressConnectionHelpForLocalOutbound({
        hasRetryableFailedSend: false,
        pendingOutboundSends: 0,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'make money today',
            outboundStatus: 'failed',
          },
        ],
      }),
    ).toBe(true);
  });

  it('allows connection help when idle with synced transcript', () => {
    expect(
      shouldSuppressConnectionHelpForLocalOutbound({
        hasRetryableFailedSend: false,
        pendingOutboundSends: 0,
        messages: [{ id: '1', role: 'assistant', content: 'ok' }],
      }),
    ).toBe(false);
  });
});
