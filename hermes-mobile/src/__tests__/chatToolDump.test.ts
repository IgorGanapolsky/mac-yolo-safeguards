import type { HermesMessage } from '../types/chat';
import {
  filterChatTimelineMessages,
} from '../utils/chatOutboundDisplay';
import {
  dedupeToolDumpMessages,
  isToolDumpDisplayContent,
  shouldHideToolDumpFromTimeline,
  toolDumpSemanticFingerprint,
} from '../utils/chatToolDump';
import { mergeServerMessagesWithPending } from '../utils/chatMessageMerge';
import { prepareMessagesForDisplay } from '../utils/chatMessageDisplay';

describe('chatToolDump', () => {
  it('detects formatted tool output anywhere in the body', () => {
    expect(isToolDumpDisplayContent('Running…\n[tool output] status=ok')).toBe(true);
    expect(isToolDumpDisplayContent('{"output":"{\\"status\\":\\"ok\\"}"}')).toBe(true);
    expect(
      isToolDumpDisplayContent(
        '<TOOLCALL>[{"name": "read_file", "arguments": {"path": "x.md"}}]</TOOLCALL>',
      ),
    ).toBe(true);
  });

  it('hides tool role and dump content from default timeline', () => {
    expect(
      shouldHideToolDumpFromTimeline({ role: 'tool', content: '{"bytes_written":1234}' }, false),
    ).toBe(true);
    expect(
      shouldHideToolDumpFromTimeline(
        { role: 'assistant', content: '[tool output] status=ok' },
        false,
      ),
    ).toBe(true);
  });

  it('dedupes identical tool payloads that only differ by volatile ids', () => {
    const messages: HermesMessage[] = [
      { id: 't1', role: 'tool', content: '{"output":"ok","pid":111}' },
      { id: 't2', role: 'tool', content: '{"output":"ok","pid":222}' },
      { role: 'assistant', content: 'Done on your Mac.' },
    ];
    const deduped = dedupeToolDumpMessages(messages);
    expect(deduped.map((m) => m.role)).toEqual(['tool', 'assistant']);
  });

  it('fingerprint ignores pid and bytes_written churn from gateway poll', () => {
    const first = toolDumpSemanticFingerprint({
      role: 'tool',
      content: '{"output":"{\\"status\\":\\"ok\\"}","pid":100}',
    });
    const second = toolDumpSemanticFingerprint({
      role: 'tool',
      content: '{"output":"{\\"status\\":\\"ok\\"}","pid":200,"bytes_written":999}',
    });
    expect(first).toBe(second);
  });
});

describe('chat timeline tool spam', () => {
  it('filters and dedupes repeated tool dumps from FlashList data by default', () => {
    const messages: HermesMessage[] = [
      { id: 'user-1', role: 'user', content: 'run delegate task' },
      { id: 'tool-1', role: 'tool', content: '{"output":"{\\"status\\":\\"ok\\"}"}' },
      { id: 'tool-2', role: 'tool', content: '{"output":"{\\"status\\":\\"ok\\"}"}' },
      { role: 'assistant', content: '[tool output] status=ok' },
      { role: 'assistant', content: 'Finished on your Mac.' },
    ];
    const timeline = filterChatTimelineMessages({
      messages,
      includeToolActivity: false,
    });
    expect(timeline.map((entry) => entry.message.content)).toEqual([
      'run delegate task',
      'Finished on your Mac.',
    ]);
  });

  it('prepareMessagesForDisplay drops tool dumps for normal users', () => {
    const visible = prepareMessagesForDisplay(
      [
        { role: 'user', content: 'check status' },
        { role: 'tool', content: '{"success":true,"name":"hermes-agent"}' },
        { role: 'assistant', content: '[tool output] status=ok, pid=12345' },
        { role: 'assistant', content: 'All good on your Mac.' },
      ],
      { includeToolActivity: false },
    );
    expect(visible.map((m) => m.content)).toEqual(['check status', 'All good on your Mac.']);
  });

  it('merge keeps pending user but still dedupes repeated tool lines during poll', () => {
    const server: HermesMessage[] = [
      { role: 'tool', content: '{"output":"ok","pid":1}' },
      { role: 'tool', content: '{"output":"ok","pid":2}' },
    ];
    const local: HermesMessage[] = [
      ...server,
      { id: 'user-9', role: 'user', content: 'just sent', outboundStatus: 'pending' },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.filter((m) => m.role === 'tool')).toHaveLength(1);
    expect(merged.some((m) => m.id === 'user-9')).toBe(true);
  });
});
