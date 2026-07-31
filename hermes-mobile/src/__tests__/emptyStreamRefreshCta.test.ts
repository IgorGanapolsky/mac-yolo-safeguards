import fs from 'fs';
import path from 'path';
import {
  assertNoPullToRefreshCopy,
  EMPTY_STREAM_REFRESH_BANNER_HINT,
  emptyStreamBannerHint,
  emptyStreamDisplayElapsedMs,
  messageIsEmptyStreamTimeout,
  shouldShowEmptyStreamRefreshCta,
  stripSupersededEmptyStreamTimeouts,
  isEmptyStreamRecoveryStatus,
  USER_FACING_EMPTY_STREAM_COPY_FILES,
} from '../utils/emptyStreamRefreshCta';
import {
  EMPTY_REPLY_FAILURE_REASON,
  EMPTY_STREAM_HARD_STOP_MS,
  EMPTY_STREAM_HARD_STOP_STATUS,
} from '../utils/emptyStreamReplyRecovery';
import {
  EMPTY_STREAM_TIMEOUT_PLACEHOLDER,
} from '../utils/streamAssistantText';
import type { HermesMessage } from '../types/chat';

const mobileRoot = path.resolve(__dirname, '../..');

describe('emptyStreamRefreshCta', () => {
  it('detects timed-out empty-stream assistant bubbles after the last user turn', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'Make money faster' },
      { role: 'assistant', content: EMPTY_STREAM_TIMEOUT_PLACEHOLDER },
    ];
    expect(messageIsEmptyStreamTimeout(EMPTY_STREAM_TIMEOUT_PLACEHOLDER)).toBe(true);
    expect(shouldShowEmptyStreamRefreshCta(messages)).toBe(true);
  });

  it('ignores timed-out placeholders from an earlier turn', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'Old prompt' },
      { role: 'assistant', content: EMPTY_STREAM_TIMEOUT_PLACEHOLDER },
      { role: 'user', content: 'New prompt' },
      { role: 'assistant', content: 'Fresh answer' },
    ];
    expect(shouldShowEmptyStreamRefreshCta(messages)).toBe(false);
  });

  it('does not advertise pull-to-refresh or mandatory manual refresh in empty-stream copy', () => {
    for (const relativePath of USER_FACING_EMPTY_STREAM_COPY_FILES) {
      const source = fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
      assertNoPullToRefreshCopy(source, relativePath);
    }
    expect(EMPTY_STREAM_TIMEOUT_PLACEHOLDER.toLowerCase()).toMatch(/check|leash/);
    expect(EMPTY_REPLY_FAILURE_REASON.toLowerCase()).toMatch(/fresh chat|leash/);
    expect(EMPTY_STREAM_REFRESH_BANNER_HINT.toLowerCase()).toContain('checking automatically');
    expect(EMPTY_STREAM_REFRESH_BANNER_HINT.toLowerCase()).toContain('leash');
    expect(EMPTY_STREAM_REFRESH_BANNER_HINT.toLowerCase()).not.toContain('tap refresh');
    expect(emptyStreamBannerHint(45_000)).toContain('(45s)');
    expect(emptyStreamBannerHint(45_000).toLowerCase()).toContain('leash');
    expect(emptyStreamBannerHint(45_000).toLowerCase()).not.toContain('tap refresh');
    expect(emptyStreamBannerHint(EMPTY_STREAM_HARD_STOP_MS)).toBe(EMPTY_STREAM_HARD_STOP_STATUS);
    expect(emptyStreamDisplayElapsedMs(3_430_000)).toBe(EMPTY_STREAM_HARD_STOP_MS);
  });

  it('does not show CTA when a real reply coexists with a timeout bubble', () => {
    const messages: HermesMessage[] = [
      { role: 'user', content: 'Which buyer channel gets priority today?' },
      { role: 'assistant', content: EMPTY_STREAM_TIMEOUT_PLACEHOLDER },
      {
        role: 'assistant',
        content:
          'The goal cell shows 5 prepared guard packets but we have not engaged buyers yet.',
      },
    ];
    expect(shouldShowEmptyStreamRefreshCta(messages)).toBe(false);
    const stripped = stripSupersededEmptyStreamTimeouts(messages);
    expect(stripped).toHaveLength(2);
    expect(stripped.some((m) => messageIsEmptyStreamTimeout(m.content))).toBe(false);
  });

  it('treats legacy Stopped waiting copy as empty-stream timeout', () => {
    const legacy =
      'Stopped waiting on your Mac. Open Leash if a tool needs approve/deny/warn, Stop an active run, or start a fresh chat.';
    expect(messageIsEmptyStreamTimeout(legacy)).toBe(true);
    expect(isEmptyStreamRecoveryStatus(legacy)).toBe(true);
    expect(
      shouldShowEmptyStreamRefreshCta([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: legacy },
      ]),
    ).toBe(true);
  });

});
