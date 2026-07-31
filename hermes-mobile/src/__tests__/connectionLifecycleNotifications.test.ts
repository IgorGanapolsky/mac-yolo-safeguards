import {
  CONNECTION_EVENT_MIN_INTERVAL_MS,
  connectionEventFromReachability,
  connectionEventNotificationBody,
  connectionEventNotificationId,
  connectionEventNotificationTitle,
  shouldEmitConnectionLifecycleEvent,
} from '../utils/connectionLifecycleNotifications';

describe('connectionLifecycleNotifications', () => {
  it('writes Uber-style glance titles and bodies', () => {
    expect(
      connectionEventNotificationTitle({ event: 'lost', machineLabel: 'Mac mini' }),
    ).toBe("Can't reach Mac mini");
    expect(
      connectionEventNotificationBody({ event: 'lost', tailscaleOff: true }),
    ).toContain('Tailscale');
    expect(
      connectionEventNotificationTitle({ event: 'restored', machineLabel: 'Mac mini' }),
    ).toBe('Mac mini is back');
    expect(
      connectionEventNotificationBody({ event: 'connected', transport: 'Home Wi‑Fi' }),
    ).toContain('Home Wi‑Fi');
  });

  it('uses sticky ids for discovery vs status', () => {
    expect(connectionEventNotificationId('searching')).toBe('hermes-connection-discovery');
    expect(connectionEventNotificationId('found')).toBe('hermes-connection-discovery');
    expect(connectionEventNotificationId('lost')).toBe('hermes-connection-status');
    expect(connectionEventNotificationId('restored')).toBe('hermes-connection-status');
  });

  it('maps reachability flips without notifying on first sample', () => {
    expect(
      connectionEventFromReachability({ wasReachable: null, isReachable: true }),
    ).toBe('connected');
    expect(
      connectionEventFromReachability({ wasReachable: null, isReachable: false }),
    ).toBeNull();
    expect(
      connectionEventFromReachability({ wasReachable: true, isReachable: false }),
    ).toBe('lost');
    expect(
      connectionEventFromReachability({ wasReachable: false, isReachable: true }),
    ).toBe('restored');
    expect(
      connectionEventFromReachability({ wasReachable: true, isReachable: true }),
    ).toBeNull();
  });

  it('rate-limits and suppresses restored without a prior lost', () => {
    expect(
      shouldEmitConnectionLifecycleEvent({
        previous: 'connected',
        next: 'connected',
        nowMs: 10_000,
        lastEmittedAtMs: 0,
        lastEmittedEvent: null,
      }),
    ).toBe(false);

    expect(
      shouldEmitConnectionLifecycleEvent({
        previous: 'connected',
        next: 'restored',
        nowMs: 10_000,
        lastEmittedAtMs: 0,
        lastEmittedEvent: 'connected',
      }),
    ).toBe(false);

    expect(
      shouldEmitConnectionLifecycleEvent({
        previous: 'lost',
        next: 'restored',
        nowMs: 10_000,
        lastEmittedAtMs: 0,
        lastEmittedEvent: 'lost',
      }),
    ).toBe(true);

    expect(CONNECTION_EVENT_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
  });
});
