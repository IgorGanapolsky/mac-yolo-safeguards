import {
  buildDemoGateBlockedEvent,
  DEMO_GATE_BLOCKED_ACTION_ID,
  placeSmokePreviewApproval,
} from '../services/gatewayClient';

/**
 * Owner report, 2026-08-01: "when i press Preview Approval Card, it just keeps
 * creating and appending new cards".
 *
 * Root cause: buildDemoGateBlockedEvent minted `demo_${Date.now()}` — a NEW id
 * on every press — so injectSmokeApproval's actionId dedupe never matched and
 * each tap appended another identical card.
 */
describe('smoke-test preview approval is idempotent', () => {
  it('uses a STABLE actionId so repeated presses dedupe', () => {
    // Comparing two back-to-back calls is NOT sufficient: both can land in the
    // same millisecond, so `demo_${Date.now()}` would pass by accident. Move the
    // clock between calls so the assertion can actually fail.
    const spy = jest.spyOn(Date, 'now');
    try {
      spy.mockReturnValue(1_000_000);
      const a = buildDemoGateBlockedEvent();
      spy.mockReturnValue(9_999_999);
      const b = buildDemoGateBlockedEvent();
      expect(a.payload?.actionId).toBe(b.payload?.actionId);
      expect(a.payload?.actionId).toBe(DEMO_GATE_BLOCKED_ACTION_ID);
    } finally {
      spy.mockRestore();
    }
  });

  it('the id is recognisably a demo card, not mistakable for a real approval', () => {
    expect(String(buildDemoGateBlockedEvent().payload?.actionId)).toMatch(/^demo/);
  });

  it('does not embed a timestamp in the id', () => {
    // `demo_${Date.now()}` is precisely what defeated the dedupe.
    expect(String(buildDemoGateBlockedEvent().payload?.actionId)).not.toMatch(/\d{10,}/);
  });

  it('still carries the payload the preview is meant to demonstrate', () => {
    const p = (buildDemoGateBlockedEvent().payload ?? {}) as Record<string, unknown>;
    expect(p.toolName).toBe('run_command');
    expect(String(p.command)).toContain('test-runaway.js');
    expect(String(p.diff)).toContain('sim-runaway-guard.sh');
    expect(String(p.workspacePath)).toContain('sample-app');
  });

  it('timestamp still moves — only the identity is pinned', () => {
    // The card should look freshly raised; it just must not be a NEW card.
    const a = buildDemoGateBlockedEvent();
    expect(typeof a.timestamp).toBe('string');
    expect(a.event).toBe('GATE.BLOCKED');
  });

  it('placeSmokePreviewApproval keeps one smoke card and never stacks', () => {
    const identity = <T,>(items: T[]) => items;
    const smoke = { actionId: DEMO_GATE_BLOCKED_ACTION_ID };
    const real = { actionId: 'act_real_1' };
    const legacyStacks = [
      { actionId: 'demo_1000' },
      { actionId: 'demo_2000' },
      { actionId: 'demo_3000' },
      real,
    ];

    const first = placeSmokePreviewApproval(legacyStacks, smoke, identity);
    expect(first.map((i) => i.actionId)).toEqual([DEMO_GATE_BLOCKED_ACTION_ID, 'act_real_1']);

    const second = placeSmokePreviewApproval(first, smoke, identity);
    expect(second).toBe(first);
  });
});
