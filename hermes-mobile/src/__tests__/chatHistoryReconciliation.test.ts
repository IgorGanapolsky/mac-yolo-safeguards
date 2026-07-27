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

  it('keeps a repeated sent user-* after the server already completed the same-text turn', () => {
    const server: HermesMessage[] = [
      {
        id: 'gateway-user-old-run',
        role: 'user',
        content: 'run',
        created_at: '2026-07-22T07:00:00.000Z',
      },
      {
        id: 'gateway-assistant-after-old-run',
        role: 'assistant',
        content: 'Finished the first run.',
        created_at: '2026-07-22T07:05:00.000Z',
      },
    ];
    const local: HermesMessage[] = [
      ...server,
      {
        id: 'user-repeat-run',
        role: 'user',
        content: 'run',
        outboundStatus: 'sent',
        created_at: '2026-07-22T07:10:00.000Z',
      },
    ];

    expect(reconcileChatHistory(server, local).map((message) => message.id)).toEqual([
      'gateway-user-old-run',
      'gateway-assistant-after-old-run',
      'user-repeat-run',
    ]);
  });

  it('keeps sent optimistic user-* when server omits the correction between assistants', () => {
    const server: HermesMessage[] = [
      {
        id: 'gw-a1',
        role: 'assistant',
        content: 'Drafted the Skool update.',
        created_at: '2026-07-22T06:54:00.000Z',
      },
      {
        id: 'gw-a2',
        role: 'assistant',
        content: 'Corrected the Skool post with your feedback.',
        created_at: '2026-07-22T07:58:00.000Z',
      },
    ];
    const local: HermesMessage[] = [
      server[0]!,
      {
        id: 'user-corr',
        role: 'user',
        content: 'Please correct the Skool post before publishing',
        outboundStatus: 'sent',
        created_at: '2026-07-22T07:10:00.000Z',
      },
    ];

    expect(reconcileChatHistory(server, local).map((message) => message.id)).toEqual([
      'gw-a1',
      'user-corr',
      'gw-a2',
    ]);
  });
});
