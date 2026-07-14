import {
  extractAssistantFromRunCompletedPayload,
  extractAssistantFromTranscriptMessages,
  findNewAssistantReply,
  isDeferredStreamPlaceholder,
  isTelegramDeferredEmptyStream,
  snapshotAssistantBodies,
  TELEGRAM_QUEUED_REPLY_PLACEHOLDER,
  EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
} from '../utils/streamAssistantText';
import type { HermesMessage, HermesSession } from '../types/chat';

describe('streamAssistantText', () => {
  it('extracts assistant text from run.completed messages array', () => {
    const payload = {
      messages: [
        { role: 'tool', content: 'tool output' },
        { role: 'assistant', content: 'First segment' },
        { role: 'assistant', content: 'Final reply' },
      ],
    };
    expect(extractAssistantFromRunCompletedPayload(payload)).toBe(
      'First segment\n\nFinal reply',
    );
  });

  it('falls back to output field on run.completed', () => {
    expect(extractAssistantFromRunCompletedPayload({ output: 'from output' })).toBe('from output');
  });

  it('detects telegram deferred empty stream', () => {
    const telegram: HermesSession = { id: 'tg-1', source: 'telegram' };
    expect(isTelegramDeferredEmptyStream(telegram, '')).toBe(true);
    expect(isTelegramDeferredEmptyStream(telegram, 'hello')).toBe(false);
    expect(isTelegramDeferredEmptyStream({ id: 'cli', source: 'cli' }, '')).toBe(false);
  });

  it('finds a new assistant reply not in the pre-send snapshot', () => {
    const prior = snapshotAssistantBodies([
      { role: 'assistant', content: 'Old reply' },
    ]);
    const messages: HermesMessage[] = [
      { role: 'user', content: 'ping' },
      { role: 'assistant', content: 'Old reply' },
      { role: 'assistant', content: 'Fresh reply' },
    ];
    expect(findNewAssistantReply(messages, prior)).toBe('Fresh reply');
  });

  it('ignores deferred placeholders when scanning for new replies', () => {
    const prior = snapshotAssistantBodies([]);
    const messages: HermesMessage[] = [
      { role: 'assistant', content: TELEGRAM_QUEUED_REPLY_PLACEHOLDER },
      { role: 'assistant', content: 'Real answer' },
    ];
    expect(findNewAssistantReply(messages, prior)).toBe('Real answer');
  });

  it('ignores summarization stubs when scanning for new replies', () => {
    const prior = snapshotAssistantBodies([]);
    const messages: HermesMessage[] = [
      { role: 'assistant', content: '... Earlier conversation summarized to save context.' },
      { role: 'assistant', content: 'Ship the affiliate funnel.' },
    ];
    expect(findNewAssistantReply(messages, prior)).toBe('Ship the affiliate funnel.');
  });

  it('recognizes deferred stream placeholders', () => {
    expect(isDeferredStreamPlaceholder(TELEGRAM_QUEUED_REPLY_PLACEHOLDER)).toBe(true);
    expect(
      isDeferredStreamPlaceholder(
        'Working on your computer… Hermes may be using tools (browser, search, terminal). The reply will show here when ready.',
      ),
    ).toBe(true);
    expect(
      isDeferredStreamPlaceholder('(Hermes did not return text yet — still running on your computer.)'),
    ).toBe(true);
    expect(isDeferredStreamPlaceholder('hello')).toBe(false);
  });

  it('extractAssistantFromTranscriptMessages returns empty for non-arrays', () => {
    expect(extractAssistantFromTranscriptMessages(null)).toBe('');
    expect(extractAssistantFromTranscriptMessages('nope')).toBe('');
  });

  it('does not tell users to pull to refresh when the stream times out', () => {
    expect(EMPTY_STREAM_TIMEOUT_PLACEHOLDER.toLowerCase()).not.toContain('pull to refresh');
    expect(EMPTY_STREAM_TIMEOUT_PLACEHOLDER.toLowerCase()).toContain('refresh below');
    expect(isDeferredStreamPlaceholder(EMPTY_STREAM_TIMEOUT_PLACEHOLDER)).toBe(true);
  });
});
