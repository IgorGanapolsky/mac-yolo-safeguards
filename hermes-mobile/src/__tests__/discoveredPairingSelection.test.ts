import { secureCredentials } from '../services/secureCredentials';
import {
  hasCommittedComputerSelection,
  resolveDiscoveredPairingSelection,
} from '../utils/discoveredPairingSelection';

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    saveApiKey: jest.fn().mockResolvedValue(undefined),
    saveThumbgateApiKey: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('discovered iPad pairing selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not treat catalog-only scan results as a committed computer selection', () => {
    expect(
      hasCommittedComputerSelection({
        activeProfileId: null,
        settingsGatewayUrl: '',
      }),
    ).toBe(false);
    expect(
      hasCommittedComputerSelection({
        activeProfileId: 'mac-mini',
        settingsGatewayUrl: '',
      }),
    ).toBe(false);
    expect(
      hasCommittedComputerSelection({
        activeProfileId: 'mac-mini',
        settingsGatewayUrl: 'http://100.94.135.78:8642',
      }),
    ).toBe(true);
  });

  it('exchanges a secretless discovery code before reporting success', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'http://100.87.85.85:8765/pair.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            deepLink:
              'hermes://setup?pairCode=FRESH-NOW&pairServer=http%3A%2F%2F192.168.68.60%3A8765&macName=Igors-MacBook-Pro',
          }),
        } as Response;
      }
      if (url === 'http://192.168.68.60:8765/pair-exchange?code=FRESH-NOW') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            apiKey: 'fresh-profile-key',
            macName: 'Igors-MacBook-Pro',
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL ${String(url)}`);
    });

    await expect(
      resolveDiscoveredPairingSelection({
        gatewayUrl: 'http://100.87.85.85:8642',
        setup: {
          pairingCode: 'ONE-TIME',
          pairServerUrl: 'http://192.168.68.60:8765',
          macName: 'Igors-MacBook-Pro',
        },
      }),
    ).resolves.toEqual({
      ok: true,
      apiKey: 'fresh-profile-key',
      setup: expect.objectContaining({
        gatewayUrl: 'http://100.87.85.85:8642',
        apiKey: 'fresh-profile-key',
      }),
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.68.60:8765/pair-exchange?code=FRESH-NOW',
      expect.objectContaining({ signal: expect.any(Object) }),
    );
    expect(fetchSpy.mock.calls.map(([url]) => url)).not.toContain(
      'http://192.168.68.60:8765/pair-exchange?code=ONE-TIME',
    );
    expect(secureCredentials.saveApiKey).toHaveBeenCalledWith('fresh-profile-key');
    fetchSpy.mockRestore();
  });

  it('fails closed when the one-time code is expired', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'http://100.87.85.85:8765/pair.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            deepLink:
              'hermes://setup?pairCode=FRESH-BUT-EXPIRED&pairServer=http%3A%2F%2F192.168.68.60%3A8765',
          }),
        } as Response;
      }
      if (
        url ===
        'http://192.168.68.60:8765/pair-exchange?code=FRESH-BUT-EXPIRED'
      ) {
        return {
          ok: false,
          status: 410,
          json: async () => ({}),
        } as Response;
      }
      throw new Error(`Unexpected URL ${String(url)}`);
    });

    await expect(
      resolveDiscoveredPairingSelection({
        gatewayUrl: 'http://100.87.85.85:8642',
        setup: {
          pairingCode: 'EXPIRED',
          pairServerUrl: 'http://192.168.68.60:8765',
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'Computer pairing expired. Find computers again to get a fresh link.',
    });
    fetchSpy.mockRestore();
  });

  it('fetches fresh pair.json when health discovery wins the race', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'http://100.87.85.85:8765/pair.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            deepLink:
              'hermes://setup?pairCode=RACE-WINNER&pairServer=http%3A%2F%2F100.87.85.85%3A8765',
          }),
        } as Response;
      }
      if (url === 'http://100.87.85.85:8765/pair-exchange?code=RACE-WINNER') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            apiKey: 'race-proof-key',
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL ${String(url)}`);
    });

    await expect(
      resolveDiscoveredPairingSelection({
        gatewayUrl: 'http://100.87.85.85:8642',
      }),
    ).resolves.toMatchObject({
      ok: true,
      apiKey: 'race-proof-key',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('refreshes a scan code before exchange at selection time', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'http://100.87.85.85:8765/pair.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            deepLink:
              'hermes://setup?pairCode=FRESH-ON-TAP&pairServer=http%3A%2F%2F100.87.85.85%3A8765',
          }),
        } as Response;
      }
      if (url === 'http://100.87.85.85:8765/pair-exchange?code=FRESH-ON-TAP') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            apiKey: 'fresh-on-tap-key',
          }),
        } as Response;
      }
      throw new Error(`stale scan code used: ${String(url)}`);
    });

    await expect(
      resolveDiscoveredPairingSelection({
        gatewayUrl: 'http://100.87.85.85:8642',
        setup: {
          pairingCode: 'STALE-FROM-SCAN',
          pairServerUrl: 'http://100.87.85.85:8765',
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      apiKey: 'fresh-on-tap-key',
    });
    expect(fetchSpy.mock.calls.map(([url]) => url)).not.toContain(
      'http://100.87.85.85:8765/pair-exchange?code=STALE-FROM-SCAN',
    );
    fetchSpy.mockRestore();
  });

  it('refetches and retries when an older server invalidates the selected code', async () => {
    let pairJsonReads = 0;
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'http://100.87.85.85:8765/pair.json') {
        pairJsonReads += 1;
        const pairingCode = pairJsonReads === 1 ? 'INVALIDATED-FIRST' : 'FRESH-SECOND';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            deepLink: `hermes://setup?pairCode=${pairingCode}&pairServer=http%3A%2F%2F100.87.85.85%3A8765`,
          }),
        } as Response;
      }
      if (url === 'http://100.87.85.85:8765/pair-exchange?code=INVALIDATED-FIRST') {
        return {
          ok: false,
          status: 410,
          json: async () => ({}),
        } as Response;
      }
      if (url === 'http://100.87.85.85:8765/pair-exchange?code=FRESH-SECOND') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            apiKey: 'retry-proof-key',
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL ${String(url)}`);
    });

    await expect(
      resolveDiscoveredPairingSelection({
        gatewayUrl: 'http://100.87.85.85:8642',
      }),
    ).resolves.toMatchObject({
      ok: true,
      apiKey: 'retry-proof-key',
    });
    expect(pairJsonReads).toBe(2);
    fetchSpy.mockRestore();
  });

  it('keeps an existing profile usable when its pair service is offline', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(
      new Error('pair service offline'),
    );

    await expect(
      resolveDiscoveredPairingSelection({
        gatewayUrl: 'http://100.87.85.85:8642',
      }),
    ).resolves.toEqual({ ok: true, apiKey: null, setup: null });
    fetchSpy.mockRestore();
  });

  it('keeps a saved profile usable when pair refresh returns an expired code', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'http://100.87.85.85:8765/pair.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            deepLink:
              'hermes://setup?pairCode=EXPIRED-REFRESH&pairServer=http%3A%2F%2F100.87.85.85%3A8765',
          }),
        } as Response;
      }
      if (
        url ===
        'http://100.87.85.85:8765/pair-exchange?code=EXPIRED-REFRESH'
      ) {
        return {
          ok: false,
          status: 410,
          json: async () => ({}),
        } as Response;
      }
      throw new Error(`Unexpected URL ${String(url)}`);
    });

    await expect(
      resolveDiscoveredPairingSelection({
        gatewayUrl: 'http://100.87.85.85:8642',
        hasSavedCredential: true,
      }),
    ).resolves.toEqual({ ok: true, apiKey: null, setup: null });
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    fetchSpy.mockRestore();
  });
});
