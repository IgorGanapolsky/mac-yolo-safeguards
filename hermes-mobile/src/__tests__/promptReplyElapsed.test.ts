import type { HermesMessage } from '../types/chat';
import { EMPTY_STREAM_TIMEOUT_PLACEHOLDER } from '../utils/streamAssistantText';
import {
  messageSentAtMs,
  resolveLastUserPromptSentAtMs,
  resolvePromptReplyElapsedState,
} from '../utils/promptReplyElapsed';

describe('promptReplyElapsed', () => {
  it('parses mobile created_at timestamps', () => {
    const sentAt = '2026-07-14T22:00:00.000Z';
    expect(messageSentAtMs({ created_at: sentAt })).toBe(Date.parse(sentAt));
  });

  it('shows live elapsed on the last user turn without a substantive reply', () => {
    const sentAt = '2026-07-14T22:00:00.000Z';
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'make money today', created_at: sentAt },
    ];
    expect(resolvePromptReplyElapsedState({ messages, userIndex: 0 })).toEqual({
      mode: 'live',
      sinceMs: Date.parse(sentAt),
    });
  });

  it('freezes elapsed when a substantive assistant reply lands', () => {
    const sentAt = '2026-07-14T22:00:00.000Z';
    const replyAt = '2026-07-14T22:01:04.000Z';
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'make money today', created_at: sentAt },
      { id: 'asst-1', role: 'assistant', content: 'Here is the plan.', created_at: replyAt },
    ];
    expect(resolvePromptReplyElapsedState({ messages, userIndex: 0 })).toEqual({
      mode: 'frozen',
      durationSec: 64,
    });
  });

  it('keeps waiting live through empty-stream timeout placeholders', () => {
    const sentAt = '2026-07-14T22:00:00.000Z';
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'make money today', created_at: sentAt },
      {
        id: 'asst-timeout',
        role: 'assistant',
        content: EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
        created_at: '2026-07-14T22:02:00.000Z',
      },
    ];
    expect(resolvePromptReplyElapsedState({ messages, userIndex: 0 })).toEqual({
      mode: 'live',
      sinceMs: Date.parse(sentAt),
    });
  });

  it('resolves the last user prompt timestamp for banners', () => {
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'older', created_at: '2026-07-14T21:00:00.000Z' },
      { id: 'user-2', role: 'user', content: 'make money today', created_at: '2026-07-14T22:00:00.000Z' },
    ];
    expect(resolveLastUserPromptSentAtMs(messages)).toBe(Date.parse('2026-07-14T22:00:00.000Z'));
  });
});
