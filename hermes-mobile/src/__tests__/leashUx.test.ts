import {
  buildLeashEmptyExplanation,
  resolveInitialTab,
  resolveTabOrder,
} from '../utils/leashUx';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

describe('leashUx', () => {
  it('defaults to Chat tab when approval-first mode is off', () => {
    expect(resolveInitialTab(DEFAULT_GATEWAY_SETTINGS)).toBe('Chat');
  });

  it('ALWAYS opens on Chat, even when approval-first mode is on and Pro is active', () => {
    const pro = { ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true };
    expect(resolveInitialTab({ ...pro, safetyMode: true })).toBe('Chat');
  });

  it('does NOT land on Leash when only glance mode is on, even with Leash unlocked', () => {
    const pro = { ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true };
    expect(resolveInitialTab({ ...pro, glanceMode: true })).toBe('Chat');
    expect(resolveInitialTab({ ...pro, glanceMode: true, safetyMode: false })).toBe('Chat');
  });

  it('ignores glance mode AND safety mode when deciding the landing tab — always Chat', () => {
    const pro = { ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true, safetyMode: true };
    expect(resolveInitialTab({ ...pro, glanceMode: false })).toBe('Chat');
    expect(resolveInitialTab({ ...pro, glanceMode: true })).toBe('Chat');
  });

  it('stays on Chat when both approval-first and glance mode are off', () => {
    const pro = { ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true };
    expect(resolveInitialTab({ ...pro, safetyMode: false, glanceMode: false })).toBe('Chat');
  });

  it('stays on Chat when approval-first mode is on but Pro is inactive', () => {
    expect(
      resolveInitialTab({ ...DEFAULT_GATEWAY_SETTINGS, safetyMode: true, thumbgateProActive: false }),
    ).toBe('Chat');
  });

  it('explains chat-first empty Leash when approval-first mode is off', () => {
    const text = buildLeashEmptyExplanation(DEFAULT_GATEWAY_SETTINGS);
    expect(text).toContain('Chat tab');
    expect(text).toContain('approvals.mode');
  });

  it('explains approval-first empty state without claiming Leash opens first', () => {
    const text = buildLeashEmptyExplanation({ ...DEFAULT_GATEWAY_SETTINGS, safetyMode: true });
    expect(text).toContain('Approval-first mode is on');
    expect(text).toContain('Hermes still opens on launch');
    expect(text).not.toContain('Leash opens first');
  });

  it('does not claim Leash opens first when only glance mode is on', () => {
    const text = buildLeashEmptyExplanation({ ...DEFAULT_GATEWAY_SETTINGS, glanceMode: true });
    expect(text).not.toContain('Leash opens first');
    expect(text).toContain('Chat tab');
  });

  describe('resolveTabOrder', () => {
    it('puts Chat first in default mode', () => {
      expect(resolveTabOrder(DEFAULT_GATEWAY_SETTINGS)).toEqual(['Chat', 'Leash', 'Settings']);
    });

    it('does NOT reshuffle the tab bar when glance mode is toggled — order stays stable', () => {
      const off = resolveTabOrder({ ...DEFAULT_GATEWAY_SETTINGS, glanceMode: false });
      const on = resolveTabOrder({ ...DEFAULT_GATEWAY_SETTINGS, glanceMode: true });
      expect(on).toEqual(off);
      expect(on).toEqual(['Chat', 'Leash', 'Settings']);
      expect(on[0]).toBe('Chat');
    });

    it('keeps Chat first across every settings permutation (never dropped, never reordered)', () => {
      for (const glanceMode of [true, false]) {
        for (const safetyMode of [true, false]) {
          for (const thumbgateProActive of [true, false]) {
            const order = resolveTabOrder({
              ...DEFAULT_GATEWAY_SETTINGS,
              glanceMode,
              safetyMode,
              thumbgateProActive,
            });
            expect(order).toEqual(['Chat', 'Leash', 'Settings']);
          }
        }
      }
    });
  });
});
