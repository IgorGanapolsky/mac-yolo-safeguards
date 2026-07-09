import {
  findLastFailedOutboundText,
  resolveComposerSendAction,
  shouldHideMacTileForSilentHeal,
  shouldShowFailedSendRetry,
} from '../utils/failedSendRetry';
import { EMPTY_REPLY_FAILURE_REASON } from '../utils/emptyStreamReplyRecovery';

describe('resolveComposerSendAction', () => {
  it('returns none when composer and last failed are empty', () => {
    expect(
      resolveComposerSendAction({
        composerText: '  ',
        lastFailedText: null,
        isDemo: false,
        macChatLive: false,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('sends new composer text when present', () => {
    expect(
      resolveComposerSendAction({
        composerText: 'hello',
        lastFailedText: 'old fail',
        isDemo: false,
        macChatLive: true,
      }),
    ).toEqual({ kind: 'send', text: 'hello' });
  });

  it('retries resend when connected and composer empty', () => {
    expect(
      resolveComposerSendAction({
        composerText: '',
        lastFailedText: 'print money',
        isDemo: false,
        macChatLive: true,
      }),
    ).toEqual({ kind: 'retry_resend', text: 'print money' });
  });

  it('retries reconnect when disconnected and composer empty', () => {
    expect(
      resolveComposerSendAction({
        composerText: '',
        lastFailedText: 'print money',
        isDemo: false,
        macChatLive: false,
      }),
    ).toEqual({ kind: 'retry_reconnect', text: 'print money' });
  });

  it('retries resend in demo even without mac link', () => {
    expect(
      resolveComposerSendAction({
        composerText: '',
        lastFailedText: 'demo prompt',
        isDemo: true,
        macChatLive: false,
      }),
    ).toEqual({ kind: 'retry_resend', text: 'demo prompt' });
  });
});

describe('findLastFailedOutboundText', () => {
  it('returns the most recent failed user bubble text', () => {
    expect(
      findLastFailedOutboundText([
        { id: '1', role: 'user', content: 'first', outboundStatus: 'failed' },
        { id: '2', role: 'assistant', content: 'hi' },
        { id: '3', role: 'user', content: ' second ', outboundStatus: 'failed' },
      ]),
    ).toBe('second');
  });
});

describe('shouldShowFailedSendRetry', () => {
  it('shows retry for connectivity failures', () => {
    expect(
      shouldShowFailedSendRetry({
        runPhase: 'failed',
        runDetail: "Can't reach your computer — check Wi‑Fi",
        lastFailedText: 'hi',
      }),
    ).toBe(true);
  });

  it('shows retry for empty-reply timeout', () => {
    expect(
      shouldShowFailedSendRetry({
        runPhase: 'failed',
        runDetail: EMPTY_REPLY_FAILURE_REASON,
        lastFailedText: null,
      }),
    ).toBe(true);
  });

  it('hides retry when run is not failed', () => {
    expect(
      shouldShowFailedSendRetry({
        runPhase: 'running',
        runDetail: 'Working…',
        lastFailedText: 'hi',
      }),
    ).toBe(false);
  });
});

describe('shouldHideMacTileForSilentHeal', () => {
  it('hides tile during silent heal when no failed send', () => {
    expect(
      shouldHideMacTileForSilentHeal({
        silentHealInFlight: true,
        macRetryBusy: false,
        userSendFailed: false,
        hasRetryableFailedSend: false,
      }),
    ).toBe(true);
  });

  it('keeps tile visible after user send failed during silent heal', () => {
    expect(
      shouldHideMacTileForSilentHeal({
        silentHealInFlight: true,
        macRetryBusy: false,
        userSendFailed: true,
        hasRetryableFailedSend: false,
      }),
    ).toBe(false);
  });
});
