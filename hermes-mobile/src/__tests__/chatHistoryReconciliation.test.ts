import { reconcileChatHistory } from '../utils/chatHistoryReconciliation';
import type { HermesMessage } from '../types/chat';

describe('reconcileChatHistory', () => {
  it('keeps local turns absent from a partial newest-first server response chronologically', () => {
    const server: HermesMessage[] = [
      {
        id: 'gateway-assistant',
        role: 'assistant',
        content: 'The correction is applied.',
        created_at: '2026-07-22T08:01:00.000Z',
      },
      {
        id: 'gateway-earlier',
        role: 'assistant',
        content: 'Earlier reply.',
        created_at: '2026-07-22T07:58:00.000Z',
      },
    ];
    const local: HermesMessage[] = [
      {
        id: 'user-correction',
        role: 'user',
        content: 'Please correct the scheduled post.',
        created_at: '2026-07-22T08:00:00.000Z',
      },
    ];

    expect(reconcileChatHistory(server, local).map((message) => message.id)).toEqual([
      'gateway-earlier',
      'user-correction',
      'gateway-assistant',
    ]);
  });
});
