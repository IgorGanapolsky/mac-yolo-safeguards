import {
  acceptPairSetupPayload,
  acceptRawPairScan,
} from '../utils/pairPayloadAccept';

describe('pairPayloadAccept', () => {
  it('rejects file:// raw scans', () => {
    const raw = acceptRawPairScan(
      'file:///Users/me/Library/Application%20Support/mac-yolo-safeguards/hermes-mobile-pair/index.html',
    );
    expect(raw?.ok).toBe(false);
    if (raw && !raw.ok) {
      expect(raw.reason).toBe('file_scheme');
    }
  });

  it('rejects unsupported schemes', () => {
    const raw = acceptRawPairScan('intent://setup#Intent;end');
    expect(raw?.ok).toBe(false);
    if (raw && !raw.ok) {
      expect(raw.reason).toBe('unsupported_scheme');
    }
  });

  it('rejects loopback gateway as QR primary', () => {
    const result = acceptPairSetupPayload(
      { gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'sk-test', macName: 'Mac' },
      { source: 'qr' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('loopback_primary');
    }
  });

  it('rejects loopback pairServer on QR path', () => {
    const result = acceptPairSetupPayload(
      {
        pairingCode: 'ABCD1234',
        pairServerUrl: 'http://127.0.0.1:8765',
        macName: 'Mac',
      },
      { source: 'qr' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unreachable_pair_server');
    }
  });

  it('accepts Tailscale pairServer secretless QR', () => {
    const result = acceptPairSetupPayload(
      {
        pairingCode: 'ABCD1234',
        pairServerUrl: 'http://100.87.85.85:8765',
        macName: 'Igors-MacBook-Pro',
      },
      { source: 'qr' },
    );
    expect(result).toEqual({
      ok: true,
      params: expect.objectContaining({
        pairServerUrl: 'http://100.87.85.85:8765',
        pairingCode: 'ABCD1234',
      }),
    });
  });

  it('accepts Tailscale gateway URL', () => {
    const result = acceptPairSetupPayload(
      { gatewayUrl: 'http://100.94.135.78:8642', macName: 'Igors-Mac-mini' },
      { source: 'qr' },
    );
    expect(result.ok).toBe(true);
  });

  it('allows USB adb secretless loopback on deeplink path', () => {
    const result = acceptPairSetupPayload(
      {
        pairingCode: 'USBCODE1',
        pairServerUrl: 'http://127.0.0.1:8765',
        gatewayUrl: 'http://127.0.0.1:8642',
        macName: 'Igors-MacBook-Pro',
      },
      { source: 'deeplink' },
    );
    expect(result.ok).toBe(true);
  });

  it('strips loopback extras from QR payloads', () => {
    const result = acceptPairSetupPayload(
      {
        gatewayUrl: 'http://100.87.85.85:8642',
        extraComputers: [
          { gatewayUrl: 'http://127.0.0.1:8642', macName: 'Ghost' },
          { gatewayUrl: 'http://100.94.135.78:8642', macName: 'Igors-Mac-mini' },
        ],
      },
      { source: 'qr' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.params.extraComputers).toEqual([
        { gatewayUrl: 'http://100.94.135.78:8642', macName: 'Igors-Mac-mini' },
      ]);
    }
  });
});
