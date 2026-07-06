import {
  buildLeashEmptyExplanation,
  getLeashFreeTierLearnMoreSections,
  getLeashFreeTierPaywallCopy,
  resolveInitialTab,
} from '../utils/leashUx';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import { LEASH_TAB_LABEL, THUMBGATE_LEASH_PRODUCT_NAME, THUMBGATE_PRO_SCREEN_TITLE } from '../constants/monetization';

describe('leashUx', () => {
  it('defaults to Chat tab when approval-first mode is off', () => {
    expect(resolveInitialTab(DEFAULT_GATEWAY_SETTINGS)).toBe('Chat');
  });

  it('opens Leash when approval-first or glance mode is on', () => {
    expect(resolveInitialTab({ ...DEFAULT_GATEWAY_SETTINGS, safetyMode: true })).toBe('Leash');
    expect(resolveInitialTab({ ...DEFAULT_GATEWAY_SETTINGS, glanceMode: true })).toBe('Leash');
  });

  it('opens Leash even without Pro when approval-first mode is on', () => {
    expect(
      resolveInitialTab({ ...DEFAULT_GATEWAY_SETTINGS, safetyMode: true, thumbgateProActive: false }),
    ).toBe('Leash');
  });

  it('explains chat-first empty Leash when approval-first mode is off', () => {
    const text = buildLeashEmptyExplanation(DEFAULT_GATEWAY_SETTINGS);
    expect(text).toContain('Hermes tab');
    expect(text).toContain('paid permission review');
  });

  it('explains approval-first empty state', () => {
    const text = buildLeashEmptyExplanation({ ...DEFAULT_GATEWAY_SETTINGS, safetyMode: true });
    expect(text).toContain('Approval-first mode is on');
    expect(text).toContain(`${LEASH_TAB_LABEL} tab opens first`);
  });

  it('returns compact paywall copy under 120 words above Subscribe', () => {
    const copy = getLeashFreeTierPaywallCopy();
    expect(copy.headline).toMatch(/kill switch/);
    expect(copy.outcome).toContain('Hermes chat stays free');
    expect(copy.bullets).toHaveLength(3);
    expect(copy.positioningLine).toContain('$19/mo');

    const aboveFold = [copy.headline, copy.outcome, ...copy.bullets, copy.positioningLine].join(' ');
    const wordCount = aboveFold.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(120);
  });

  it('returns short learn-more sections for collapsed expander', () => {
    const sections = getLeashFreeTierLearnMoreSections();
    expect(sections.map((section) => section.title)).toEqual([
      'Included controls',
      THUMBGATE_LEASH_PRODUCT_NAME,
    ]);
    expect(sections[0]?.body).toContain(THUMBGATE_PRO_SCREEN_TITLE);
    expect(sections[1]?.body).toContain('pauses risky tools');
  });
});
