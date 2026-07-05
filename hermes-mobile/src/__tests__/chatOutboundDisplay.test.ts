import type { HermesMessage } from '../types/chat';
import {
  CHAT_LIST_HEADER_CLEARANCE,
  filterChatTimelineMessages,
  shouldShowSubmittedPromptStrip,
} from '../utils/chatOutboundDisplay';

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
});
