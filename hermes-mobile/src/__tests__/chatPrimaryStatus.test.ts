import {
  isCloudPairPrimaryJargon,
  resolvePrimaryConnectionStatus,
  shouldLoadGatewayToolsCatalog,
  shouldReceiveLiveApprovals,
} from '../utils/chatPrimaryStatus';

describe('resolvePrimaryConnectionStatus — quality matrix', () => {
  const base = {
    connectionMode: 'relay' as const,
    isPaired: false,
    macHttpOk: false,
    hasSavedComputer: true,
    connectionState: 'disconnected' as const,
  };

  it('Connected when Mac HTTP is up even if cloud unpaired', () => {
    const r = resolvePrimaryConnectionStatus({
      ...base,
      macHttpOk: true,
      connectionState: 'connected',
    });
    expect(r).toMatchObject({
      kind: 'connected',
      label: 'Connected',
      chatReachable: true,
    });
    expect(r.secondaryHint).toMatch(/pair in Settings/i);
    expect(isCloudPairPrimaryJargon(r.label)).toBe(false);
  });

  it('NEVER leads with cloud pair jargon when a saved computer is unreachable', () => {
    const r = resolvePrimaryConnectionStatus({
      ...base,
      cloudUnpairedLabel: 'Cloud approvals are not paired',
      computerUnreachableLabel: "Can't reach Igors-Mac-mini",
    });
    expect(r.kind).toBe('computer_unreachable');
    expect(r.label).toBe("Can't reach Igors-Mac-mini");
    expect(r.chatReachable).toBe(false);
    expect(isCloudPairPrimaryJargon(r.label)).toBe(false);
    expect(r.secondaryHint).toMatch(/approval cards/i);
  });

  it('first-run without saved computer may surface cloud pair CTA', () => {
    const r = resolvePrimaryConnectionStatus({
      ...base,
      hasSavedComputer: false,
      cloudUnpairedLabel: 'Cloud approvals are not paired',
    });
    expect(r.kind).toBe('cloud_pair_required');
    expect(r.label).toBe('Cloud approvals are not paired');
    expect(r.chatReachable).toBe(false);
  });

  it('gateway mode with Mac down is computer unreachable (not cloud pair)', () => {
    const r = resolvePrimaryConnectionStatus({
      connectionMode: 'gateway',
      isPaired: false,
      macHttpOk: false,
      hasSavedComputer: true,
      connectionState: 'disconnected',
      computerUnreachableLabel: "Can't reach your computer",
    });
    expect(r.kind).toBe('computer_unreachable');
    expect(isCloudPairPrimaryJargon(r.label)).toBe(false);
  });

  it('auth mismatch wins over every other status', () => {
    const r = resolvePrimaryConnectionStatus({
      ...base,
      macHttpOk: true,
      authMismatch: true,
      connectionState: 'connected',
    });
    expect(r.kind).toBe('auth_repair');
    expect(r.chatReachable).toBe(false);
  });

  it('connecting only when not needsPair-class and Mac still down', () => {
    const r = resolvePrimaryConnectionStatus({
      connectionMode: 'gateway',
      isPaired: true,
      macHttpOk: false,
      hasSavedComputer: true,
      connectionState: 'connecting',
    });
    expect(r.kind).toBe('connecting');
    expect(r.label).toBe('Connecting');
  });

  it('demo is always chat-reachable for catalog/smoke', () => {
    expect(
      resolvePrimaryConnectionStatus({
        ...base,
        connectionState: 'demo',
        macHttpOk: false,
      }),
    ).toMatchObject({ kind: 'demo', chatReachable: true });
  });
});

describe('catalog + approvals gates', () => {
  it('Tools skills/toolsets load only when Mac HTTP OK or demo', () => {
    expect(shouldLoadGatewayToolsCatalog({ macHttpOk: true, isDemo: false })).toBe(
      true,
    );
    expect(shouldLoadGatewayToolsCatalog({ macHttpOk: false, isDemo: true })).toBe(
      true,
    );
    expect(shouldLoadGatewayToolsCatalog({ macHttpOk: false, isDemo: false })).toBe(
      false,
    );
  });

  it('live Leash approvals require Mac HTTP or paired relay', () => {
    expect(
      shouldReceiveLiveApprovals({
        macHttpOk: true,
        isPaired: false,
        connectionMode: 'relay',
        isDemo: false,
      }),
    ).toBe(true);
    expect(
      shouldReceiveLiveApprovals({
        macHttpOk: false,
        isPaired: true,
        connectionMode: 'relay',
        isDemo: false,
      }),
    ).toBe(true);
    expect(
      shouldReceiveLiveApprovals({
        macHttpOk: false,
        isPaired: false,
        connectionMode: 'relay',
        isDemo: false,
      }),
    ).toBe(false);
    expect(
      shouldReceiveLiveApprovals({
        macHttpOk: false,
        isPaired: false,
        connectionMode: 'gateway',
        isDemo: false,
      }),
    ).toBe(false);
  });
});

describe('isCloudPairPrimaryJargon', () => {
  it.each([
    ['Cloud approvals are not paired', true],
    ['Pair to receive approval requests anywhere', true],
    ['Waiting for approval pairing…', true],
    ["Can't reach Igors-Mac-mini", false],
    ['Connected', false],
    ['Not connected', false],
  ])('%s → %s', (label, expected) => {
    expect(isCloudPairPrimaryJargon(label)).toBe(expected);
  });
});
