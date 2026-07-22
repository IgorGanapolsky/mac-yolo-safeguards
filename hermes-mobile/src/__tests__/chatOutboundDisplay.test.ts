import type { HermesMessage } from '../types/chat';
import {
  CHAT_LIST_HEADER_CLEARANCE,
  filterChatTimelineMessages,
  resolveSubmittedPromptStripVisibility,
  shouldShowSubmittedPromptStrip,
} from '../utils/chatOutboundDisplay';
import {
  EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
  GENERIC_EMPTY_STREAM_PLACEHOLDER,
} from '../utils/streamAssistantText';

describe('chatOutboundDisplay', () => {
  it('hides composer strip when optimistic user bubble already shows the text', () => {
    const messages: HermesMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Make money faster',
        outboundStatus: 'pending',
      },
    ];
    expect(
      shouldShowSubmittedPromptStrip({
        pinnedText: 'Make money faster',
        messages,
      }),
    ).toBe(false);
  });

  it('hides composer strip once optimistic user bubble is in the transcript during send', () => {
    const messages: HermesMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Print money make money faster',
        outboundStatus: 'sent',
      },
      { role: 'assistant', content: 'Running delegate task…' },
      { role: 'tool', content: '{"output":"{\\"status\\":\\"ok\\"}"}' },
    ];
    expect(
      shouldShowSubmittedPromptStrip({
        pinnedText: 'Print money make money faster',
        messages,
      }),
    ).toBe(false);
  });

  it('shows composer strip only before the optimistic bubble lands in the list', () => {
    expect(shouldShowSubmittedPromptStrip({ pinnedText: 'Make money faster', messages: [] })).toBe(
      true,
    );
  });

  it('regression: never shows strip+bubble together even when isSending would force-show', () => {
    const pinnedText = 'Make money today';
    const messages: HermesMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: pinnedText,
        outboundStatus: 'pending',
      },
    ];
    const hasMatchingBubble = messages.some(
      (message) => message.role === 'user' && message.content === pinnedText,
    );
    expect(hasMatchingBubble).toBe(true);

    // Pre-#184 ChatScreen bug: `isSending || shouldShow...` forced the purple strip.
    const buggyIsSendingOverride = true || shouldShowSubmittedPromptStrip({ pinnedText, messages });
    expect(buggyIsSendingOverride).toBe(true);

    const showStrip = resolveSubmittedPromptStripVisibility({
      pinnedText,
      messages,
      isSending: true,
    });
    expect(showStrip).toBe(false);
    expect(showStrip && hasMatchingBubble).toBe(false);
  });

  it('ignores blank pinned text', () => {
    expect(shouldShowSubmittedPromptStrip({ pinnedText: '   ', messages: [] })).toBe(false);
  });

  it('exports inverted-list top clearance padding', () => {
    expect(CHAT_LIST_HEADER_CLEARANCE).toBeGreaterThan(0);
  });

  it('filters tool spam but keeps the user bubble in FlashList data', () => {
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'ship fix', outboundStatus: 'sent' },
      { role: 'tool', content: '{"bytes_written":1234}' },
      { role: 'assistant', content: '[tool output] status=ok' },
      { role: 'assistant', content: 'Done on your Mac.' },
    ];
    const timeline = filterChatTimelineMessages({
      messages,
      includeToolActivity: false,
    });
    expect(timeline.map((entry) => entry.message.content)).toEqual(['ship fix', 'Done on your Mac.']);
  });

  it('never renders persisted cron delivery scaffolding as a bubble', () => {
    const cronSystemPrompt =
      '[IMPORTANT: You are running as a scheduled cron job. DELIVERY: Your final response will be automatically delivered to the user — do NOT use send_message or try to deliver the output yourself. Just produce your report/output as your final response and the system handles the rest. SILENT: If there is nothing to report, return [SILENT].]';
    const messages: HermesMessage[] = [
      { id: 'cron-prompt', role: 'user', content: cronSystemPrompt },
      { id: 'user-1', role: 'user', content: 'make money today', outboundStatus: 'sent' },
      { id: 'asst-1', role: 'assistant', content: 'I found three qualified leads.' },
    ];

    const timeline = filterChatTimelineMessages({ messages, includeToolActivity: false });

    expect(timeline.map((entry) => entry.message.content)).toEqual([
      'make money today',
      'I found three qualified leads.',
    ]);
  });

  it('keeps normal cron-related conversation visible', () => {
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'Can you schedule a cron job for 9 AM?' },
      { id: 'asst-1', role: 'assistant', content: 'I can help set up that scheduled job.' },
    ];

    expect(
      filterChatTimelineMessages({ messages, includeToolActivity: false }).map(
        (entry) => entry.message.content,
      ),
    ).toEqual(messages.map((message) => message.content));
  });

  it('hides in-flight working-status placeholders so tool polls cannot spam the transcript', () => {
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'Make money today', outboundStatus: 'sent' },
      { id: 'asst-1', role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
      {
        id: 'asst-2',
        role: 'assistant',
        content: `${GENERIC_EMPTY_STREAM_PLACEHOLDER}\n\nUsing on your computer: browser navigate`,
      },
      { id: 'asst-3', role: 'assistant', content: EMPTY_STREAM_TIMEOUT_PLACEHOLDER },
      { id: 'asst-4', role: 'assistant', content: 'Here is the earnings plan.' },
    ];
    const timeline = filterChatTimelineMessages({ messages, includeToolActivity: false });
    expect(timeline.map((entry) => entry.message.content)).toEqual([
      'Make money today',
      EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
      'Here is the earnings plan.',
    ]);
    expect(
      timeline.filter((entry) =>
        String(entry.message.content).includes('Hermes may be using tools'),
      ),
    ).toHaveLength(0);
  });
});
