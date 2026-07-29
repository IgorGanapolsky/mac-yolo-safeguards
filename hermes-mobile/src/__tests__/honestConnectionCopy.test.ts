import { resolveRelayRouteDisplay } from '../utils/relayRouting';
import { deriveConnectionState, describeConnectionReason } from '../utils/connectionStateMachine';
import { isFalseUnpairedStatusCopy } from '../utils/connectionStatusContract';

/**
 * Two strings reported from a physical device:
 *   "what the fuck is outdated connection????"
 *   "Chat approvals are not paired???? What the actual fuck"
 *
 * The second one violates the PRODUCT LAW already written in connectionStatusContract.ts after the
 * 2026-07-22 rage: when the phone can reach the computer over HTTP, never surface "not paired" as
 * primary status. The law even ships a regex; it just was not applied on this path.
 */
describe('connection copy honesty', () => {
  it('never says "not paired" while the computer is directly reachable', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'connected',
      workers: [],
      activeWorkerId: null,
      fallbackMachineLabel: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      macHttpOk: true,
      heal: { attempt: 1, inFlight: false, exhausted: true },
    } as never);
    expect(display.routeStatus).toBeDefined();
    expect(isFalseUnpairedStatusCopy(String(display.routeStatus))).toBe(false);
    expect(String(display.routeStatus)).not.toMatch(/not paired/i);
  });

  it('still reports unpaired cloud approvals when the computer is NOT reachable', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'disconnected',
      workers: [],
      activeWorkerId: null,
      fallbackMachineLabel: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      macHttpOk: false,
      heal: { attempt: 1, inFlight: false, exhausted: true },
    } as never);
    // Unreachable is allowed to talk about pairing at all (either the nudge or the plain
    // "not paired" state) — the law only forbids it while the computer IS reachable.
    expect(String(display.routeStatus)).toMatch(/pair/i);
  });

  it('explains an auth rejection instead of saying "Outdated connection"', () => {
    const state = deriveConnectionState({
      usbDetected: true,
      portReachable: true,
      authOk: false,
      eventSocketConnected: false,
    } as never);
    expect(state.stage).toBe('auth_failed');
    const copy = describeConnectionReason(state.reasonCode as never);
    expect(copy).not.toMatch(/outdated/i);
    expect(copy).toMatch(/rejected/i);
    expect(copy).toMatch(/Re-pair/i);
  });
});
