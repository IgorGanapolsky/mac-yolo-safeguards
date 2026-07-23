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
    findSavedProfileForUrl: jest.fn().mockResolvedValue(null),
    resolveProfileApiKey: jest.fn().mockResolvedValue(null),
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
    ).rejects.toThrow('Hermes is reachable, but this phone still needs to pair.');
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

  it('reuses a previously-saved profile’s own key instead of a stale/wrong active key (T-MANUAL-TAILSCALE-KNOWN-PROFILE-KEY)', async () => {
    // Reproduces the live 2026-07-23 bug: Igor pastes his Mac mini's genuinely-healthy
    // Tailscale IP. /health succeeds (Hermes is reachable), but the pair-server
    // auto-fetch fails (e.g. an expired pairing code sitting in a stale pair.json —
    // see scripts/hermes-tailscale-health-watchdog.sh, which only checks the pairCode
    // param is present, not that it hasn't expired). The phone's currently-active key
    // belongs to a DIFFERENT Mac (Igors-MacBook-Pro), so blindly falling back to it
    // trips authMismatch even though this exact Mac mini profile was already paired
    // successfully before and has its own correct key on file.
    const persistProfile = jest.fn().mockResolvedValue(undefined);
    const findSavedProfileForUrl = jest.fn().mockResolvedValue({ id: 'mini-profile-id' });
    const resolveProfileApiKey = jest.fn().mockResolvedValue('minis-own-correct-key');
    const deps = dependencies({
      loadApiKey: jest.fn().mockResolvedValue('macbook-pros-key'), // wrong Mac's active key
      resolvePairServerSetupParams: jest.fn().mockResolvedValue(null), // pair-server auto-fetch failed
      findSavedProfileForUrl,
      resolveProfileApiKey,
      fetchGatewayHealth: jest.fn().mockImplementation((_url, apiKey) =>
        Promise.resolve(
          apiKey === 'minis-own-correct-key'
            ? health({ hostname: 'Igors-Mac-mini.local' })
            : health({ level: 'red', directGatewayReachable: false, authMismatch: true }),
        ),
      ),
    });

    await connectManualGatewayAddress(
      { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
      deps,
    );

    expect(findSavedProfileForUrl).toHaveBeenCalledWith(gatewayUrl);
    expect(resolveProfileApiKey).toHaveBeenCalledWith('mini-profile-id');
    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(
      gatewayUrl,
      'minis-own-correct-key',
      12_000,
    );
    expect(persistProfile).toHaveBeenCalledWith('Igors-Mac-mini', gatewayUrl);
  });

  it('still throws the honest auth-mismatch error when no saved profile matches and the active key is wrong', async () => {
    // First-time/never-paired Mac: no saved profile to borrow a key from, so the
    // existing (documented) behavior — an honest failure — is preserved rather than
    // silently guessing.
    const persistProfile = jest.fn();
    const deps = dependencies({
      loadApiKey: jest.fn().mockResolvedValue('some-other-macs-key'),
      resolvePairServerSetupParams: jest.fn().mockResolvedValue(null),
      findSavedProfileForUrl: jest.fn().mockResolvedValue(null),
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

  it('prefers a freshly pair-server-exchanged key over a saved profile key', async () => {
    const persistProfile = jest.fn().mockResolvedValue(undefined);
    const findSavedProfileForUrl = jest.fn().mockResolvedValue({ id: 'mini-profile-id' });
    const deps = dependencies({
      resolvePairServerSetupParams: jest.fn().mockResolvedValue({
        pairingCode: 'AB23CD45',
        pairServerUrl: 'http://100.70.124.54:8765',
      }),
      exchangePairingCode: jest.fn().mockResolvedValue({ apiKey: 'brand-new-fresh-key' }),
      findSavedProfileForUrl,
      fetchGatewayHealth: jest.fn().mockResolvedValue(health()),
    });

    await connectManualGatewayAddress(
      { gatewayUrl, fallbackLabel: 'Tailscale computer', persistProfile },
      deps,
    );

    // Pair-server auto-fetch succeeded, so the saved-profile lookup is never consulted.
    expect(findSavedProfileForUrl).not.toHaveBeenCalled();
    expect(deps.fetchGatewayHealth).toHaveBeenCalledWith(gatewayUrl, 'brand-new-fresh-key', 12_000);
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
