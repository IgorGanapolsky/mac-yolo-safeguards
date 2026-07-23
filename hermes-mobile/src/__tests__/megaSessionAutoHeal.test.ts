import {
  MEGA_SESSION_OPTIMIZING_COPY,
  megaSessionAutoHealStatusCopy,
  megaSessionOptimizingCopy,
  selectRecentTurnsForDisplay,
  shouldAutoHealMegaSession,
  shouldKeepLocalHistoryAfterAutoHeal,
  shouldPreferAutoHealOverFreshNag,
  shouldShowStartFreshNagAsPrimary,
  shouldTriggerMegaAutoHeal,
} from '../utils/megaSessionAutoHeal';
import type { HermesMessage } from '../types/chat';

describe('megaSessionAutoHeal', () => {
  it('prefers silent auto-heal over Start-fresh homework nag as primary path', () => {
    expect(shouldPreferAutoHealOverFreshNag()).toBe(true);
    expect(shouldShowStartFreshNagAsPrimary()).toBe(false);
    expect(megaSessionOptimizingCopy()).toBe(MEGA_SESSION_OPTIMIZING_COPY);
    expect(MEGA_SESSION_OPTIMIZING_COPY).toMatch(/Optimizing conversation/i);
    expect(MEGA_SESSION_OPTIMIZING_COPY).not.toMatch(/Start fresh/i);
  });

  it('auto-heals warn and block mega sessions', () => {
    expect(shouldAutoHealMegaSession('normal')).toBe(false);
    expect(shouldAutoHealMegaSession('warn')).toBe(true);
    expect(shouldAutoHealMegaSession('block')).toBe(true);
  });

  it('triggers auto-heal once per session when idle', () => {
    expect(
      shouldTriggerMegaAutoHeal({
        level: 'block',
        sessionId: 'sess-a',
        alreadyHealedSessionId: null,
        isBusy: false,
      }),
    ).toBe(true);
    expect(
      shouldTriggerMegaAutoHeal({
        level: 'warn',
        sessionId: 'sess-a',
        alreadyHealedSessionId: 'sess-a',
        isBusy: false,
      }),
    ).toBe(false);
    expect(
      shouldTriggerMegaAutoHeal({
        level: 'block',
        sessionId: 'sess-a',
        alreadyHealedSessionId: null,
        isBusy: true,
      }),
    ).toBe(false);
    expect(
      shouldTriggerMegaAutoHeal({
        level: 'normal',
        sessionId: 'sess-a',
        alreadyHealedSessionId: null,
        isBusy: false,
      }),
    ).toBe(false);
  });

  it('status copy is calm Optimizing line, never Start-fresh CTA', () => {
    expect(megaSessionAutoHealStatusCopy(true)).toBe(MEGA_SESSION_OPTIMIZING_COPY);
    expect(megaSessionAutoHealStatusCopy(false)).toBeNull();
    expect(megaSessionAutoHealStatusCopy(true)).not.toMatch(/Start fresh/i);
  });

  it('preserves recent visible turns and never blanks history incorrectly', () => {
    const messages: HermesMessage[] = [
      { id: '1', role: 'user', content: 'first' },
      { id: '2', role: 'assistant', content: 'ok' },
      { id: '3', role: 'user', content: 'make money today' },
      { id: '4', role: 'assistant', content: 'plan' },
      { id: '5', role: 'system', content: 'noise' },
      { id: '6', role: 'assistant', content: '   ' },
    ];
    const recent = selectRecentTurnsForDisplay(messages, 3);
    expect(recent.map((m) => m.content)).toEqual(['ok', 'make money today', 'plan']);
    expect(selectRecentTurnsForDisplay([], 12)).toEqual([]);
    expect(selectRecentTurnsForDisplay(messages, 0)).toEqual([]);

    expect(
      shouldKeepLocalHistoryAfterAutoHeal({
        preserveLocalTranscript: true,
        serverMessageCount: 0,
        localRecentCount: recent.length,
      }),
    ).toBe(true);
    expect(
      shouldKeepLocalHistoryAfterAutoHeal({
        preserveLocalTranscript: true,
        serverMessageCount: 2,
        localRecentCount: recent.length,
      }),
    ).toBe(false);
    expect(
      shouldKeepLocalHistoryAfterAutoHeal({
        preserveLocalTranscript: false,
        serverMessageCount: 0,
        localRecentCount: recent.length,
      }),
    ).toBe(false);
  });
});
