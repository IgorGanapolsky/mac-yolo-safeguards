import {
  SUBNET_PROBE_TIMEOUT_MS,
  SUBNET_BATCH_SIZE,
} from '../services/gatewayDiscovery';

/**
 * Measured from Igor's phone on his own LAN, 2026-07-30 (curl to the Mac's
 * pair server, the exact endpoint the sweep probes):
 *   192.168.68.60 -> 0.178s
 *   192.168.68.70 -> 0.383s
 * The old 400ms budget left 17ms of headroom, so a reachable Mac was dropped
 * whenever anything jittered — "Find computers" reached ~94% and found nothing
 * while a direct curl from the same phone returned 200.
 */
const MEASURED_SLOWEST_LAN_RESPONDER_MS = 383;

describe('LAN discovery probe budget', () => {
  it('leaves real headroom over the slowest measured responder', () => {
    // Only ~67ms of headroom is achievable: SUBNET_BATCH_SIZE is pinned at 4
    // (8 concurrent) by the iPad WatchdogTermination contract, so 254 hosts
    // take 64 sequential batches and the 30s sweep budget caps any per-probe
    // timeout at ~468ms. 450ms is the most this design can give.
    // A real margin needs an early exit on first match or a two-pass sweep
    // (fast pass, then re-probe only non-responders) - tracked separately.
    expect(SUBNET_PROBE_TIMEOUT_MS).toBeGreaterThan(MEASURED_SLOWEST_LAN_RESPONDER_MS);
  });

  it('keeps a full sweep bounded despite the larger per-probe ceiling', () => {
    // 254 subnet hosts walked SUBNET_BATCH_SIZE at a time; batches are awaited
    // sequentially, so this is the worst case when every host times out.
    const worstCaseMs = Math.ceil(254 / SUBNET_BATCH_SIZE) * SUBNET_PROBE_TIMEOUT_MS;
    expect(worstCaseMs).toBeLessThanOrEqual(90_000);
  });
});
