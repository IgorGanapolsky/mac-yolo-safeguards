import { dedupeChatMessages, isMessageBodyEmpty, isMessageDisplayEmpty, mergeServerMessagesWithPending } from '../utils/chatMessageMerge';
import type { HermesMessage } from '../types/chat';

describe('mergeServerMessagesWithPending', () => {
  it('treats zero-width-only content as empty', () => {
    expect(isMessageDisplayEmpty('\u200b')).toBe(true);
    expect(isMessageBodyEmpty('\u200b')).toBe(true);
    expect(isMessageDisplayEmpty('hello')).toBe(false);
  });

  it('skips ghost bubbles when display text is empty but raw metadata remains', () => {
    expect(
      isMessageDisplayEmpty(''),
    ).toBe(true);
    expect(
      isMessageBodyEmpty('', '{"tool":"web_search","results":[]}'),
    ).toBe(false);
  });

  it('keeps local user message when server transcript has not caught up', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'older', created_at: '2026-06-21T12:00:00Z' },
    ];
    const local: HermesMessage[] = [
      ...server,
      { id: 'user-1', role: 'user', content: 'just sent from phone', created_at: '2026-06-21T13:00:00Z' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.map((m) => m.content)).toEqual(['older', 'just sent from phone']);
  });

  it('keeps streaming assistant placeholder during refresh', () => {
    const server: HermesMessage[] = [{ role: 'user', content: 'hi' }];
    const local: HermesMessage[] = [
      { role: 'user', content: 'hi' },
      { id: 'asst-1', role: 'assistant', content: 'typing…' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.length).toBe(2);
    expect(merged[1]?.id).toBe('asst-1');
  });

  it('does not duplicate messages already on server', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'synced' },
      { role: 'assistant', content: 'reply' },
    ];
    const local: HermesMessage[] = [...server];
    expect(mergeServerMessagesWithPending(server, local)).toEqual(server);
  });

  it('does not throw when gateway message id is numeric', () => {
    const server: HermesMessage[] = [{ id: 42 as unknown as string, role: 'user', content: 'from gateway' }];
    const local: HermesMessage[] = [
      ...server,
      { id: 'user-phone', role: 'user', content: 'pending send' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.map((m) => m.content)).toEqual(['from gateway', 'pending send']);
  });

  it('drops optimistic user bubble when server transcript caught up (raw vs preview)', () => {
    const question = "Aren't we working in Skool_top1percent project?";
    const server: HermesMessage[] = [
      {
        id: 'gw-1',
        role: 'user',
        content: question.slice(0, 20) + '…',
        rawContent: question,
        truncated: true,
      },
    ];
    const local: HermesMessage[] = [
      { id: 'user-1700', role: 'user', content: question, created_at: '2026-06-22T17:52:00Z' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.length).toBe(1);
    expect(merged[0]?.rawContent ?? merged[0]?.content).toContain('Skool_top1percent');
  });

  it('dedupes identical user echoes from gateway', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'same question' },
      { role: 'user', content: 'same question' },
    ];
    expect(dedupeChatMessages(server).length).toBe(1);
  });
});
