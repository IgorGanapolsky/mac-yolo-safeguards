import React from 'react';
import { act, render } from '@testing-library/react-native';
import ComputerPickerStatusRegion from '../components/ComputerPickerStatusRegion';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanResult } from '../types/lanScan';
import { COMPUTER_PICKER_STATUS_MIN_HEIGHT } from '../utils/computerPickerStatus';

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
    expect(getByText('Missing your other machine?')).toBeTruthy();
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
      jest.advanceTimersByTime(400);
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
      jest.advanceTimersByTime(400);
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

    expect(getByText('Tailscale is off on this phone')).toBeTruthy();
    expect(queryByText('On Tailscale — searching for your computer')).toBeNull();
  });
});
