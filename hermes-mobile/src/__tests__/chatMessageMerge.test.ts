import {
  areNearDuplicateAssistantBodies,
  collapseNearDuplicateAssistantTurns,
  dedupeChatMessages,
  dedupeDeferredStreamPlaceholders,
  hasUnsyncedLocalMessages,
  isMessageBodyEmpty,
  isMessageDisplayEmpty,
  localAssistantRicherThanServer,
  mergeServerMessagesWithPending,
  transcriptDigest,
} from '../utils/chatMessageMerge';
import type { HermesMessage } from '../types/chat';
import { GENERIC_EMPTY_STREAM_PLACEHOLDER, TELEGRAM_QUEUED_REPLY_PLACEHOLDER } from '../utils/streamAssistantText';

const REVENUE_ACK_A =
  "I'll activate your revenue engine immediately. Let me spin up the autonomous loops that actually print money right now.";
const REVENUE_ACK_B =
  "I'll activate our revenue engines immediately. Let me check our current monetization channels and spin up our highest-ROI activities.";

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

  it('does not resurrect an internal silent completion from a refreshed transcript', () => {
    const server: HermesMessage[] = [
      { role: 'user', content: 'make money today' },
      { role: 'assistant', content: '[SILENT]' },
      { role: 'user', content: '[SILENT]' },
    ];
    const merged = mergeServerMessagesWithPending(server, []);
    expect(merged.map((message) => message.content)).toEqual(['make money today']);
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

  it('transfers failed stall status onto server user line when optimistic duplicate is dropped', () => {
    const prompt = 'Make money faster';
    const server: HermesMessage[] = [{ id: 'gw-u', role: 'user', content: prompt }];
    const local: HermesMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: prompt,
        outboundStatus: 'failed',
        outboundFailureReason: 'Run stalled on your Mac — recovering automatically…',
      },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('gw-u');
    expect(merged[0]?.outboundStatus).toBe('failed');
    expect(merged[0]?.outboundFailureReason).toContain('Run stalled');
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

  it('detects screenshot-style paraphrased revenue acks as near-duplicates', () => {
    expect(areNearDuplicateAssistantBodies(REVENUE_ACK_A, REVENUE_ACK_B)).toBe(true);
    expect(
      areNearDuplicateAssistantBodies(
        'Here is the Stripe payment link for ThumbGate Pro.',
        'Your Mac mini Tailscale IP is 100.94.135.78.',
      ),
    ).toBe(false);
  });

  it('collapses device screenshot investigative preambles (zero-dollars dual Let me…)', () => {
    const preambleA = 'Let me check our revenue pipeline status across all active channels:';
    const preambleB = 'Let me find the actual revenue evidence and pipeline:';
    expect(areNearDuplicateAssistantBodies(preambleA, preambleB)).toBe(true);

    const messages: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'Why we made zero dollars?' },
      { id: 'a1', role: 'assistant', content: preambleA, created_at: '2026-07-23T13:04:00Z' },
      { id: 'a2', role: 'assistant', content: preambleB, created_at: '2026-07-23T13:06:00Z' },
    ];
    const collapsed = collapseNearDuplicateAssistantTurns(messages);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect([preambleA, preambleB]).toContain(collapsed[1]?.content);

    expect(
      areNearDuplicateAssistantBodies(
        'Let me check the weather in Brooklyn for the weekend.',
        'Let me find the actual revenue evidence and pipeline:',
      ),
    ).toBe(false);
  });

  it('collapses consecutive near-duplicate assistant bubbles keeping the later one', () => {
    const messages: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'Make money today' },
      { id: 'a1', role: 'assistant', content: REVENUE_ACK_A, created_at: '2026-07-16T11:45:00Z' },
      { id: 'a2', role: 'assistant', content: REVENUE_ACK_B, created_at: '2026-07-16T11:46:00Z' },
    ];
    const collapsed = collapseNearDuplicateAssistantTurns(messages);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[1]?.id).toBe('a2');
    expect(collapsed[1]?.content).toBe(REVENUE_ACK_B);
  });

  it('dedupeChatMessages collapses near-duplicate assistant turns not just exact fingerprints', () => {
    const messages: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'Make money today' },
      { id: 'a1', role: 'assistant', content: REVENUE_ACK_A },
      { id: 'a2', role: 'assistant', content: REVENUE_ACK_B },
    ];
    const deduped = dedupeChatMessages(messages);
    expect(deduped.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(deduped[1]?.content).toBe(REVENUE_ACK_B);
  });

  it('drops local streamed assistant once server has a paraphrased reply for the same turn', () => {
    const server: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'Make money today' },
      { id: 'gw-a', role: 'assistant', content: REVENUE_ACK_B },
    ];
    const local: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'Make money today' },
      { id: 'asst-stream', role: 'assistant', content: REVENUE_ACK_A },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    const assistants = merged.filter((m) => m.role === 'assistant');
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.id).toBe('gw-a');
    expect(assistants[0]?.content).toBe(REVENUE_ACK_B);
  });

  it('keeps distinct consecutive assistant replies that are not near-duplicates', () => {
    const messages: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'status' },
      { id: 'a1', role: 'assistant', content: 'Gateway is healthy on Tailscale.' },
      {
        id: 'a2',
        role: 'assistant',
        content: 'Next I will open the Skool project and list unpaid invoices.',
      },
    ];
    expect(collapseNearDuplicateAssistantTurns(messages)).toHaveLength(3);
  });

  it('never wipes longer phone-streamed assistant when reconnect returns a truncated paraphrase', () => {
    const longStream =
      `${REVENUE_ACK_A} Reddit cold replies will not produce today revenue. ` +
      'I can fire direct outreach to warm contacts if that is what you want.';
    const server: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'Make money today' },
      { id: 'gw-a', role: 'assistant', content: REVENUE_ACK_A },
    ];
    const local: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'Make money today' },
      { id: 'asst-stream', role: 'assistant', content: longStream },
    ];
    expect(localAssistantRicherThanServer(server, longStream)).toBe(true);
    const merged = mergeServerMessagesWithPending(server, local);
    const assistants = merged.filter((m) => m.role === 'assistant');
    expect(assistants.some((m) => m.content === longStream)).toBe(true);
  });

  it('keeps local streamed assistant when mega-context refresh omits the latest turn', () => {
    const longStream =
      'Stripe next dollar depends on warm outreach landing today — not Reddit cold replies.';
    const server: HermesMessage[] = [
      { id: 'gw-old-u', role: 'user', content: 'older goal' },
      { id: 'gw-old-a', role: 'assistant', content: 'Older completed reply about Reddit.' },
    ];
    const local: HermesMessage[] = [
      ...server,
      {
        id: 'user-pending',
        role: 'user',
        content: 'What time today will I see our next dollar in stripe and PayPal',
        outboundStatus: 'pending',
      },
      { id: 'asst-stream', role: 'assistant', content: longStream },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.some((m) => m.content === longStream)).toBe(true);
    expect(merged.some((m) => m.id === 'user-pending')).toBe(true);
  });

  it('collapse prefers longer near-duplicate over a shorter later bubble', () => {
    const longBody = `${REVENUE_ACK_B} Extra evidence and next steps stay visible.`;
    const messages: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'Make money today' },
      { id: 'a1', role: 'assistant', content: longBody },
      { id: 'a2', role: 'assistant', content: REVENUE_ACK_A },
    ];
    const collapsed = collapseNearDuplicateAssistantTurns(messages);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[1]?.content).toBe(longBody);
  });
});
