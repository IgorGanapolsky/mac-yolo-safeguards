import {
  COMPUTER_PICKER_STATUS_DEBOUNCE_MS,
  COMPUTER_PICKER_STATUS_MIN_HEIGHT,
  computerPickerStatusSignature,
  resolveComputerPickerStatus,
  shouldCommitComputerPickerStatus,
} from '../utils/computerPickerStatus';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';

const discovery: DiscoveredGateway = {
  gatewayUrl: 'http://100.94.135.78:8642',
  label: 'Igors-Mac-mini',
  localIp: '100.94.135.78',
};

const scanningProgress: LanScanProgress = {
  stage: 'gateway_health',
  completedHosts: 2,
  totalHosts: 10,
  foundCount: 1,
};

const scanResult: LanScanResult = {
  foundCount: 2,
  lanCount: 0,
  tailscaleCount: 2,
  usbCount: 0,
  completedAtMs: 1_200,
};

describe('computerPickerStatus', () => {
  it('reserves a fixed min height for the status band', () => {
    expect(COMPUTER_PICKER_STATUS_MIN_HEIGHT).toBeGreaterThanOrEqual(72);
    expect(COMPUTER_PICKER_STATUS_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
  });

  it('collapses searching + Tailscale probe + result into one searching mode while scanning', () => {
    const status = resolveComputerPickerStatus({
      scanning: true,
      scanProgress: scanningProgress,
      scanResult,
      showScanResult: true,
      tailscaleProbing: true,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [discovery],
    });
    expect(status.kind).toBe('searching');
    expect(status.title).toMatch(/Checking direct Hermes links|Searching for Hermes/);
    expect(status.discoveries).toEqual([]);
  });

  it('shows a single Tailscale searching line when probing with no discoveries', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: null,
      showScanResult: false,
      tailscaleProbing: true,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [],
    });
    expect(status.kind).toBe('searching');
    expect(status.title).toBe('On Tailscale — searching for your computer');
  });

  it('does not infer Tailscale is on from an in-flight probe', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: null,
      showScanResult: false,
      tailscaleProbing: true,
      tailscaleVpnActive: false,
      tailscaleDiscoveries: [],
    });
    expect(status.kind).toBe('help');
    expect(status.title).toBe('Tailscale is off on this phone');
    expect(status.title).not.toMatch(/^On Tailscale/);
  });

  it('does not render cached Tailscale discoveries after VPN disconnects', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: null,
      showScanResult: false,
      tailscaleProbing: false,
      tailscaleVpnActive: false,
      tailscaleDiscoveries: [discovery],
    });
    expect(status.kind).toBe('help');
    expect(status.title).toBe('Tailscale is off on this phone');
    expect(status.discoveries).toEqual([]);
  });

  it('keeps a completed Wi-Fi scan visible while an off-VPN probe finishes', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: {
        ...scanResult,
        foundCount: 1,
        lanCount: 1,
        tailscaleCount: 0,
      },
      showScanResult: true,
      tailscaleProbing: true,
      tailscaleVpnActive: false,
      tailscaleDiscoveries: [],
    });
    expect(status.kind).toBe('result');
    expect(status.title).toBe('Found 1 local Hermes computer');
  });

  it('shows Tailscale found chips only when not scanning and discoveries exist', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: null,
      showScanResult: false,
      tailscaleProbing: true,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [discovery],
    });
    expect(status.kind).toBe('tailscale_found');
    expect(status.discoveries).toHaveLength(1);
    expect(status.title).not.toMatch(/local/i);
  });

  it('uses honest Tailscale result copy (never local for Tailscale-only hits)', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult,
      showScanResult: true,
      tailscaleProbing: false,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [],
    });
    expect(status.kind).toBe('result');
    expect(status.title).toBe('Found 2 on Tailscale');
    expect(status.title.toLowerCase()).not.toContain('local');
  });

  it('falls back to compact help when idle', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: null,
      showScanResult: false,
      tailscaleProbing: false,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [],
    });
    expect(status.kind).toBe('help');
    expect(status.title).toBe('Missing your other machine?');
  });

  it('never claims Using USB when active path is Home Wi-Fi', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: {
        foundCount: 1,
        lanCount: 0,
        tailscaleCount: 0,
        usbCount: 1,
        completedAtMs: 1,
      },
      showScanResult: true,
      tailscaleProbing: false,
      tailscaleVpnActive: false,
      tailscaleDiscoveries: [],
      activeGatewayUrl: 'http://192.168.68.61:8642',
      wifiConnected: true,
      activeReachable: true,
    });
    expect(status.kind).toBe('active');
    expect(status.title).toBe('Connected · Home Wi‑Fi');
    expect(status.title).not.toMatch(/USB/i);
    expect(status.detail).not.toMatch(/Using USB/i);
  });

  it('shows Connected · USB when loopback is the active path', () => {
    const status = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: null,
      showScanResult: false,
      tailscaleProbing: false,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [],
      activeGatewayUrl: 'http://127.0.0.1:8642',
      wifiConnected: true,
      activeReachable: true,
    });
    expect(status.kind).toBe('active');
    expect(status.title).toBe('Connected · USB');
  });

  it('debounces rapid signature flips but commits first paint immediately', () => {
    const a = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult: null,
      showScanResult: false,
      tailscaleProbing: true,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [],
    });
    const b = resolveComputerPickerStatus({
      scanning: false,
      scanProgress: null,
      scanResult,
      showScanResult: true,
      tailscaleProbing: false,
      tailscaleVpnActive: true,
      tailscaleDiscoveries: [],
    });
    const sigA = computerPickerStatusSignature(a);
    const sigB = computerPickerStatusSignature(b);
    expect(sigA).not.toBe(sigB);

    expect(
      shouldCommitComputerPickerStatus({
        lastCommitAtMs: 0,
        nowMs: 10,
        prevSignature: null,
        nextSignature: sigA,
      }),
    ).toBe(true);

    expect(
      shouldCommitComputerPickerStatus({
        lastCommitAtMs: 100,
        nowMs: 200,
        prevSignature: sigA,
        nextSignature: sigB,
        prevKind: 'searching',
        nextKind: 'result',
        minIntervalMs: 400,
      }),
    ).toBe(false);

    expect(
      shouldCommitComputerPickerStatus({
        lastCommitAtMs: 100,
        nowMs: 520,
        prevSignature: sigA,
        nextSignature: sigB,
        prevKind: 'searching',
        nextKind: 'result',
        minIntervalMs: 400,
      }),
    ).toBe(true);

    expect(
      shouldCommitComputerPickerStatus({
        lastCommitAtMs: 100,
        nowMs: 150,
        prevSignature: computerPickerStatusSignature(
          resolveComputerPickerStatus({
            scanning: false,
            scanProgress: null,
            scanResult: null,
            showScanResult: false,
            tailscaleProbing: false,
            tailscaleVpnActive: true,
            tailscaleDiscoveries: [],
          }),
        ),
        nextSignature: sigA,
        prevKind: 'help',
        nextKind: 'searching',
        minIntervalMs: 400,
      }),
    ).toBe(true);

    expect(
      shouldCommitComputerPickerStatus({
        lastCommitAtMs: 100,
        nowMs: 9999,
        prevSignature: sigA,
        nextSignature: sigA,
      }),
    ).toBe(false);
  });
});
