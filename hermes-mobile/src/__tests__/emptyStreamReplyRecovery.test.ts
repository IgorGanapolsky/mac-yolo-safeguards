import {
  deferredReplyPollBudgetMs,
  DEFERRED_REPLY_POLL_MAX_MS,
  DEFERRED_REPLY_POLL_MAX_WITH_TOOLS_MS,
  DEFERRED_REPLY_POLL_MS,
  EMPTY_REPLY_FAILURE_REASON,
  EMPTY_STREAM_SELF_HEAL_AFTER_MS,
  emptyStreamCheckingStatus,
  serverHasAssistantReplyAfterLastUser,
  shouldAwaitGatewayReplyAfterSend,
  shouldKeepAutoPollingForReply,
  toolActivityAfterLastUser,
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
        assistantText: '[SILENT]',
        streamAccepted: true,
        streamFailed: false,
      }),
    ).toBe(true);
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

    const silentOnly: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster' },
      { role: 'assistant', content: '[SILENT]' },
    ];
    expect(serverHasAssistantReplyAfterLastUser(silentOnly)).toBe(false);

    const withReply: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster' },
      { role: 'assistant', content: 'Here is the monetization plan.' },
    ];
    expect(serverHasAssistantReplyAfterLastUser(withReply)).toBe(true);
  });

  it('does not treat summarization stubs as a finished assistant reply', () => {
    const stubbed: HermesMessage[] = [
      { role: 'user', content: 'Make money today' },
      { role: 'assistant', content: '... Earlier conversation summarized to save context.' },
    ];
    expect(serverHasAssistantReplyAfterLastUser(stubbed)).toBe(false);
    expect(
      shouldAwaitGatewayReplyAfterSend({
        assistantText: '... Earlier conversation summarized to save context.',
        streamAccepted: true,
        streamFailed: false,
      }),
    ).toBe(true);
  });

  it('bounds empty-reply recovery and extends when tools are active', () => {
    expect(DEFERRED_REPLY_POLL_MS).toBe(4000);
    expect(DEFERRED_REPLY_POLL_MAX_MS).toBe(60_000);
    expect(DEFERRED_REPLY_POLL_MAX_WITH_TOOLS_MS).toBe(180_000);
    expect(EMPTY_STREAM_SELF_HEAL_AFTER_MS).toBe(30_000);
    expect(deferredReplyPollBudgetMs({ toolsActive: false })).toBe(60_000);
    expect(deferredReplyPollBudgetMs({ toolsActive: true })).toBe(180_000);
    expect(EMPTY_REPLY_FAILURE_REASON).toMatch(/fresh chat|checking automatically/i);
  });

  it('keeps auto-polling while awaiting reply or after empty-stream timeout', () => {
    expect(
      shouldKeepAutoPollingForReply({
        awaitingGatewayReply: true,
        hasEmptyStreamTimeout: false,
      }),
    ).toBe(true);
    expect(
      shouldKeepAutoPollingForReply({
        awaitingGatewayReply: false,
        hasEmptyStreamTimeout: true,
      }),
    ).toBe(true);
    expect(
      shouldKeepAutoPollingForReply({
        awaitingGatewayReply: false,
        hasEmptyStreamTimeout: false,
      }),
    ).toBe(false);
  });

  it('shows self-heal checking copy after 30s without requiring manual refresh', () => {
    expect(emptyStreamCheckingStatus(5_000)).toMatch(/working on your computer/i);
    expect(emptyStreamCheckingStatus(EMPTY_STREAM_SELF_HEAL_AFTER_MS)).toMatch(
      /checking your mac/i,
    );
    expect(emptyStreamCheckingStatus(45_000)).toBe('Checking your Mac… (45s)');
  });

  it('surfaces tool activity after the last user turn', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'Make money today' },
      { role: 'assistant', content: '', tool_calls: [{ id: '1' }] } as HermesMessage,
      { role: 'tool', content: 'result', tool_name: 'browser_navigate' } as HermesMessage,
    ];
    const activity = toolActivityAfterLastUser(messages);
    expect(activity.active).toBe(true);
    expect(activity.detail).toMatch(/browser/i);
  });
});
