import { THUMBGATE_API_URL } from '../constants/appIdentity';
import {
  resolveThumbgateCaptureBaseUrl,
  resolveThumbgateCaptureTargets,
  THUMBGATE_LOCAL_PORT,
} from '../utils/thumbgateCaptureTarget';

describe('thumbgateCaptureTarget', () => {
  it('prefers Mac ThumbGate on the gateway host when cloud default is configured', () => {
    expect(
      resolveThumbgateCaptureBaseUrl({
        configuredApiUrl: THUMBGATE_API_URL,
        gatewayUrl: 'http://100.87.85.85:8642',
      }),
    ).toBe(`http://100.87.85.85:${THUMBGATE_LOCAL_PORT}`);
  });

  it('rewrites localhost ThumbGate URL to Tailscale/LAN gateway host', () => {
    expect(
      resolveThumbgateCaptureBaseUrl({
        configuredApiUrl: 'http://localhost:3000',
        gatewayUrl: 'http://192.168.68.77:8642',
      }),
    ).toBe('http://192.168.68.77:3000');
  });

  it('keeps an explicit non-cloud override', () => {
    expect(
      resolveThumbgateCaptureBaseUrl({
        configuredApiUrl: 'https://thumbgate.example.com',
        gatewayUrl: 'http://100.87.85.85:8642',
      }),
    ).toBe('https://thumbgate.example.com');
  });

  it('lists Mac then cloud fallback targets', () => {
    expect(
      resolveThumbgateCaptureTargets({
        configuredApiUrl: THUMBGATE_API_URL,
        gatewayUrl: 'http://100.87.85.85:8642',
      }),
    ).toEqual([
      `http://100.87.85.85:${THUMBGATE_LOCAL_PORT}`,
      THUMBGATE_API_URL.replace(/\/+$/, ''),
    ]);
  });
});
