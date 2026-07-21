import { resolvePairQrPayload } from '../utils/pairQrResolve';
import { secureCredentials } from '../services/secureCredentials';

jest.mock('../services/secureCredentials', () => ({
  secureCredentials: {
    saveApiKey: jest.fn().mockResolvedValue(undefined),
    saveThumbgateApiKey: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('resolvePairQrPayload', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  it('parses hermes://setup deep links', async () => {
    const result = await resolvePairQrPayload(
      'hermes://setup?url=http%3A%2F%2F192.168.12.50%3A8642&key=sk-test',
    );
    expect(result?.gatewayUrl).toBe('http://192.168.12.50:8642');
    expect(result?.apiKey).toBe('sk-test');
  });

  it('redeems a secretless pair code before returning the scanned setup', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        gatewayUrl: 'http://192.168.12.50:8642',
        apiKey: 'sk-redeemed',
        macName: 'MacBook Pro',
      }),
    });

    const result = await resolvePairQrPayload(
      'hermes://setup?pairCode=FRESH123&pairServer=http%3A%2F%2F192.168.12.50%3A8765',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://192.168.12.50:8765/pair-exchange?code=FRESH123',
    );
    expect(result).toMatchObject({
      gatewayUrl: 'http://192.168.12.50:8642',
      apiKey: 'sk-redeemed',
      macName: 'MacBook Pro',
      pairingCode: 'FRESH123',
      pairServerUrl: 'http://192.168.12.50:8765',
    });
    expect(secureCredentials.saveApiKey).not.toHaveBeenCalled();
    expect(secureCredentials.saveThumbgateApiKey).not.toHaveBeenCalled();
  });

  it('fetches pair.json from pair page QR URLs', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          gatewayUrl: 'http://192.168.12.208:8642',
          deepLink:
            'hermes://setup?pairCode=PAGE456&pairServer=http%3A%2F%2F192.168.12.208%3A8765',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          gatewayUrl: 'http://192.168.12.208:8642',
          apiKey: 'sk-mini',
        }),
      });

    const result = await resolvePairQrPayload('http://192.168.12.208:8765/pair');
    expect(result?.gatewayUrl).toBe('http://192.168.12.208:8642');
    expect(result?.apiKey).toBe('sk-mini');
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://192.168.12.208:8765/pair.json');
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://192.168.12.208:8765/pair-exchange?code=PAGE456',
    );
    expect(secureCredentials.saveApiKey).not.toHaveBeenCalled();
  });
});
