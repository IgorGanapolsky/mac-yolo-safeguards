import type { GatewayHealthSnapshot } from '../types/gateway';
import {
  connectManualGatewayAddress,
  MANUAL_PROBE_TIMEOUT_MS,
  TAILSCALE_MANUAL_PROBE_TIMEOUT_MS,
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
    rememberTailnetProbeHost: jest.fn().mockResolvedValue(undefined),
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
    ).rejects.toThrow('Couldn’t reach Hermes at this Tailscale address.');
    expect(persistProfile).not.toHaveBeenCalled();
    expect(deps.saveApiKey).not.toHaveBeenCalled();
    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(
      gatewayUrl,
      null,
      TAILSCALE_MANUAL_PROBE_TIMEOUT_MS,
    );
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
    ).rejects.toThrow('Hermes is reachable, but this phone still needs to pair.');
    expect(persistProfile).not.toHaveBeenCalled();
  });

  it('remembers a reachable-but-unpaired Tailscale address as a probe host so Find computers can rediscover it', async () => {
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
    ).rejects.toThrow('Hermes is reachable, but this phone still needs to pair.');
    expect(deps.rememberTailnetProbeHost).toHaveBeenCalledWith(gatewayUrl);
  });

  it('does not remember a reachable-but-unpaired LAN address as a Tailscale probe host', async () => {
    const persistProfile = jest.fn();
    const deps = dependencies({
      fetchGatewayHealth: jest.fn().mockResolvedValue(
        health({ level: 'red', directGatewayReachable: false, authMismatch: true }),
      ),
    });

    await expect(
      connectManualGatewayAddress(
        {
          gatewayUrl: 'http://192.168.68.60:8642',
          fallbackLabel: 'Home network computer',
          persistProfile,
        },
        deps,
      ),
    ).rejects.toThrow('Hermes is reachable, but this phone still needs to pair.');
    expect(deps.rememberTailnetProbeHost).not.toHaveBeenCalled();
  });

  it('still throws the pairing error even if remembering the probe host fails', async () => {
    const persistProfile = jest.fn();
    const deps = dependencies({
      fetchGatewayHealth: jest.fn().mockResolvedValue(
        health({ level: 'red', directGatewayReachable: false, authMismatch: true }),
      ),
      rememberTailnetProbeHost: jest.fn().mockRejectedValue(new Error('storage unavailable')),
    });

    await expect(
      connectManualGatewayAddress(
        { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
        deps,
      ),
    ).rejects.toThrow('Hermes is reachable, but this phone still needs to pair.');
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
    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(
      gatewayUrl,
      'fresh-key',
      TAILSCALE_MANUAL_PROBE_TIMEOUT_MS,
    );
    expect(deps.saveApiKey).toHaveBeenCalledWith('fresh-key');
    expect(persistProfile).toHaveBeenCalledWith(
      'Igors-MacBook-Pro',
      gatewayUrl,
      'fresh-key',
    );
  });

  it('fetches fresh pair-server setup immediately before the one-time exchange', async () => {
    const persistProfile = jest.fn().mockResolvedValue(undefined);
    const resolvePairServerSetupParams = jest.fn().mockRejectedValue(
      new Error('unleased resolver must not run'),
    );
    const withFreshPairServerSetup = jest.fn(async (_host, consume) =>
      consume({
        pairingCode: 'LEASED-CODE',
        pairServerUrl: 'http://100.70.124.54:8765',
      }),
    );
    const deps = dependencies({
      resolvePairServerSetupParams,
      withFreshPairServerSetup,
      exchangePairingCode: jest.fn().mockResolvedValue({
        apiKey: 'leased-key',
        macName: 'Leased-Mac',
      }),
    });

    await connectManualGatewayAddress(
      { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
      deps,
    );

    expect(withFreshPairServerSetup).toHaveBeenCalledTimes(1);
    expect(resolvePairServerSetupParams).not.toHaveBeenCalled();
    expect(deps.exchangePairingCode).toHaveBeenCalledWith(
      'http://100.70.124.54:8765',
      'LEASED-CODE',
    );
    expect(persistProfile).toHaveBeenCalledWith(
      'Leased-Mac',
      gatewayUrl,
      'leased-key',
    );
  });

  it('refetches and retries when concurrent discovery invalidates the first one-time code', async () => {
    const persistProfile = jest.fn().mockResolvedValue(undefined);
    const resolvePairServerSetupParams = jest
      .fn()
      .mockResolvedValueOnce({
        pairingCode: 'INVALIDATED-BY-DISCOVERY',
        pairServerUrl: 'http://100.70.124.54:8765',
      })
      .mockResolvedValueOnce({
        pairingCode: 'FRESH-RETRY',
        pairServerUrl: 'http://100.70.124.54:8765',
      });
    const exchangePairingCode = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        apiKey: 'fresh-retry-key',
        macName: 'Paired-Mac',
      });
    const deps = dependencies({
      resolvePairServerSetupParams,
      exchangePairingCode,
    });

    await connectManualGatewayAddress(
      { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
      deps,
    );

    expect(resolvePairServerSetupParams).toHaveBeenCalledTimes(2);
    expect(exchangePairingCode).toHaveBeenNthCalledWith(
      1,
      'http://100.70.124.54:8765',
      'INVALIDATED-BY-DISCOVERY',
    );
    expect(exchangePairingCode).toHaveBeenNthCalledWith(
      2,
      'http://100.70.124.54:8765',
      'FRESH-RETRY',
    );
    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(
      gatewayUrl,
      'fresh-retry-key',
      TAILSCALE_MANUAL_PROBE_TIMEOUT_MS,
    );
    expect(deps.saveApiKey).toHaveBeenCalledWith('fresh-retry-key');
    expect(persistProfile).toHaveBeenCalledWith(
      'Paired-Mac',
      gatewayUrl,
      'fresh-retry-key',
    );
  });

  it('allows a home-network auth probe to survive an in-flight subnet scan', async () => {
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
      MANUAL_PROBE_TIMEOUT_MS,
    );
    expect(persistProfile).toHaveBeenCalledWith(
      'Home network computer',
      'http://192.168.68.60:8642',
      null,
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
