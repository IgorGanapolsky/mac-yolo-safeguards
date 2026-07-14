import {
  connectionCopyFromPrediction,
  offlineIntentModel,
  rankReachabilityRoutes,
  reachabilityModel,
} from '../utils/onDeviceDecisionLayer';

describe('onDeviceDecisionLayer', () => {
  it('ranks a live USB route above Tailscale and dead routes', () => {
    const ranked = rankReachabilityRoutes([
      { id: 'dead', transport: 'usb', reachable: false },
      { id: 'tail', transport: 'tailscale', reachable: true, authenticated: true },
      { id: 'cable', transport: 'usb', reachable: true, authenticated: true },
    ]);

    expect(ranked.map((route) => route.id)).toEqual(['cable', 'tail', 'dead']);
    expect(ranked[0]).toMatchObject({ score: 100, state: 'ready' });
    expect(ranked[2]).toMatchObject({ score: 0, state: 'dead' });
  });

  it('caps a reachable route with a bad key below healthy routes', () => {
    const prediction = reachabilityModel.predict({
      id: 'wrong-key',
      transport: 'usb',
      reachable: true,
      authenticated: false,
    });
    expect(prediction).toMatchObject({ score: 34, state: 'repair_auth' });
  });

  it('classifies exact approval phrases locally but fails closed without a pending item', () => {
    expect(
      offlineIntentModel.predict({ text: 'Approve it', hasPendingApproval: true }),
    ).toMatchObject({
      intent: 'approve',
      canExecuteLocally: true,
      next: 'resolve_pending',
    });
    expect(
      offlineIntentModel.predict({ text: 'go ahead', hasPendingApproval: false }),
    ).toMatchObject({
      intent: 'approve',
      canExecuteLocally: false,
      next: 'show_no_pending_approval',
    });
  });

  it('does not mistake normal chat containing approval words for an approval', () => {
    expect(
      offlineIntentModel.predict({
        text: 'Can you explain what approve means here?',
        hasPendingApproval: true,
      }),
    ).toMatchObject({ intent: 'chat', canExecuteLocally: false, next: 'queue_chat' });
  });

  it('turns scores into human copy without gateway or LAN jargon', () => {
    const copy = connectionCopyFromPrediction(
      reachabilityModel.predict({ id: 'tail', transport: 'tailscale', reachable: true }),
      'Studio Mac',
    );
    expect(copy.title).toBe('Connected to Studio Mac');
    expect(copy.detail).toContain('Works away from home');
    expect(`${copy.title} ${copy.detail}`.toLowerCase()).not.toMatch(/gateway|\blan\b/);
  });
});
