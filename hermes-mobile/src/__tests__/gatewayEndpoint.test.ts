import type { GatewayHealthSnapshot } from '../types/gateway';
import {
  formatGatewayEndpointLine,
  formatGatewayHostLabel,
  formatLeashConnectionDisplay,
  formatListeningOnGatewayLine,
  isPrivateLanGatewayUrl,
} from '../utils/gatewayEndpoint';

const sampleHealth = (partial: Partial<GatewayHealthSnapshot>): GatewayHealthSnapshot => ({
  level: 'green',
  checkedAt: '2026-06-18T12:00:00.000Z',
  ...partial,
});

describe('formatGatewayHostLabel', () => {
  it('uses health hostname and local IP when available', () => {
    expect(
      formatGatewayHostLabel('http://192.168.1.10:8642', sampleHealth({
        hostname: 'Igor-MacBook-Pro',
        localIp: '192.168.1.10',
      })),
    ).toBe('Igor-MacBook-Pro (192.168.1.10)');
  });

  it('falls back to gateway URL IP when health is missing', () => {
    expect(formatGatewayHostLabel('http://192.168.12.208:8642', null)).toBe('192.168.12.208');
  });

  it('falls back to gateway URL hostname when health is missing', () => {
    expect(formatGatewayHostLabel('http://hermes-mac.local:8642', null)).toBe('hermes-mac.local');
  });

  it('labels loopback gateway as machine name plus USB', () => {
    expect(
      formatGatewayHostLabel('http://127.0.0.1:8642', sampleHealth({
        hostname: 'Igors-MacBook-Pro.local',
      })),
    ).toBe('Igors-MacBook-Pro · USB');
  });

  it('ignores unknown placeholders from health', () => {
    expect(
      formatGatewayHostLabel('http://192.168.5.42:8642', sampleHealth({
        hostname: 'unknown',
        localIp: 'unknown',
      })),
    ).toBe('192.168.5.42');
  });

  it('strips .local from machine hostname', () => {
    expect(
      formatGatewayHostLabel('http://192.168.1.10:8642', sampleHealth({
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '192.168.1.10',
      })),
    ).toBe('Igors-MacBook-Pro (192.168.1.10)');
  });

  it('shows unconfigured label for malformed gateway URLs', () => {
    expect(formatGatewayHostLabel('http://', null)).toBe('Computer not configured');
    expect(formatGatewayEndpointLine('http://http:8642', null)).toBe('Set computer in Settings');
  });
});

describe('formatGatewayEndpointLine', () => {
  it('returns host and port from gateway URL', () => {
    expect(formatGatewayEndpointLine('http://192.168.12.208:8642', null)).toBe('192.168.12.208:8642');
  });

  it('falls back to health LAN IP with port from URL', () => {
    expect(
      formatGatewayEndpointLine(
        'http://Igors-MacBook-Pro.local:8642',
        sampleHealth({ localIp: '192.168.12.208' }),
      ),
    ).toBe('192.168.12.208:8642');
  });
});

describe('isPrivateLanGatewayUrl', () => {
  it('detects private LAN gateway URLs', () => {
    expect(isPrivateLanGatewayUrl('http://10.2.29.103:8642')).toBe(true);
    expect(isPrivateLanGatewayUrl('http://192.168.68.61:8642')).toBe(true);
    expect(isPrivateLanGatewayUrl('http://172.16.0.5:8642')).toBe(true);
    expect(isPrivateLanGatewayUrl('http://Igors-MacBook-Pro.local:8642')).toBe(true);
  });

  it('does not flag public tunnel URLs as LAN-only', () => {
    expect(isPrivateLanGatewayUrl('https://hermesmobile-cloud.fly.dev')).toBe(false);
    expect(isPrivateLanGatewayUrl('https://example.com')).toBe(false);
  });
});

describe('formatLeashConnectionDisplay', () => {
  it('explains relay paired state', () => {
    const display = formatLeashConnectionDisplay({
      connectionMode: 'relay',
      connectionState: 'connected',
      gatewayUrl: 'http://192.168.12.208:8642',
      health: null,
      isPaired: true,
    });
    expect(display.headline).toBe('Hermes relay linked to your active machine');
    expect(display.footnote).toMatch(/Approval alerts route over the internet/i);
    expect(display.footnote?.toLowerCase() ?? '').not.toContain('tailscale');
  });

  it('explains gateway mode with machine name and IP', () => {
    const display = formatLeashConnectionDisplay({
      connectionMode: 'gateway',
      connectionState: 'connected',
      gatewayUrl: 'http://192.168.12.208:8642',
      health: sampleHealth({ hostname: 'Igors-MacBook-Pro.local', localIp: '192.168.12.208' }),
    });
    expect(display.headline).toBe('Direct local link to your computer');
    expect(display.machineName).toBe('Igors-MacBook-Pro');
    expect(display.lanIp).toBe('192.168.12.208');
    expect(display.footnote).toContain('instant alerts');
  });

  it('does not use WS shorthand', () => {
    const display = formatLeashConnectionDisplay({
      connectionMode: 'gateway',
      connectionState: 'connected',
      gatewayUrl: 'http://192.168.12.208:8642',
      health: null,
    });
    expect(display.headline).not.toMatch(/WS/i);
    expect(display.headline).toContain('computer');
  });

  it('shows USB direct link when relay is unpaired but Mac HTTP is up', () => {
    const display = formatLeashConnectionDisplay({
      connectionMode: 'relay',
      connectionState: 'disconnected',
      gatewayUrl: 'http://127.0.0.1:8642',
      health: sampleHealth({
        hostname: 'Igors-MacBook-Pro.local',
        level: 'green',
        directGatewayReachable: true,
      }),
      isPaired: false,
    });
    expect(display.headline).toBe('USB link to Igors-MacBook-Pro');
    expect(display.footnote).toContain('Pair Hermes relay');
    expect(display.footnote?.toLowerCase() ?? '').not.toContain('tailscale');
  });
});

describe('formatListeningOnGatewayLine', () => {
  it('includes suffix when provided', () => {
    expect(
      formatListeningOnGatewayLine(
        'http://192.168.1.1:8642',
        sampleHealth({ hostname: 'mac', localIp: '192.168.1.1' }),
        '— waiting',
      ),
    ).toContain('waiting');
  });
});
