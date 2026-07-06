import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import type { HermesMessage } from '../types/chat';
import {
  resolveChatOutputFeedbackBusyKey,
  shouldShowChatOutputFeedback,
} from '../utils/chatOutputFeedback';

const assistantMessage: HermesMessage = {
  id: 'msg-1',
  role: 'assistant',
  content: 'Here is the analysis you asked for.',
  created_at: '2026-06-26T12:00:00.000Z',
};

const freeSettings = { ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: false };
const proSettings = { ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true };

describe('shouldShowChatOutputFeedback', () => {
  it('shows feedback for completed assistant output when Leash Pro is enabled', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        isStreamingAssistant: false,
        settings: proSettings,
      }),
    ).toBe(true);
  });

  it('hides feedback for free tier without Leash Pro', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        isStreamingAssistant: false,
        settings: freeSettings,
      }),
    ).toBe(false);
  });

  it('shows feedback when developer Leash unlock is active', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        isStreamingAssistant: false,
        settings: { ...freeSettings, developerLeashUnlock: true },
      }),
    ).toBe(true);
  });

  it('hides feedback while the assistant message is still streaming', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        isStreamingAssistant: true,
        settings: proSettings,
      }),
    ).toBe(false);
  });

  it('hides feedback for empty assistant placeholders', () => {
    expect(
      shouldShowChatOutputFeedback(
        { role: 'assistant', content: '   ' },
        { isStreamingAssistant: false, settings: proSettings },
      ),
    ).toBe(false);
  });

  it('hides feedback for user messages', () => {
    expect(
      shouldShowChatOutputFeedback(
        { role: 'user', content: 'Hello' },
        { isStreamingAssistant: false, settings: proSettings },
      ),
    ).toBe(false);
  });
});

describe('resolveChatOutputFeedbackBusyKey', () => {
  it('prefers message id for busy tracking', () => {
    expect(resolveChatOutputFeedbackBusyKey(assistantMessage)).toBe('msg-1');
  });

  it('falls back to created_at then content fingerprint', () => {
    expect(
      resolveChatOutputFeedbackBusyKey({
        role: 'assistant',
        content: 'Short reply',
        created_at: '2026-06-26T12:00:00.000Z',
      }),
    ).toBe('2026-06-26T12:00:00.000Z');
  });
});

describe('chat output feedback gating', () => {
  it('defaults fresh installs to Pro-off for assistant thumbs', () => {
    expect(DEFAULT_GATEWAY_SETTINGS.thumbgateProActive).toBe(false);
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        isStreamingAssistant: false,
        settings: DEFAULT_GATEWAY_SETTINGS,
      }),
    ).toBe(false);
  });
});
