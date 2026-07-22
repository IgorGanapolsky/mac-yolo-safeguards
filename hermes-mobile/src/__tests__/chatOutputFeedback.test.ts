import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import type { HermesMessage } from '../types/chat';
import {
  resolveChatOutputFeedbackBusyKey,
  shouldShowChatOutputFeedback,
} from '../utils/chatOutputFeedback';
import {
  EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
  GENERIC_EMPTY_STREAM_PLACEHOLDER,
} from '../utils/streamAssistantText';

const assistantMessage: HermesMessage = {
  id: 'msg-1',
  role: 'assistant',
  content: 'Here is the analysis you asked for.',
  created_at: '2026-06-26T12:00:00.000Z',
};

describe('shouldShowChatOutputFeedback', () => {
  it('shows feedback for completed assistant output when Leash is unlocked', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        leashUnlocked: true,
        isStreamingAssistant: false,
      }),
    ).toBe(true);
  });

  it('hides feedback when Leash is locked', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        leashUnlocked: false,
        isStreamingAssistant: false,
      }),
    ).toBe(false);
  });

  it('hides feedback while the assistant message is still streaming', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        leashUnlocked: true,
        isStreamingAssistant: true,
      }),
    ).toBe(false);
  });

  it('hides feedback for empty assistant placeholders', () => {
    expect(
      shouldShowChatOutputFeedback(
        { role: 'assistant', content: '   ' },
        { leashUnlocked: true, isStreamingAssistant: false },
      ),
    ).toBe(false);
  });

  it('hides feedback for cron [SILENT] protocol acks', () => {
    expect(
      shouldShowChatOutputFeedback(
        { role: 'assistant', content: '[SILENT]' },
        { leashUnlocked: true, isStreamingAssistant: false },
      ),
    ).toBe(false);
  });

  it('hides feedback for deferred working/timeout status placeholders', () => {
    expect(
      shouldShowChatOutputFeedback(
        { role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
        { leashUnlocked: true, isStreamingAssistant: false },
      ),
    ).toBe(false);
    expect(
      shouldShowChatOutputFeedback(
        {
          role: 'assistant',
          content: `${GENERIC_EMPTY_STREAM_PLACEHOLDER}\n\nUsing on your computer: terminal`,
        },
        { leashUnlocked: true, isStreamingAssistant: false },
      ),
    ).toBe(false);
    expect(
      shouldShowChatOutputFeedback(
        { role: 'assistant', content: EMPTY_STREAM_TIMEOUT_PLACEHOLDER },
        { leashUnlocked: true, isStreamingAssistant: false },
      ),
    ).toBe(false);
  });

  it('hides feedback for user messages', () => {
    expect(
      shouldShowChatOutputFeedback(
        { role: 'user', content: 'Hello' },
        { leashUnlocked: true, isStreamingAssistant: false },
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
  it('requires Pro or developer unlock via settings helper', () => {
    expect(
      shouldShowChatOutputFeedback(assistantMessage, {
        leashUnlocked: DEFAULT_GATEWAY_SETTINGS.thumbgateProActive === true,
        isStreamingAssistant: false,
      }),
    ).toBe(false);
  });
});
