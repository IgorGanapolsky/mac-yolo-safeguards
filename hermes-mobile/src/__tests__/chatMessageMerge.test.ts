import { dedupeChatMessages, dedupeDeferredStreamPlaceholders, hasUnsyncedLocalMessages, isMessageBodyEmpty, isMessageDisplayEmpty, mergeServerMessagesWithPending, transcriptDigest } from '../utils/chatMessageMerge';
import type { HermesMessage } from '../types/chat';
import { GENERIC_EMPTY_STREAM_PLACEHOLDER, TELEGRAM_QUEUED_REPLY_PLACEHOLDER } from '../utils/streamAssistantText';

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

  it('drops optimistic user bubble when the latest server user line matches', () => {
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

  it('keeps a new optimistic user bubble when an older server turn repeats the same text', () => {
    const repeated = 'run delegate task';
    const server: HermesMessage[] = [
      { id: 'gw-u1', role: 'user', content: repeated },
      { id: 'gw-a1', role: 'assistant', content: 'first answer' },
    ];
    const local: HermesMessage[] = [
      ...server,
      { id: 'user-99', role: 'user', content: repeated, outboundStatus: 'pending' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.filter((m) => m.role === 'user')).toHaveLength(2);
    expect(merged[merged.length - 1]?.id).toBe('user-99');
  });

  it('drops pending optimistic user bubble when gateway transcript already ends with the same line', () => {
    const prompt = 'make money faster';
    const server: HermesMessage[] = [{ id: 'gw-u', role: 'user', content: prompt }];
    const local: HermesMessage[] = [
      ...server,
      { id: 'user-1', role: 'user', content: prompt, outboundStatus: 'pending' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(merged[0]?.content).toBe(prompt);
    expect(merged[0]?.id).toBe('gw-u');
  });

  it('transfers pending outbound status onto server user line when optimistic duplicate is dropped', () => {
    const prompt = 'make money faster';
    const server: HermesMessage[] = [{ id: 'gw-u', role: 'user', content: prompt }];
    const local: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: prompt, outboundStatus: 'pending' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.outboundStatus).toBe('pending');
  });

  it('drops an optimistic prompt when the gateway appends a separate context block', () => {
    const prompt = 'Can you pick up where you left off????';
    const server: HermesMessage[] = [
      {
        id: 'gw-u',
        role: 'user',
        content: `${prompt}\n\nHermes mobile app`,
      },
    ];
    const local: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: prompt, outboundStatus: 'pending' },
    ];

    const merged = mergeServerMessagesWithPending(server, local);

    expect(merged.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(merged[0]?.id).toBe('gw-u');
    expect(merged[0]?.outboundStatus).toBe('pending');
  });

  it('dedupes identical user echoes from gateway', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'same question' },
      { role: 'user', content: 'same question' },
    ];
    expect(dedupeChatMessages(server).length).toBe(1);
  });

  it('builds a stable transcript digest for no-op refresh detection', () => {
    const messages: HermesMessage[] = [
      { id: '1', role: 'user', content: 'hello' },
      { id: '2', role: 'assistant', content: 'hi', truncated: true },
    ];
    expect(transcriptDigest(messages)).toBe('1:user:5:0|2:assistant:2:1');
    expect(transcriptDigest(messages)).toBe(transcriptDigest([...messages]));
  });

  it('detects optimistic phone bubbles that still need merge on refresh', () => {
    expect(hasUnsyncedLocalMessages([{ id: 'user-1', role: 'user', content: 'pending' }])).toBe(true);
    expect(hasUnsyncedLocalMessages([{ id: 'asst-1', role: 'assistant', content: 'typing' }])).toBe(true);
    expect(
      hasUnsyncedLocalMessages([{ id: 'gw-1', role: 'user', content: 'synced from gateway' }]),
    ).toBe(false);
  });

  it('drops local streamed assistant bubble once server transcript has the same text', () => {
    const assistantText = 'Hi Skool Warm: past buyer — quick question';
    const server: HermesMessage[] = [
      { role: 'user', content: 'run outreach' },
      { id: 'gw-asst-1', role: 'assistant', content: assistantText },
    ];
    const local: HermesMessage[] = [
      ...server,
      { id: 'asst-99', role: 'assistant', content: assistantText },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(merged[1]?.id).toBe('gw-asst-1');
  });

  it('drops empty local assistant placeholder once server has a real reply', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster' },
      { id: 'gw-asst-1', role: 'assistant', content: 'Monetization plan ready.' },
    ];
    const local: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster', id: 'user-1' },
      { id: 'asst-empty', role: 'assistant', content: '' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(merged[1]?.content).toBe('Monetization plan ready.');
  });

  it('dedupes duplicate deferred stream placeholders for the same user turn', () => {
    const server: HermesMessage[] = [{ role: 'user', content: 'Print money make money faster' }];
    const local: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster', id: 'user-1' },
      { id: 'asst-1', role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
      { id: 'asst-2', role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(merged[1]?.content).toBe(GENERIC_EMPTY_STREAM_PLACEHOLDER);
    expect(merged[1]?.id).toBe('asst-1');
  });

  it('does not append a second deferred placeholder when one already exists after refresh merge', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster' },
      { id: 'gw-asst-1', role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
    ];
    const local: HermesMessage[] = [
      { role: 'user', content: 'Print money make money faster', id: 'user-1', outboundStatus: 'pending' },
      { id: 'asst-local', role: 'assistant', content: GENERIC_EMPTY_STREAM_PLACEHOLDER },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    const assistants = merged.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.id).toBe('asst-local');
  });

  it('dedupeDeferredStreamPlaceholders keeps local asst- bubble over server echo', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'hello' },
      { id: 'gw-1', role: 'assistant', content: TELEGRAM_QUEUED_REPLY_PLACEHOLDER },
      { id: 'asst-9', role: 'assistant', content: TELEGRAM_QUEUED_REPLY_PLACEHOLDER },
    ];
    const deduped = dedupeDeferredStreamPlaceholders(messages);
    expect(deduped.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(deduped[1]?.id).toBe('asst-9');
  });
});
