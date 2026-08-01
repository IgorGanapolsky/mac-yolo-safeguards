import {
  failedSendRetryTelemetryProperties,
  findLastFailedOutboundRetry,
  findLastFailedOutboundText,
  isEmptyReplyFailureMessage,
  resolveComposerErrorAction,
  resolveComposerSendAction,
  shouldHideMacTileForSilentHeal,
  shouldShowFailedSendRetry,
  shouldSurfaceEmptyReplyFailure,
} from '../utils/failedSendRetry';
import { EMPTY_REPLY_FAILURE_REASON } from '../utils/emptyStreamReplyRecovery';
import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';
import type { HermesMessage } from '../types/chat';

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

  it('retries an attachment-only failed payload even when its text is empty', () => {
    expect(
      resolveComposerSendAction({
        composerText: '',
        lastFailedText: '',
        hasFailedPayload: true,
        isDemo: false,
        macChatLive: true,
      }),
    ).toEqual({ kind: 'retry_resend', text: '' });
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

  it('returns a cloned retry envelope with every attachment intact', () => {
    const messages: HermesMessage[] = [
      {
        id: 'failed-image',
        role: 'user',
        content: 'inspect this\n\n📎 screenshot.png',
        outboundStatus: 'failed',
        outboundRetryEnvelope: {
          version: 1,
          text: 'inspect this',
          displayText: 'inspect this\n\n📎 screenshot.png',
          attachments: [
            {
              id: 'att-1',
              name: 'screenshot.png',
              mimeType: 'image/png',
              uri: 'file:///cache/screenshot.png',
              kind: 'image',
              sizeBytes: 1234,
            },
          ],
        },
      },
    ];
    const retry = findLastFailedOutboundRetry(messages);
    expect(retry).toEqual({
      messageId: 'failed-image',
      text: 'inspect this',
      displayText: 'inspect this\n\n📎 screenshot.png',
      attachments: [
        {
          id: 'att-1',
          name: 'screenshot.png',
          mimeType: 'image/png',
          uri: 'file:///cache/screenshot.png',
          kind: 'image',
          sizeBytes: 1234,
        },
      ],
      source: 'envelope',
      requiresReattach: false,
    });
    expect(retry?.attachments).not.toBe(messages[0]?.outboundRetryEnvelope?.attachments);
    expect(retry?.attachments[0]).not.toBe(
      messages[0]?.outboundRetryEnvelope?.attachments[0],
    );
  });

  it('fails closed for a legacy attachment bubble with no reconstructable payload', () => {
    expect(
      findLastFailedOutboundRetry([
        {
          id: 'legacy-image',
          role: 'user',
          content: 'inspect this\n\n📎 screenshot.png',
          outboundStatus: 'failed',
        },
      ]),
    ).toEqual({
      messageId: 'legacy-image',
      text: 'inspect this',
      displayText: 'inspect this\n\n📎 screenshot.png',
      attachments: [],
      source: 'legacy_attachment_missing',
      requiresReattach: true,
    });
  });

  it('emits retry telemetry without content, filename, MIME type, URI, or session id', () => {
    const properties = failedSendRetryTelemetryProperties(
      {
        messageId: 'local-only',
        text: 'private prompt',
        displayText: 'private prompt\n\n📎 secret.png',
        attachments: [
          {
            id: 'att-private',
            name: 'secret.png',
            mimeType: 'image/png',
            uri: 'file:///secret.png',
            kind: 'image',
            sizeBytes: 55,
          },
        ],
        source: 'envelope',
        requiresReattach: false,
      },
      'accepted',
    );
    expect(properties).toEqual({
      outcome: 'accepted',
      attachment_count: 1,
      payload_source: 'envelope',
      requires_reattach: false,
    });
    expect(JSON.stringify(properties)).not.toMatch(
      /private prompt|secret\.png|image\/png|file:|local-only/i,
    );
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

  it('classifies empty-reply failure messages for the Retry send action', () => {
    expect(isEmptyReplyFailureMessage(EMPTY_REPLY_FAILURE_REASON)).toBe(true);
    expect(
      isEmptyReplyFailureMessage(
        'Your computer finished but no reply text arrived — tap to retry.',
      ),
    ).toBe(true);
    expect(isEmptyReplyFailureMessage("Can't reach your computer")).toBe(false);
  });

  it('shows retry for wrong-key auth failures', () => {
    expect(
      shouldShowFailedSendRetry({
        runPhase: 'failed',
        runDetail: 'Wrong key for this computer',
        lastFailedText: null,
      }),
    ).toBe(true);
    expect(
      shouldShowFailedSendRetry({
        runPhase: 'failed',
        runDetail: GATEWAY_WRONG_KEY_MESSAGE,
        lastFailedText: 'hello',
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


describe('resolveComposerErrorAction / empty-reply offline', () => {
  it('never offers Retry send when Mac chat is offline', () => {
    expect(
      resolveComposerErrorAction({
        message: EMPTY_REPLY_FAILURE_REASON,
        macChatLive: false,
        hasFailedSend: true,
      }),
    ).toEqual({ label: 'Reconnect & retry', kind: 'reconnect' });
  });

  it('offers Retry send for empty-reply only when Mac is live', () => {
    expect(
      resolveComposerErrorAction({
        message: EMPTY_REPLY_FAILURE_REASON,
        macChatLive: true,
        hasFailedSend: true,
      }),
    ).toEqual({ label: 'Retry send', kind: 'retry_send' });
  });

  it('hides empty-reply failure surface when offline', () => {
    expect(
      shouldSurfaceEmptyReplyFailure({
        message: EMPTY_REPLY_FAILURE_REASON,
        macChatLive: false,
      }),
    ).toBe(false);
    expect(
      shouldSurfaceEmptyReplyFailure({
        message: EMPTY_REPLY_FAILURE_REASON,
        macChatLive: true,
      }),
    ).toBe(true);
  });
});
