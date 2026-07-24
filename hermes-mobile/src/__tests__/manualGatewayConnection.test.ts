import type { GatewayHealthSnapshot } from '../types/gateway';
import {
  connectManualGatewayAddress,
  type ManualGatewayConnectionDependencies,
} from '../services/manualGatewayConnection';

function health(overrides: Partial<GatewayHealthSnapshot> = {}): GatewayHealthSnapshot {
  return {
    level: 'green',
    checkedAt: '2026-07-19T00:00:00.000Z',
    directGatewayReachable: true,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<ManualGatewayConnectionDependencies> = {},
): ManualGatewayConnectionDependencies {
  return {
    loadApiKey: jest.fn().mockResolvedValue(null),
    saveApiKey: jest.fn().mockResolvedValue(undefined),
    clearApiKey: jest.fn().mockResolvedValue(undefined),
    resolvePairServerSetupParams: jest.fn().mockResolvedValue(null),
    exchangePairingCode: jest.fn().mockResolvedValue(null),
    fetchGatewayHealth: jest.fn().mockResolvedValue(health()),
    ...overrides,
  };
}

const gatewayUrl = 'http://100.70.124.54:8642';

describe('connectManualGatewayAddress', () => {
  it('does not persist an unreachable address', async () => {
    const persistProfile = jest.fn();
    const deps = dependencies({
      fetchGatewayHealth: jest.fn().mockResolvedValue(
        health({ level: 'red', directGatewayReachable: false }),
      ),
    });

    await expect(
      connectManualGatewayAddress(
        { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
        deps,
      ),
    ).rejects.toThrow('Couldn’t reach ThumbGate at this Tailscale address.');
    expect(persistProfile).not.toHaveBeenCalled();
    expect(deps.saveApiKey).not.toHaveBeenCalled();
    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(gatewayUrl, null, 12_000);
  });

  it('does not persist a reachable address that is not paired', async () => {
    const persistProfile = jest.fn();
    const deps = dependencies({
      fetchGatewayHealth: jest.fn().mockResolvedValue(
        health({ level: 'red', directGatewayReachable: false, authMismatch: true }),
      ),
    });

    await expect(
      connectManualGatewayAddress(
        { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
        deps,
      ),
    ).rejects.toThrow('ThumbGate is reachable at this Tailscale address.');
    expect(persistProfile).not.toHaveBeenCalled();
  });

  it('exchanges pair-server credentials, authenticates, and saves the verified computer name', async () => {
    const persistProfile = jest.fn().mockResolvedValue(undefined);
    const deps = dependencies({
      resolvePairServerSetupParams: jest.fn().mockResolvedValue({
        pairingCode: 'AB23CD45',
        pairServerUrl: 'http://100.70.124.54:8765',
        macName: 'Fallback-Mac',
      }),
      exchangePairingCode: jest.fn().mockResolvedValue({
        apiKey: 'fresh-key',
        macName: 'Paired-Mac',
      }),
      fetchGatewayHealth: jest.fn().mockResolvedValue(
        health({ hostname: 'Igors-MacBook-Pro.local' }),
      ),
    });

    await connectManualGatewayAddress(
      { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
      deps,
    );

    expect(deps.exchangePairingCode).toHaveBeenCalledWith(
      'http://100.70.124.54:8765',
      'AB23CD45',
    );
    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(gatewayUrl, 'fresh-key', 12_000);
    expect(deps.saveApiKey).toHaveBeenCalledWith('fresh-key');
    expect(persistProfile).toHaveBeenCalledWith('Igors-MacBook-Pro', gatewayUrl);
  });

  it('keeps the short probe window for a home-network address', async () => {
    const persistProfile = jest.fn().mockResolvedValue(undefined);
    const deps = dependencies();

    await connectManualGatewayAddress(
      {
        gatewayUrl: 'http://192.168.68.60:8642',
        fallbackLabel: 'Home network computer',
        persistProfile,
      },
      deps,
    );

    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(
      'http://192.168.68.60:8642',
      null,
      5000,
    );
  });

  it('restores the previous credential if profile persistence fails', async () => {
    const persistProfile = jest.fn().mockRejectedValue(new Error('storage failed'));
    const deps = dependencies({
      loadApiKey: jest.fn().mockResolvedValue('previous-key'),
      resolvePairServerSetupParams: jest.fn().mockResolvedValue({ apiKey: 'fresh-key' }),
    });

    await expect(
      connectManualGatewayAddress(
        { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
        deps,
      ),
    ).rejects.toThrow('storage failed');
    expect(deps.saveApiKey).toHaveBeenNthCalledWith(1, 'fresh-key');
    expect(deps.saveApiKey).toHaveBeenNthCalledWith(2, 'previous-key');
  });

  it('clears a fresh credential if first-time profile persistence fails', async () => {
    const persistProfile = jest.fn().mockRejectedValue(new Error('storage failed'));
    const deps = dependencies({
      resolvePairServerSetupParams: jest.fn().mockResolvedValue({ apiKey: 'fresh-key' }),
    });

    await expect(
      connectManualGatewayAddress(
        { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
        deps,
      ),
    ).rejects.toThrow('storage failed');
    expect(deps.saveApiKey).toHaveBeenCalledWith('fresh-key');
    expect(deps.clearApiKey).toHaveBeenCalledTimes(1);
  });
});
