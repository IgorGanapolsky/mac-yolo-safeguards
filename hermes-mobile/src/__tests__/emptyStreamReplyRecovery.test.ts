import {
  DEFERRED_REPLY_POLL_MAX_MS,
  DEFERRED_REPLY_POLL_MS,
  EMPTY_REPLY_FAILURE_REASON,
  serverHasAssistantReplyAfterLastUser,
  shouldAwaitGatewayReplyAfterSend,
} from '../utils/emptyStreamReplyRecovery';
import type { HermesMessage } from '../types/chat';
import { GENERIC_EMPTY_STREAM_PLACEHOLDER } from '../utils/streamAssistantText';

describe('emptyStreamReplyRecovery', () => {
  it('awaits gateway reply when stream accepted but returned no tokens', () => {
    expect(
      shouldAwaitGatewayReplyAfterSend({
        assistantText: '',
        streamAccepted: true,
        streamFailed: false,
      }),
    ).toBe(true);
    expect(
      shouldAwaitGatewayReplyAfterSend({
        assistantText: 'hello',
        streamAccepted: true,
        streamFailed: false,
      }),
    ).toBe(false);
    expect(
      shouldAwaitGatewayReplyAfterSend({
        assistantText: '',
        streamAccepted: false,
        streamFailed: true,
      }),
    ).toBe(false);
  });

  it('detects assistant reply after the latest user turn on server transcript', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster' },
      { role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
    ];
    expect(serverHasAssistantReplyAfterLastUser(server)).toBe(false);

    const withReply: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster' },
      { role: 'assistant', content: 'Here is the monetization plan.' },
    ];
    expect(serverHasAssistantReplyAfterLastUser(withReply)).toBe(true);
  });

  it('bounds empty-reply recovery to one minute', () => {
    expect(DEFERRED_REPLY_POLL_MS).toBe(3000);
    expect(DEFERRED_REPLY_POLL_MAX_MS).toBe(60_000);
    expect(EMPTY_REPLY_FAILURE_REASON).toMatch(/retry/i);
  });
});
