/**
 * Contract: USB cable connect gate + ranked transport law must stay wired.
 * Prevents "we fixed connect" without a permanent check that can fail.
 */
import fs from 'fs';
import path from 'path';
import {
  resolveUsbTransportHandoff,
  type UsbTransportHandoffInput,
} from '../utils/usbTransportHandoff';
import {
  shouldKeepUsbOverStickyRemote,
  shouldPreferUsbProbeFirst,
} from '../utils/connectionSelfHeal';
import {
  isLiveUsbHealthIdentity,
  resolveMachineDisplayName,
  USB_UNKNOWN_MACHINE_LABEL,
} from '../utils/chatMachineHeader';
import type { GatewayProfile } from '../types/gatewayProfile';

const repoRoot = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const macBookTs: GatewayProfile = {
  id: 'macbook_ts',
  label: 'Igors-MacBook-Pro',
  gatewayUrl: 'http://100.87.85.85:8642',
  hostname: 'Igors-MacBook-Pro.local',
  addedAt: '2026-07-24T00:00:00.000Z',
};

describe('usb cable connect gate contract (2026-07-24)', () => {
  it('ships check-usb-cable-connect-gate.js with ranked law + static/device layers', () => {
    const gate = read('tools/check-usb-cable-connect-gate.js');
    expect(gate).toContain('live same-Mac USB reverse');
    expect(gate).toContain('sticky Tailscale');
    expect(gate).toContain('checkStaticPolicy');
    expect(gate).toContain('phoneGatewayHealth');
    expect(gate).toContain('--static-only');
    expect(gate).toContain('--require-device');
    expect(gate).toContain('tcp:8642');
    expect(gate).toContain('tcp:8765');
  });

  it('npm scripts wire the gate', () => {
    const pkg = JSON.parse(read('hermes-mobile/package.json'));
    expect(pkg.scripts['gate:usb-cable']).toMatch(/check-usb-cable-connect-gate/);
    expect(pkg.scripts['gate:usb-cable:static']).toMatch(/static-only/);
    expect(pkg.scripts['gate:usb-cable:require']).toMatch(/require-device/);
  });

  it('docs freeze ranked law', () => {
    const doc = read('hermes-mobile/docs/USB-CABLE-CONNECT-GATE.md');
    expect(doc).toMatch(/Live same-Mac USB reverse/i);
    expect(doc).toMatch(/Sticky Tailscale/i);
    expect(doc).toContain('check-usb-cable-connect-gate.js');
  });

  it('ranked law: sticky Tailscale → USB handoff on cellular when reverse live', () => {
    const input: UsbTransportHandoffInput = {
      currentGatewayUrl: macBookTs.gatewayUrl,
      wifiConnected: false,
      liveUsbReachable: true,
      liveUsbHostname: 'Igors-MacBook-Pro.local',
      activeProfile: macBookTs,
    };
    const decision = resolveUsbTransportHandoff(input);
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.reason).toBe('handoff');
    expect(decision.usbGatewayUrl).toMatch(/127\.0\.0\.1:8642/);
  });

  it('ranked law: prefer USB probe first when liveUsbSameMachine even on cellular', () => {
    expect(
      shouldPreferUsbProbeFirst({
        activeGatewayUrl: macBookTs.gatewayUrl,
        effectiveGatewayUrl: macBookTs.gatewayUrl,
        wifiConnected: false,
        liveUsbSameMachine: true,
      }),
    ).toBe(true);
  });

  it('ranked law: keep USB over sticky remote when cable proves same Mac', () => {
    expect(
      shouldKeepUsbOverStickyRemote({
        effectiveGatewayUrl: 'http://127.0.0.1:8642',
        stickyProfileUrl: macBookTs.gatewayUrl,
        liveUsbSameMachine: true,
      }),
    ).toBe(true);
  });

  it('header: live USB health → named machine; unknown cable → Your computer', () => {
    const liveHealth = {
      level: 'green' as const,
      checkedAt: '2026-07-24T00:00:00.000Z',
      hostname: 'Igors-MacBook-Pro.local',
      directGatewayReachable: true,
    };
    expect(isLiveUsbHealthIdentity(liveHealth)).toBe(true);
    expect(
      resolveMachineDisplayName(macBookTs, 'http://127.0.0.1:8642', liveHealth),
    ).toBe('Igors-MacBook-Pro');

    // Same-URL loopback profile + no live health: never invent a named host (multi-Mac law).
    // (Sticky Tailscale profile + loopback effective URL is switch-in-flight → keep sticky name.)
    expect(isLiveUsbHealthIdentity(null)).toBe(false);
    const usbProfile: GatewayProfile = {
      ...macBookTs,
      id: 'macbook_usb',
      gatewayUrl: 'http://127.0.0.1:8642',
    };
    expect(resolveMachineDisplayName(usbProfile, 'http://127.0.0.1:8642', null)).toBe(
      USB_UNKNOWN_MACHINE_LABEL,
    );
    expect(
      resolveMachineDisplayName(null, 'http://127.0.0.1:8642', {
        level: 'red',
        checkedAt: '2026-07-24T00:00:00.000Z',
      }),
    ).toBe(USB_UNKNOWN_MACHINE_LABEL);
  });
});


