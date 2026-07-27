import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ComputerPickerStatusRegion from '../components/ComputerPickerStatusRegion';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanResult } from '../types/lanScan';
import {
  COMPUTER_PICKER_STATUS_DEBOUNCE_MS,
  COMPUTER_PICKER_STATUS_MIN_HEIGHT,
} from '../utils/computerPickerStatus';

const discovery: DiscoveredGateway = {
  gatewayUrl: 'http://100.94.135.78:8642',
  label: 'Igors-Mac-mini',
  localIp: '100.94.135.78',
};

const scanResult: LanScanResult = {
  foundCount: 2,
  lanCount: 0,
  tailscaleCount: 2,
  usbCount: 0,
  completedAtMs: Date.now(),
};

describe('ComputerPickerStatusRegion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps a single fixed-height status region mounted (no stacked banners)', () => {
    const { getByTestId, queryByTestId, rerender, getByText } = render(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={null}
        tailscaleProbing={false}
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
      />,
    );

    const region = getByTestId('mac-picker-status-region');
    expect(region).toBeTruthy();
    expect(region.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minHeight: COMPUTER_PICKER_STATUS_MIN_HEIGHT }),
      ]),
    );
    expect(getByText('Paste your Mac’s Tailscale IP')).toBeTruthy();
    expect(queryByTestId('tailscale-discovery-probing')).toBeNull();
    expect(queryByTestId('mac-scan-progress-result')).toBeNull();

    rerender(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={null}
        tailscaleProbing
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
      />,
    );
    expect(getByTestId('mac-picker-status-region')).toBeTruthy();
    expect(getByText('On Tailscale — searching for your computer')).toBeTruthy();
    expect(queryByTestId('mac-picker-setup-help')).toBeNull();

    rerender(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={scanResult}
        tailscaleProbing={false}
        tailscaleVpnActive
        tailscaleDiscoveries={[discovery]}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(COMPUTER_PICKER_STATUS_DEBOUNCE_MS);
    });

    // Result wins over Tailscale-found while showScanResult is active — still one region.
    expect(getByTestId('mac-picker-status-region')).toBeTruthy();
    expect(getByText('Found 2 on Tailscale')).toBeTruthy();
    expect(queryByTestId('mac-picker-status-region-tailscale-chips')).toBeNull();
  });

  it('debounces rapid Tailscale probing ↔ result label thrash', () => {
    const { getByText, rerender, queryByText } = render(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={null}
        tailscaleProbing
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
      />,
    );
    expect(getByText('On Tailscale — searching for your computer')).toBeTruthy();

    rerender(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={scanResult}
        tailscaleProbing={false}
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
      />,
    );
    // Immediate flip within debounce window should still show previous searching copy.
    expect(getByText('On Tailscale — searching for your computer')).toBeTruthy();
    expect(queryByText('Found 2 on Tailscale')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(COMPUTER_PICKER_STATUS_DEBOUNCE_MS);
    });
    expect(getByText('Found 2 on Tailscale')).toBeTruthy();
  });

  it('shows honest off-VPN copy while a tailnet probe is in flight', () => {
    const { getByText, queryByText } = render(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={null}
        tailscaleProbing
        tailscaleVpnActive={false}
        tailscaleDiscoveries={[]}
      />,
    );

    expect(getByText('Looking for Tailscale computers…')).toBeTruthy();
    expect(queryByText('On Tailscale — searching for your computer')).toBeNull();
  });

  it('collapses idle help into a reserved help slot when saved profiles exist', () => {
    const onExpandHelp = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={null}
        tailscaleProbing={false}
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
        savedProfileCount={2}
        onExpandHelp={onExpandHelp}
      />,
    );

    expect(queryByTestId('mac-picker-status-region')).toBeNull();
    expect(getByTestId('mac-picker-status-region-slot')).toBeTruthy();
    fireEvent.press(getByTestId('mac-picker-status-region-help-link'));
    expect(onExpandHelp).toHaveBeenCalledTimes(1);
  });

  it('suppresses Connected status card when profiles already show Connected on the row', () => {
    const { getByTestId, queryByTestId, queryByText } = render(
      <ComputerPickerStatusRegion
        scanning={false}
        scanProgress={null}
        scanResult={null}
        tailscaleProbing={false}
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
        activeGatewayUrl="http://127.0.0.1:8642"
        activeReachable
        savedProfileCount={1}
        onExpandHelp={jest.fn()}
        compact
      />,
    );
    expect(queryByTestId('mac-picker-status-region')).toBeNull();
    expect(getByTestId('mac-picker-status-region-slot')).toBeTruthy();
    expect(queryByText(/Connected ·/)).toBeNull();
  });

  it('keeps a stable reserved slot while progress ticks do not change searching signature', () => {
    const { getByTestId, getByText, rerender } = render(
      <ComputerPickerStatusRegion
        scanning
        scanProgress={{
          stage: 'gateway_health',
          completedHosts: 1,
          totalHosts: 8,
          foundCount: 0,
        }}
        scanResult={null}
        tailscaleProbing={false}
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
      />,
    );
    expect(getByTestId('mac-picker-status-region')).toBeTruthy();
    expect(getByText('Searching for your computer…')).toBeTruthy();

    rerender(
      <ComputerPickerStatusRegion
        scanning
        scanProgress={{
          stage: 'gateway_health',
          completedHosts: 7,
          totalHosts: 8,
          foundCount: 2,
        }}
        scanResult={null}
        tailscaleProbing={false}
        tailscaleVpnActive
        tailscaleDiscoveries={[]}
      />,
    );
    expect(getByText('Searching for your computer…')).toBeTruthy();
  });
});
