import { exchangePairingCode, resolveSetupDeepLinkCredentials } from '../services/pairingCodeExchange';
import { secureCredentials } from '../services/secureCredentials';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    saveApiKey: jest.fn().mockResolvedValue(undefined),
    saveThumbgateApiKey: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('pairingCodeExchange', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('exchanges a code for credentials over the local pair server', async () => {
    const fetchJson = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-real' }),
    });
    const payload = await exchangePairingCode('http://192.168.1.5:8765', 'AB23CD45', fetchJson);
    expect(payload).toEqual({ gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-real' });
    expect(fetchJson).toHaveBeenCalledWith('http://192.168.1.5:8765/pair-exchange?code=AB23CD45');
  });

  it('returns null (never throws) on a non-ok response — e.g. expired or already-consumed code', async () => {
    const fetchJson = jest.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) });
    const payload = await exchangePairingCode('http://192.168.1.5:8765', 'DEAD0000', fetchJson);
    expect(payload).toBeNull();
  });

  it('returns null when the network call rejects', async () => {
    const fetchJson = jest.fn().mockRejectedValue(new Error('network down'));
    const payload = await exchangePairingCode('http://192.168.1.5:8765', 'AB23CD45', fetchJson);
    expect(payload).toBeNull();
  });

  it('returns null for missing server/code without calling fetch', async () => {
    const fetchJson = jest.fn();
    expect(await exchangePairingCode('', 'AB23CD45', fetchJson)).toBeNull();
    expect(await exchangePairingCode('http://192.168.1.5:8765', '', fetchJson)).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('resolveSetupDeepLinkCredentials merges the exchange payload and persists keys via secureCredentials', async () => {
    const setup: SetupDeepLinkParams = {
      pairingCode: 'AB23CD45',
      pairServerUrl: 'http://192.168.1.5:8765',
      macName: 'Mac-Mini',
    };
    const fetchJson = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-real', thumbgateApiKey: 'tg-real' }),
    });
    const resolved = await resolveSetupDeepLinkCredentials(setup, fetchJson);
    expect(resolved.gatewayUrl).toBe('http://127.0.0.1:8642');
    expect(resolved.apiKey).toBe('sk-real');
    expect(resolved.macName).toBe('Mac-Mini');
    expect(secureCredentials.saveApiKey).toHaveBeenCalledWith('sk-real');
    expect(secureCredentials.saveThumbgateApiKey).toHaveBeenCalledWith('tg-real');
  });

  it('returns the input unchanged (and never calls secureCredentials) when there is no pairing code', async () => {
    const setup: SetupDeepLinkParams = { gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-legacy' };
    const fetchJson = jest.fn();
    const resolved = await resolveSetupDeepLinkCredentials(setup, fetchJson);
    expect(resolved).toBe(setup);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(secureCredentials.saveApiKey).not.toHaveBeenCalled();
  });

  it('falls back to the original setup params when the exchange fails (e.g. expired code)', async () => {
    const setup: SetupDeepLinkParams = {
      pairingCode: 'DEAD0000',
      pairServerUrl: 'http://192.168.1.5:8765',
    };
    const fetchJson = jest.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) });
    const resolved = await resolveSetupDeepLinkCredentials(setup, fetchJson);
    expect(resolved).toBe(setup);
    expect(secureCredentials.saveApiKey).not.toHaveBeenCalled();
  });
});
