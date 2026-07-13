import {
  classifyMegaSession,
  formatMegaSessionTokenCount,
  isMegaSession,
  megaSessionBannerCopy,
  megaSessionSendBlockedCopy,
  MEGA_SESSION_TOKEN_BLOCK,
  MEGA_SESSION_TOKEN_WARN,
  sessionTotalTokens,
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

  it('classifies warn and block thresholds', () => {
    expect(classifyMegaSession({ input_tokens: 300_000 })).toBe('normal');
    expect(classifyMegaSession({ input_tokens: 397_152 })).toBe('warn');
    expect(classifyMegaSession({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe('warn');
    expect(classifyMegaSession({ input_tokens: MEGA_SESSION_TOKEN_BLOCK })).toBe('block');
    expect(isMegaSession({ input_tokens: MEGA_SESSION_TOKEN_WARN })).toBe(true);
    expect(MEGA_SESSION_TOKEN_WARN).toBe(350_000);
  });

  it('formats large counts for banners', () => {
    expect(formatMegaSessionTokenCount(4_927_413)).toBe('4.9M');
    expect(megaSessionBannerCopy(4_927_413)).toContain('4.9M tokens');
    expect(megaSessionSendBlockedCopy(4_927_413)).toContain('Start a fresh chat');
  });
});
