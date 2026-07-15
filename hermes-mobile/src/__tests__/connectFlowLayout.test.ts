import {
  hasSuccessfulComputerConnection,
  isDogfoodUsbHeader,
  isNeverConnectedInstall,
  quietConnectFlowHeaderDisplay,
  quietConnectFlowStatusLabel,
  shouldAcceptStatusLabelUpdate,
  shouldHideCommandCenterDuringConnectFlow,
  shouldHideConnectionPanelBehindPicker,
  shouldQuietConnectFlowChrome,
} from '../utils/connectFlowLayout';
import type { GatewayProfile } from '../types/gatewayProfile';

const loopback: GatewayProfile = {
  id: 'usb',
  label: 'Computer via USB',
  gatewayUrl: 'http://127.0.0.1:8642',
  addedAt: '2026-07-15T00:00:00Z',
};

const namedMac: GatewayProfile = {
  id: 'mini',
  label: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  addedAt: '2026-07-15T00:00:00Z',
  lastConnectedAt: '2026-07-15T01:00:00Z',
};

describe('connectFlowLayout', () => {
  it('quiets chrome when Choose-computer sheet is open', () => {
    expect(
      shouldQuietConnectFlowChrome({
        macPickerVisible: true,
        showMacConnectionHelp: false,
        profiles: [namedMac],
        gatewayUrl: namedMac.gatewayUrl,
      }),
    ).toBe(true);
    expect(shouldHideConnectionPanelBehindPicker(true)).toBe(true);
    expect(shouldHideCommandCenterDuringConnectFlow(true)).toBe(true);
    expect(shouldHideCommandCenterDuringConnectFlow(false)).toBe(false);
  });

  it('does not quiet demo mode', () => {
    expect(
      shouldQuietConnectFlowChrome({
        macPickerVisible: false,
        showMacConnectionHelp: true,
        profiles: [],
        gatewayUrl: 'http://127.0.0.1:8642',
        isDemo: true,
      }),
    ).toBe(false);
  });

  it('quiets USB dogfood / connection-help chrome, not unpaired relay chat', () => {
    expect(
      shouldQuietConnectFlowChrome({
        macPickerVisible: false,
        showMacConnectionHelp: true,
        profiles: [loopback],
        gatewayUrl: loopback.gatewayUrl,
      }),
    ).toBe(true);
    expect(
      shouldQuietConnectFlowChrome({
        macPickerVisible: false,
        showMacConnectionHelp: false,
        profiles: [loopback],
        gatewayUrl: loopback.gatewayUrl,
      }),
    ).toBe(true);
    // Unpaired relay with chat available — keep Pair-relay status visible.
    expect(
      shouldQuietConnectFlowChrome({
        macPickerVisible: false,
        showMacConnectionHelp: false,
        profiles: [],
        gatewayUrl: '',
      }),
    ).toBe(false);
  });

  it('does not quiet a healthy returning multi-Mac session without picker', () => {
    expect(
      shouldQuietConnectFlowChrome({
        macPickerVisible: false,
        showMacConnectionHelp: false,
        profiles: [namedMac],
        gatewayUrl: namedMac.gatewayUrl,
      }),
    ).toBe(false);
  });

  it('exposes a stable quiet header without USB / Pair-relay dogfood', () => {
    const display = quietConnectFlowHeaderDisplay();
    expect(display.machineLabel).toBe('Your computer');
    expect(display.machineEndpoint).toBeUndefined();
    expect(isDogfoodUsbHeader(display)).toBe(false);
    expect(quietConnectFlowStatusLabel(true)).toBe('Choose a computer');
    expect(quietConnectFlowStatusLabel(false)).toBe('Not connected');
  });

  it('treats unpaired / never-succeeded installs as never-connected', () => {
    expect(isNeverConnectedInstall([])).toBe(true);
    expect(isNeverConnectedInstall([loopback])).toBe(true);
    expect(hasSuccessfulComputerConnection([loopback])).toBe(false);
    expect(isNeverConnectedInstall([namedMac])).toBe(false);
    expect(hasSuccessfulComputerConnection([namedMac])).toBe(true);
  });

  it('debounces rapid status label thrash but accepts quiet labels immediately', () => {
    expect(
      shouldAcceptStatusLabelUpdate({
        previous: 'Reconnecting…',
        next: 'Pair relay in Settings for Wi‑Fi, cellular, or USB',
        lastAcceptedAtMs: 1000,
        nowMs: 1100,
        minIntervalMs: 400,
      }),
    ).toBe(false);
    expect(
      shouldAcceptStatusLabelUpdate({
        previous: 'Reconnecting…',
        next: 'Not connected',
        lastAcceptedAtMs: 1000,
        nowMs: 1100,
        minIntervalMs: 400,
      }),
    ).toBe(true);
  });
});
