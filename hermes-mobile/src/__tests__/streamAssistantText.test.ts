import {
  extractAssistantFromRunCompletedPayload,
  extractAssistantFromTranscriptMessages,
  findNewAssistantReply,
  GENERIC_EMPTY_STREAM_PLACEHOLDER,
  isDeferredStreamPlaceholder,
  isTelegramDeferredEmptyStream,
  isTransientWorkingStatusPlaceholder,
  preferRicherAssistantText,
  resolveWorkingPlaceholderAfterToolPoll,
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

  it('never replaces richer streamed text with a shorter refresh or placeholder', () => {
    const long =
      'Honest answer: not today. Warm outreach can still land a Stripe dollar this afternoon.';
    expect(preferRicherAssistantText(long, 'Short ack.')).toBe(long);
    expect(preferRicherAssistantText(long, GENERIC_EMPTY_STREAM_PLACEHOLDER)).toBe(long);
    expect(preferRicherAssistantText(GENERIC_EMPTY_STREAM_PLACEHOLDER, long)).toBe(long);
    expect(preferRicherAssistantText('Short.', `${long} More.`).startsWith('Honest')).toBe(true);
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

  it('scopes new replies to the latest user turn and prefers the longest body', () => {
    const prior = snapshotAssistantBodies([{ role: 'assistant', content: 'Old reply' }]);
    const long =
      'Long honest answer about Stripe and PayPal timing with concrete next actions.';
    const messages: HermesMessage[] = [
      { role: 'user', content: 'older' },
      { role: 'assistant', content: 'Brand new unrelated early bubble' },
      { role: 'user', content: 'What time today for next dollar?' },
      { role: 'assistant', content: 'Short' },
      { role: 'assistant', content: long },
    ];
    expect(findNewAssistantReply(messages, prior)).toBe(long);
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
    expect(EMPTY_STREAM_TIMEOUT_PLACEHOLDER.toLowerCase()).toContain('checking');
    expect(isDeferredStreamPlaceholder(EMPTY_STREAM_TIMEOUT_PLACEHOLDER)).toBe(true);
  });

  it('marks in-flight working copy as transient (banner-only) but keeps timeout/telegram visible', () => {
    expect(isTransientWorkingStatusPlaceholder(GENERIC_EMPTY_STREAM_PLACEHOLDER)).toBe(true);
    expect(
      isTransientWorkingStatusPlaceholder(
        `${GENERIC_EMPTY_STREAM_PLACEHOLDER}\n\nUsing on your computer: browser navigate`,
      ),
    ).toBe(true);
    expect(isTransientWorkingStatusPlaceholder(EMPTY_STREAM_TIMEOUT_PLACEHOLDER)).toBe(false);
    expect(isTransientWorkingStatusPlaceholder(TELEGRAM_QUEUED_REPLY_PLACEHOLDER)).toBe(false);
    expect(isTransientWorkingStatusPlaceholder('Here is the plan.')).toBe(false);
  });

  it('never appends tool-poll activity into the working placeholder bubble', () => {
    const once = resolveWorkingPlaceholderAfterToolPoll(
      GENERIC_EMPTY_STREAM_PLACEHOLDER,
      'Using on your computer: browser navigate',
    );
    const again = resolveWorkingPlaceholderAfterToolPoll(
      once,
      'Using on your computer: web search',
    );
    expect(once).toBe(GENERIC_EMPTY_STREAM_PLACEHOLDER);
    expect(again).toBe(GENERIC_EMPTY_STREAM_PLACEHOLDER);
    expect(again).not.toContain('web search');
  });
});
