import {
  emptyStreamCheckingStatus,
  shouldHardStopEmptyStreamWait,
  EMPTY_STREAM_HARD_STOP_MS,
} from '../utils/emptyStreamReplyRecovery';
import { emptyStreamBannerHint } from '../utils/emptyStreamRefreshCta';

/**
 * Owner-reported twice on 2026-07-31, from two screens:
 *   "It's answering, but still says stopped????"
 *   "Prompt turn looks like it completed, but it still says checking Mac?"
 *
 * Both are ONE bug. Every wait decision keys off elapsed time alone:
 *   shouldHardStopEmptyStreamWait(elapsedMs) => elapsedMs >= HARD_STOP
 * Nothing asks whether an assistant reply actually arrived, so the banner keeps
 * counting — and eventually claims the wait was abandoned — directly beneath a
 * reply that is visible on screen.
 *
 * This is the same product law violated by the false "not paired" status: never
 * report a failure state the visible artifact contradicts.
 */
const PAST_HARD_STOP = EMPTY_STREAM_HARD_STOP_MS + 5_000;
const MID_WAIT = 45_000;

describe('wait state resolves when a reply actually arrives', () => {
  it('does not hard-stop once a reply has landed, however long it took', () => {
    expect(shouldHardStopEmptyStreamWait(PAST_HARD_STOP, { hasAssistantReply: true })).toBe(false);
  });

  it('still hard-stops past the ceiling when NO reply arrived', () => {
    expect(shouldHardStopEmptyStreamWait(PAST_HARD_STOP, { hasAssistantReply: false })).toBe(true);
    // Absent option must behave exactly as before — no silent change for callers
    // that have not been updated yet.
    expect(shouldHardStopEmptyStreamWait(PAST_HARD_STOP)).toBe(true);
  });

  it('never claims "Stopped waiting" while a reply is on screen', () => {
    const status = emptyStreamCheckingStatus(PAST_HARD_STOP, { hasAssistantReply: true });
    expect(status).not.toMatch(/stopped waiting/i);
  });

  it('never counts "Checking your Mac… (Ns)" once a reply is on screen', () => {
    expect(emptyStreamCheckingStatus(MID_WAIT, { hasAssistantReply: true }))
      .not.toMatch(/checking your mac/i);
    expect(emptyStreamBannerHint(MID_WAIT, { hasAssistantReply: true }))
      .not.toMatch(/checking your mac/i);
  });

  it('returns empty status when resolved, so the banner renders nothing', () => {
    expect(emptyStreamCheckingStatus(MID_WAIT, { hasAssistantReply: true })).toBe('');
    expect(emptyStreamBannerHint(PAST_HARD_STOP, { hasAssistantReply: true })).toBe('');
  });

  it('keeps every existing message intact when no reply has arrived', () => {
    // Regression guard: the fix must not alter the genuine no-reply path.
    expect(emptyStreamCheckingStatus(5_000, { hasAssistantReply: false }))
      .toMatch(/working on your computer/i);
    expect(emptyStreamCheckingStatus(MID_WAIT, { hasAssistantReply: false }))
      .toMatch(/checking your mac/i);
    expect(emptyStreamCheckingStatus(PAST_HARD_STOP, { hasAssistantReply: false }))
      .toMatch(/stopped waiting/i);
    expect(emptyStreamBannerHint(5_000, { hasAssistantReply: false }))
      .toMatch(/still waiting for reply text/i);
    expect(emptyStreamBannerHint(PAST_HARD_STOP, { hasAssistantReply: false }))
      .toMatch(/stopped waiting/i);
  });

  it('is unchanged for callers that pass no options at all', () => {
    expect(emptyStreamCheckingStatus(5_000)).toMatch(/working on your computer/i);
    expect(emptyStreamCheckingStatus(MID_WAIT)).toMatch(/checking your mac/i);
    expect(emptyStreamCheckingStatus(PAST_HARD_STOP)).toMatch(/stopped waiting/i);
    expect(emptyStreamBannerHint(MID_WAIT)).toMatch(/checking your mac/i);
  });

  it('treats the boundary exactly at the ceiling as still-stopped without a reply', () => {
    expect(shouldHardStopEmptyStreamWait(EMPTY_STREAM_HARD_STOP_MS, { hasAssistantReply: false })).toBe(true);
    expect(shouldHardStopEmptyStreamWait(EMPTY_STREAM_HARD_STOP_MS - 1, { hasAssistantReply: false })).toBe(false);
  });
});
