import {
  classifyMegaSession,
  estimatedContextTokens,
  formatMegaSessionTokenCount,
  isMegaSession,
  isMegaSessionSendBlocked,
  megaSessionBannerCopy,
  megaSessionDisplayTokens,
  megaSessionForceFreshSelectCopy,
  megaSessionRecentsBadge,
  megaSessionSendBlockedCopy,
  MEGA_CONTEXT_TOKEN_BLOCK,
  MEGA_CONTEXT_TOKEN_WARN,
  MEGA_SESSION_TOKEN_BLOCK,
  MEGA_SESSION_TOKEN_WARN,
  sessionTotalTokens,
  shouldAllowMegaSessionSend,
  shouldAutoFreshAndResendOnMegaBlock,
  shouldForceFreshOnSessionSelect,
  shouldShowLargeChatHeaderWarning,
  shouldSuggestFreshOnSessionSelect,
} from '../utils/sessionTokenGuards';

describe('sessionTokenGuards', () => {
  it('sums lifetime session token traffic', () => {
    expect(
      sessionTotalTokens({
        input_tokens: 4_635_761,
        output_tokens: 291_652,
        cache_read_tokens: 100_238_020,
      }),
    ).toBe(105_165_433);
  });

  it('estimates current context as per-call average prompt size', () => {
    expect(
      estimatedContextTokens({ input_tokens: 1_356_736, api_call_count: 41 }),
    ).toBe(33_091);
    expect(
      estimatedContextTokens({
        input_tokens: 400_000,
        cache_read_tokens: 4_000_000,
        api_call_count: 20,
      }),
    ).toBe(220_000);
    expect(estimatedContextTokens({ input_tokens: 1_000_000 })).toBeNull();
    expect(estimatedContextTokens({ input_tokens: 1_000_000, api_call_count: 0 })).toBeNull();
    expect(estimatedContextTokens(null)).toBeNull();
  });

  it('does not flag well-used sessions with a small context', () => {
    const busyButHealthy = {
      input_tokens: 1_356_736,
      output_tokens: 30_641,
      cache_read_tokens: 0,
      api_call_count: 41,
    };
    expect(classifyMegaSession(busyButHealthy)).toBe('normal');
    expect(isMegaSession(busyButHealthy)).toBe(false);
    expect(megaSessionRecentsBadge(busyButHealthy)).toBeNull();
    expect(shouldShowLargeChatHeaderWarning(busyButHealthy)).toBe(false);
  });

  it('does not show header "chat is large" at cumulative 20k when context is healthy', () => {
    const scheduledJobShape = {
      input_tokens: 29_661,
      output_tokens: 8_067,
      api_call_count: 12,
    };
    expect(estimatedContextTokens(scheduledJobShape)).toBe(2_472);
    expect(classifyMegaSession(scheduledJobShape)).toBe('normal');
    expect(shouldShowLargeChatHeaderWarning(scheduledJobShape, 19_634)).toBe(false);
  });

  it('classifies warn and block on estimated context when api_call_count is known', () => {
    const withContext = (context: number) => ({
      input_tokens: context * 10,
      api_call_count: 10,
    });
    expect(classifyMegaSession(withContext(MEGA_CONTEXT_TOKEN_WARN - 1))).toBe('normal');
    expect(classifyMegaSession(withContext(MEGA_CONTEXT_TOKEN_WARN))).toBe('warn');
    expect(classifyMegaSession(withContext(MEGA_CONTEXT_TOKEN_BLOCK - 1))).toBe('warn');
    expect(classifyMegaSession(withContext(MEGA_CONTEXT_TOKEN_BLOCK))).toBe('block');
    expect(isMegaSessionSendBlocked(withContext(MEGA_CONTEXT_TOKEN_BLOCK))).toBe(true);
    expect(MEGA_CONTEXT_TOKEN_WARN).toBe(120_000);
    expect(MEGA_CONTEXT_TOKEN_BLOCK).toBe(200_000);
  });

  it('falls back to legacy cumulative thresholds without api_call_count', () => {
    expect(classifyMegaSession({ input_tokens: 50_000 })).toBe('normal');
    expect(classifyMegaSession({ input_tokens: 99_999 })).toBe('normal');
    expect(classifyMegaSession({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe('warn');
    expect(classifyMegaSession({ input_tokens: 397_152 })).toBe('warn');
    expect(classifyMegaSession({ input_tokens: 516_000 })).toBe('block');
    expect(classifyMegaSession({ input_tokens: MEGA_SESSION_TOKEN_BLOCK })).toBe('block');
    expect(classifyMegaSession({ input_tokens: 1_700_000 })).toBe('block');
    expect(isMegaSession({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe(true);
    expect(isMegaSessionSendBlocked({ input_tokens: 516_000 })).toBe(true);
    expect(isMegaSessionSendBlocked({ input_tokens: 400_000 })).toBe(false);
    expect(MEGA_SESSION_TOKEN_WARN).toBe(100_000);
    expect(MEGA_SESSION_TOKEN_BLOCK).toBe(500_000);
  });

  it('display tokens prefer the context estimate over lifetime traffic', () => {
    expect(
      megaSessionDisplayTokens({ input_tokens: 1_356_736, api_call_count: 41 }),
    ).toBe(33_091);
    expect(megaSessionDisplayTokens({ input_tokens: 974_489 })).toBe(974_489);
    expect(megaSessionDisplayTokens(null)).toBe(0);
  });

  it('hard-blocks Send at BLOCK and never allows send_anyway', () => {
    expect(shouldAllowMegaSessionSend('normal')).toBe(true);
    expect(shouldAllowMegaSessionSend('warn', 'send_anyway')).toBe(true);
    expect(shouldAllowMegaSessionSend('warn', 'cancel')).toBe(false);
    expect(shouldAllowMegaSessionSend('warn', 'fresh')).toBe(false);
    expect(shouldAllowMegaSessionSend('block', 'send_anyway')).toBe(false);
    expect(shouldAllowMegaSessionSend('block', 'fresh')).toBe(false);
    expect(shouldAllowMegaSessionSend('block', 'cancel')).toBe(false);
  });

  it('auto-migrates draft to a fresh chat on hard-block Send', () => {
    expect(shouldAutoFreshAndResendOnMegaBlock('normal')).toBe(false);
    expect(shouldAutoFreshAndResendOnMegaBlock('warn')).toBe(false);
    expect(shouldAutoFreshAndResendOnMegaBlock('block')).toBe(true);
  });

  it('badges recents and offers fresh (never force-blocks open) on large sessions', () => {
    expect(megaSessionRecentsBadge({ input_tokens: 50_000 })).toBeNull();
    expect(megaSessionRecentsBadge({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe('Large');
    expect(megaSessionRecentsBadge({ input_tokens: MEGA_SESSION_TOKEN_BLOCK })).toBe('Too large');
    expect(
      megaSessionRecentsBadge({
        input_tokens: MEGA_CONTEXT_TOKEN_BLOCK * 5,
        api_call_count: 5,
      }),
    ).toBe('Too large');
    // Open is never force-blocked — reconnect/remount restores for reading.
    expect(shouldForceFreshOnSessionSelect({ input_tokens: 400_000 })).toBe(false);
    expect(shouldForceFreshOnSessionSelect({ input_tokens: 516_000 })).toBe(false);
    expect(
      shouldForceFreshOnSessionSelect({ input_tokens: 1_700_000, api_call_count: 50 }),
    ).toBe(false);
    expect(shouldSuggestFreshOnSessionSelect({ input_tokens: 150_000 })).toBe(true);
    expect(shouldSuggestFreshOnSessionSelect({ input_tokens: 516_000 })).toBe(true);
    expect(megaSessionForceFreshSelectCopy(516_000)).toContain('Start a fresh chat');
  });

  it('formats large counts for banners with stronger fresh-chat CTA', () => {
    expect(formatMegaSessionTokenCount(4_927_413)).toBe('4.9M');
    expect(formatMegaSessionTokenCount(220_000)).toBe('220k');
    expect(megaSessionBannerCopy(220_000)).toContain('220k tokens');
    expect(megaSessionBannerCopy(220_000)).toContain('working context');
    expect(megaSessionSendBlockedCopy(220_000)).toContain('Start a fresh chat');
  });
});
