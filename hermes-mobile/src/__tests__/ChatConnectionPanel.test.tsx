import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ChatConnectionPanel, { buildConnectionStatusChips } from '../components/ChatConnectionPanel';

describe('buildConnectionStatusChips', () => {
  it('never shows Hermes running and only greens Mac HTTP when reachable', () => {
    const chips = buildConnectionStatusChips({
      macHttpOk: false,
      usbLoopback: true,
      usbCableLikely: true,
      isRelayPaired: true,
      wifiConnected: true,
      wifiProfileReachable: false,
    });

    expect(chips.find((chip) => chip.id === 'mac-http')?.label).toBe('Mac HTTP: Down');
    expect(chips.find((chip) => chip.id === 'mac-http')?.tone).toBe('bad');
    expect(chips.find((chip) => chip.id === 'usb-tunnel')?.label).toBe('USB tunnel: Down');
    expect(chips.some((chip) => /Hermes running/i.test(chip.label))).toBe(false);
  });

  it('marks USB tunnel up only when loopback and HTTP are healthy', () => {
    const chips = buildConnectionStatusChips({
      macHttpOk: true,
      usbLoopback: true,
      usbCableLikely: true,
      isRelayPaired: false,
      wifiConnected: true,
      wifiProfileReachable: false,
    });

    expect(chips.find((chip) => chip.id === 'usb-tunnel')?.label).toBe('USB tunnel: Up');
    expect(chips.find((chip) => chip.id === 'mac-http')?.tone).toBe('ok');
  });
});

describe('ChatConnectionPanel', () => {
  it('shows saved computers when profiles are provided', () => {
    const { getByTestId, getByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        macLabel="MacBook Pro"
        profiles={[
          { id: 'p1', label: 'Mac mini', gatewayUrl: 'http://192.168.1.50:8642', addedAt: '2026-06-23T12:00:00Z' },
          { id: 'p2', label: 'MacBook Pro', gatewayUrl: 'http://10.2.29.103:8642', addedAt: '2026-06-23T12:01:00Z' },
        ]}
        activeProfileId="p2"
        onSelectProfile={jest.fn()}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByText(/Saved computers/)).toBeTruthy();
    expect(getByTestId('gateway-profile-list')).toBeTruthy();
    expect(getByTestId('select-gateway-profile-p1')).toBeTruthy();
  });

  it('does not call an unreachable active computer active now', () => {
    const { getByText, queryByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        macLabel="Computer at 192.168.68.61"
        profiles={[
          {
            id: 'stale',
            label: 'Computer at 192.168.68.61',
            gatewayUrl: 'http://192.168.68.61:8642',
            localIp: '192.168.68.61',
            lastConnectedAt: '2026-06-23T12:00:00Z',
            addedAt: '2026-06-23T12:00:00Z',
          },
        ]}
        activeProfileId="stale"
        activeProfileReachable={false}
        onSelectProfile={jest.fn()}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByText(/Cannot reach this Mac/)).toBeTruthy();
    expect(queryByText(/· Now/)).toBeTruthy();
  });

  it('shows relay workers that are not already saved locally', () => {
    const { getByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        isRelayPaired
        relayWorkers={[
          {
            id: 'mac-mini',
            hostname: 'Igors-Mac-mini.local',
            label: 'Igors-Mac-mini',
            status: 'online',
          },
        ]}
        profiles={[
          {
            id: 'p2',
            label: 'MacBook Pro',
            gatewayUrl: 'http://10.2.29.103:8642',
            addedAt: '2026-06-23T12:01:00Z',
          },
        ]}
        activeProfileId="p2"
        onSelectProfile={jest.fn()}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByTestId('relay-worker-row-mac-mini')).toBeTruthy();
  });

  it('shows Fix USB link CTA and live status chips for loopback failures off Wi‑Fi', () => {
    const onFixUsbLink = jest.fn();
    const { getByTestId, getByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        macLabel="Igors-MacBook-Pro"
        usbLoopback
        usbCableLikely={false}
        wifiConnected={false}
        activeProfileReachable={false}
        onFixUsbLink={onFixUsbLink}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByText('USB tunnel down')).toBeTruthy();
    expect(getByText(/USB tunnel to Igors-MacBook-Pro is not up yet/)).toBeTruthy();
    expect(getByTestId('chat-connection-fix-usb')).toBeTruthy();
    expect(getByTestId('status-pill-mac-http')).toBeTruthy();
    expect(getByText('Mac HTTP: Down')).toBeTruthy();

    fireEvent.press(getByTestId('chat-connection-fix-usb'));
    expect(onFixUsbLink).toHaveBeenCalled();
  });

  it('prefers Search locally over Fix USB when on Wi‑Fi with a saved loopback profile', () => {
    const onFixUsbLink = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        macLabel="Igors-MacBook-Pro"
        usbLoopback
        wifiConnected
        activeProfileReachable={false}
        onFixUsbLink={onFixUsbLink}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByTestId('chat-connection-search')).toBeTruthy();
    expect(queryByTestId('chat-connection-fix-usb')).toBeNull();
  });

  it('uses cant reach title in gateway mode', () => {
    const { getByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        macLabel="MacBook Pro"
        onSearchMac={jest.fn()}
      />,
    );
    expect(getByText("Can't reach your Mac")).toBeTruthy();
  });

  it('shows wrong Mac on USB when health hostname differs from selected profile', () => {
    const { getByText } = render(
      <ChatConnectionPanel
        connectionState="connected"
        connectionMode="gateway"
        macLabel="Mac mini"
        usbLoopback
        usbHostMismatch={{
          usbHostLabel: 'Igors-MacBook-Pro',
          selectedProfileLabel: 'Mac mini',
          matchingProfileId: 'mac_book',
        }}
        profiles={[
          { id: 'mac_mini', label: 'Mac mini', gatewayUrl: 'http://10.2.29.50:8642', addedAt: '2026-06-26T00:00:00Z' },
          { id: 'mac_book', label: 'MacBook Pro', gatewayUrl: 'http://10.2.29.103:8642', addedAt: '2026-06-26T00:00:00Z' },
        ]}
        activeProfileId="mac_mini"
        onSearchMac={jest.fn()}
      />,
    );
    expect(getByText('Wrong Mac on USB')).toBeTruthy();
    expect(getByText(/USB is connected to Igors-MacBook-Pro/)).toBeTruthy();
  });

  it('explains cellular blocks direct LAN URLs', () => {
    const { getByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        wifiConnected={false}
        cellularBlocksDirect
        macLabel="Mac mini"
        onSearchMac={jest.fn()}
      />,
    );
    expect(getByText('Cellular — need tunnel')).toBeTruthy();
    expect(getByText(/tunnel URL/)).toBeTruthy();
    expect(getByText(/8642/)).toBeTruthy();
  });
});
