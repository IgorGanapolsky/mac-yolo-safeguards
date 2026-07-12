import {
  TOOL_RESULT_TERMINAL_FAILURE_REASON,
  TOOL_RESULT_TERMINAL_GRACE_MS,
  lastToolResultTimestampMs,
  resolveDeferredReplyFailureReason,
  shouldFailAwaitingToolResultReply,
  shouldTreatCompletedRunAsToolResultTerminal,
  transcriptEndsOnToolResultAfterLastUser,
} from '../utils/toolResultTerminalRecovery';
import type { HermesMessage } from '../types/chat';
import { EMPTY_REPLY_FAILURE_REASON } from '../utils/emptyStreamReplyRecovery';
import { GENERIC_EMPTY_STREAM_PLACEHOLDER } from '../utils/streamAssistantText';

describe('toolResultTerminalRecovery', () => {
  const now = Date.parse('2026-07-12T14:00:00.000Z');

  it('detects transcript ending on tool result after the latest user turn', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'run npm test' },
      { role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
      { role: 'tool', content: '{"output":"ok"}', created_at: '2026-07-12T13:58:30.000Z' },
    ];
    expect(transcriptEndsOnToolResultAfterLastUser(messages)).toBe(true);
    expect(shouldTreatCompletedRunAsToolResultTerminal(messages)).toBe(true);
  });

  it('does not flag turns that ended with a real assistant reply', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool', content: '{"output":"ok"}' },
      { role: 'assistant', content: 'Tests passed.' },
    ];
    expect(transcriptEndsOnToolResultAfterLastUser(messages)).toBe(false);
  });

  it('picks tool-specific failure copy when transcript ends on tool', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool_result', content: '{"done":true}' },
    ];
    expect(resolveDeferredReplyFailureReason(messages)).toBe(TOOL_RESULT_TERMINAL_FAILURE_REASON);
    expect(resolveDeferredReplyFailureReason([{ role: 'user', content: 'hello' }])).toBe(
      EMPTY_REPLY_FAILURE_REASON,
    );
  });

  it('fails deferred polling after grace once tool result is present', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'hello' },
      {
        role: 'tool',
        content: '{"output":"done"}',
        created_at: new Date(now - TOOL_RESULT_TERMINAL_GRACE_MS - 1).toISOString(),
      },
    ];
    expect(
      shouldFailAwaitingToolResultReply(messages, now - 5_000, now),
    ).toBe(true);
    expect(lastToolResultTimestampMs(messages)).toBe(now - TOOL_RESULT_TERMINAL_GRACE_MS - 1);
  });

  it('waits for grace before failing when tool result just landed', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool', content: '{"output":"done"}', created_at: new Date(now - 5_000).toISOString() },
    ];
    expect(shouldFailAwaitingToolResultReply(messages, now - 10_000, now)).toBe(false);
  });
});
