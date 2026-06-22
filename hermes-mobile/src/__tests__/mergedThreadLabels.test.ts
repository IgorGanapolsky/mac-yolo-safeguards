import { threadLabelAtMessageIndex } from '../utils/mergedThreadLabels';
import type { HermesMessage } from '../types/chat';

describe('mergedThreadLabels', () => {
  const messages: HermesMessage[] = [
    {
      role: 'user',
      content: 'a',
      sourceSessionId: 'tg-1',
      threadLabel: 'Thread One',
    },
    {
      role: 'assistant',
      content: 'b',
      sourceSessionId: 'tg-1',
      threadLabel: 'Thread One',
    },
    {
      role: 'user',
      content: 'c',
      sourceSessionId: 'tg-2',
      threadLabel: 'Thread Two',
    },
  ];

  it('shows label only at thread boundaries', () => {
    expect(threadLabelAtMessageIndex(messages, 0)).toBe('Thread One');
    expect(threadLabelAtMessageIndex(messages, 1)).toBeUndefined();
    expect(threadLabelAtMessageIndex(messages, 2)).toBe('Thread Two');
  });
});
