import { resolvePairQrPayload, resolvePairQrPayloadDetailed } from '../utils/pairQrResolve';

describe('resolvePairQrPayload', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('parses hermes://setup deep links', async () => {
    const result = await resolvePairQrPayload(
      'hermes://setup?url=http%3A%2F%2F192.168.12.50%3A8642&key=sk-test',
    );
    expect(result?.gatewayUrl).toBe('http://192.168.12.50:8642');
    expect(result?.apiKey).toBe('sk-test');
  });

  it('fetches pair.json from pair page QR URLs', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        gatewayUrl: 'http://192.168.12.208:8642',
        deepLink:
          'hermes://setup?url=http%3A%2F%2F192.168.12.208%3A8642&key=sk-mini',
      }),
    });

    const result = await resolvePairQrPayload('http://192.168.12.208:8765/pair');
    expect(result?.gatewayUrl).toBe('http://192.168.12.208:8642');
    expect(result?.apiKey).toBe('sk-mini');
    expect(global.fetch).toHaveBeenCalledWith('http://192.168.12.208:8765/pair.json');
  });

  it('rejects file:// QR before any profile mutation', async () => {
    const detailed = await resolvePairQrPayloadDetailed(
      'file:///Users/me/Library/Application%20Support/mac-yolo-safeguards/hermes-mobile-pair/index.html',
    );
    expect(detailed.ok).toBe(false);
    if (!detailed.ok) {
      expect(detailed.reason).toBe('file_scheme');
    }
  });

  it('rejects USB loopback pair page QR', async () => {
    const detailed = await resolvePairQrPayloadDetailed('http://127.0.0.1:8765/pair');
    expect(detailed.ok).toBe(false);
    if (!detailed.ok) {
      expect(detailed.reason).toBe('loopback_primary');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
