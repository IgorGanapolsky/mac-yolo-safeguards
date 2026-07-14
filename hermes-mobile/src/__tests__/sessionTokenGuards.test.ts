import {
  classifyMegaSession,
  formatMegaSessionTokenCount,
  isMegaSession,
  isMegaSessionSendBlocked,
  megaSessionBannerCopy,
  megaSessionForceFreshSelectCopy,
  megaSessionRecentsBadge,
  megaSessionSendBlockedCopy,
  MEGA_SESSION_TOKEN_BLOCK,
  MEGA_SESSION_TOKEN_WARN,
  sessionTotalTokens,
  shouldAllowMegaSessionSend,
  shouldAutoFreshAndResendOnMegaBlock,
  shouldForceFreshOnSessionSelect,
} from '../utils/sessionTokenGuards';

describe('sessionTokenGuards', () => {
  it('sums session token fields', () => {
    expect(
      sessionTotalTokens({
        input_tokens: 4_635_761,
        output_tokens: 291_652,
        cache_read_tokens: 100_238_020,
      }),
    ).toBe(105_165_433);
  });

  it('classifies warn and hard-block thresholds for mobile UX', () => {
    expect(classifyMegaSession({ input_tokens: 300_000 })).toBe('normal');
    expect(classifyMegaSession({ input_tokens: 397_152 })).toBe('warn');
    expect(classifyMegaSession({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe('warn');
    expect(classifyMegaSession({ input_tokens: 799_999 })).toBe('warn');
    expect(classifyMegaSession({ input_tokens: MEGA_SESSION_TOKEN_BLOCK })).toBe('block');
    expect(classifyMegaSession({ input_tokens: 1_700_000 })).toBe('block');
    expect(isMegaSession({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe(true);
    expect(isMegaSessionSendBlocked({ input_tokens: 1_700_000 })).toBe(true);
    expect(isMegaSessionSendBlocked({ input_tokens: 400_000 })).toBe(false);
    expect(MEGA_SESSION_TOKEN_WARN).toBe(350_000);
    expect(MEGA_SESSION_TOKEN_BLOCK).toBe(800_000);
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

  it('badges recents and forces fresh reopen on BLOCK sessions', () => {
    expect(megaSessionRecentsBadge({ input_tokens: 100_000 })).toBeNull();
    expect(megaSessionRecentsBadge({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe('Large');
    expect(megaSessionRecentsBadge({ input_tokens: MEGA_SESSION_TOKEN_BLOCK })).toBe('Too large');
    expect(shouldForceFreshOnSessionSelect({ input_tokens: 400_000 })).toBe(false);
    expect(shouldForceFreshOnSessionSelect({ input_tokens: 1_700_000 })).toBe(true);
    expect(megaSessionForceFreshSelectCopy(1_700_000)).toContain('Start a fresh chat');
  });

  it('formats large counts for banners', () => {
    expect(formatMegaSessionTokenCount(4_927_413)).toBe('4.9M');
    expect(megaSessionBannerCopy(4_927_413)).toContain('4.9M tokens');
    expect(megaSessionSendBlockedCopy(4_927_413)).toContain('Start a fresh chat');
  });
});
