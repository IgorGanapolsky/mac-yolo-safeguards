import type { GatewayHealthSnapshot } from '../types/gateway';
import {
  formatGatewayHostLabel,
  formatLeashConnectionDisplay,
  formatListeningOnGatewayLine,
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
    expect(display.headline).toBe('Cloud relay linked to your Mac');
  });

  it('explains gateway mode with machine name and IP', () => {
    const display = formatLeashConnectionDisplay({
      connectionMode: 'gateway',
      connectionState: 'connected',
      gatewayUrl: 'http://192.168.12.208:8642',
      health: sampleHealth({ hostname: 'Igors-MacBook-Pro.local', localIp: '192.168.12.208' }),
    });
    expect(display.headline).toBe('Live link to your Mac gateway');
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
    expect(display.headline).toContain('Mac gateway');
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
