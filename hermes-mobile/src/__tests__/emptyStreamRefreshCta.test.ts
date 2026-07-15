import fs from 'fs';
import path from 'path';
import {
  assertNoPullToRefreshCopy,
  EMPTY_STREAM_REFRESH_BANNER_HINT,
  emptyStreamBannerHint,
  messageIsEmptyStreamTimeout,
  shouldShowEmptyStreamRefreshCta,
  USER_FACING_EMPTY_STREAM_COPY_FILES,
} from '../utils/emptyStreamRefreshCta';
import { EMPTY_REPLY_FAILURE_REASON } from '../utils/emptyStreamReplyRecovery';
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
    expect(EMPTY_STREAM_TIMEOUT_PLACEHOLDER.toLowerCase()).toContain('checking');
    expect(EMPTY_REPLY_FAILURE_REASON.toLowerCase()).toContain('checking automatically');
    expect(EMPTY_STREAM_REFRESH_BANNER_HINT.toLowerCase()).toContain('checking automatically');
    expect(EMPTY_STREAM_REFRESH_BANNER_HINT.toLowerCase()).not.toContain('tap refresh');
    expect(emptyStreamBannerHint(45_000)).toContain('(45s)');
    expect(emptyStreamBannerHint(45_000).toLowerCase()).not.toContain('tap refresh');
  });
});
