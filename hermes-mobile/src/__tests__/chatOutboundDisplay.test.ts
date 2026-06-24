import type { HermesMessage } from '../types/chat';
import {
  CHAT_LIST_HEADER_CLEARANCE,
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
    expect(shouldShowSubmittedPromptStrip('Make money faster', messages)).toBe(false);
  });

  it('shows composer strip only before the optimistic bubble lands in the list', () => {
    expect(shouldShowSubmittedPromptStrip('Make money faster', [])).toBe(true);
  });

  it('ignores blank pinned text', () => {
    expect(shouldShowSubmittedPromptStrip('   ', [])).toBe(false);
  });

  it('exports inverted-list top clearance padding', () => {
    expect(CHAT_LIST_HEADER_CLEARANCE).toBeGreaterThan(0);
  });
});
