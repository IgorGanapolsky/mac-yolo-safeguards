import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ChatConnectionPanel, { buildConnectionStatusChips } from '../components/ChatConnectionPanel';
import * as manualGatewayConnection from '../services/manualGatewayConnection';

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

    expect(chips.find((chip) => chip.id === 'mac-http')?.label).toBe('Your computer: Unreachable');
    expect(chips.find((chip) => chip.id === 'mac-http')?.tone).toBe('bad');
    expect(chips.find((chip) => chip.id === 'usb-tunnel')).toBeUndefined();
    expect(chips.some((chip) => /Hermes running/i.test(chip.label))).toBe(false);
    expect(chips.some((chip) => /Relay/i.test(chip.label))).toBe(false);
    expect(chips.some((chip) => /USB/i.test(chip.label))).toBe(false);
  });

  it('omits USB status chips even when loopback is active', () => {
    const chips = buildConnectionStatusChips({
      macHttpOk: true,
      usbLoopback: true,
      usbCableLikely: true,
      isRelayPaired: false,
      wifiConnected: true,
      wifiProfileReachable: false,
    });

    expect(chips.find((chip) => chip.id === 'usb-tunnel')).toBeUndefined();
    expect(chips.find((chip) => chip.id === 'mac-http')?.tone).toBe('ok');
    expect(chips.some((chip) => /USB/i.test(chip.label))).toBe(false);
  });
});

describe('ChatConnectionPanel', () => {
  it('shows fresh-user onboarding card when no profiles are saved', () => {
    const { getByTestId, getAllByText } = render(
      <ChatConnectionPanel connectionState="disconnected" onSearchMac={jest.fn()} profiles={[]} />,
    );

    expect(getByTestId('fresh-user-onboarding-card')).toBeTruthy();
    expect(getAllByText('Connect your computer').length).toBeGreaterThan(0);
    expect(getByTestId('chat-connection-search')).toBeTruthy();
  });

  it('shows saved computers when profiles are provided', () => {
    const { getByTestId, getByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        macLabel="MacBook Pro"
        connectionHealAttempt={6}
        profiles={[
          { id: 'p1', label: 'Mac mini', gatewayUrl: 'http://192.168.1.50:8642', addedAt: '2026-06-23T12:00:00Z' },
          { id: 'p2', label: 'MacBook Pro', gatewayUrl: 'http://10.2.29.103:8642', addedAt: '2026-06-23T12:01:00Z' },
        ]}
        activeProfileId="p2"
        onSelectProfile={jest.fn()}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByText(/Your computers/)).toBeTruthy();
    expect(getByTestId('gateway-profile-list')).toBeTruthy();
    expect(getByTestId('select-gateway-profile-p1')).toBeTruthy();
  });

  it('does not call an unreachable active computer active now', () => {
    const { getByText, queryByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        macLabel="Computer at 192.168.68.61"
        connectionHealAttempt={6}
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

    expect(getByText(/Cannot reach this computer/)).toBeTruthy();
    expect(queryByText(/· Now/)).toBeTruthy();
  });

  it('shows relay workers that are not already saved locally', () => {
    const { getByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        isRelayPaired
        connectionHealAttempt={6}
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

  it('shows Fix USB connection CTA for loopback failures off Wi‑Fi', () => {
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
        connectionHealAttempt={6}
        onFixUsbLink={onFixUsbLink}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByText('USB connection needs setup')).toBeTruthy();
    expect(getByText(/USB link is not ready yet/)).toBeTruthy();
    expect(getByTestId('chat-connection-fix-usb')).toBeTruthy();
    expect(getByText('Fix USB connection')).toBeTruthy();

    fireEvent.press(getByTestId('chat-connection-fix-usb'));
    expect(onFixUsbLink).toHaveBeenCalled();
  });

  it('prefers Find computers over Fix USB when on Wi‑Fi with a saved loopback profile', () => {
    const onFixUsbLink = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        macLabel="Igors-MacBook-Pro"
        usbLoopback
        wifiConnected
        activeProfileReachable={false}
        connectionHealAttempt={6}
        profiles={[
          {
            id: 'usb',
            label: 'Igors-MacBook-Pro',
            gatewayUrl: 'http://127.0.0.1:8642',
            addedAt: '2026-06-28T00:00:00Z',
          },
        ]}
        onFixUsbLink={onFixUsbLink}
        onSearchMac={jest.fn()}
      />,
    );

    expect(getByTestId('chat-connection-search')).toBeTruthy();
    expect(queryByTestId('chat-connection-fix-usb')).toBeNull();
  });

  it('uses cant reach title after heal exhausted for returning users', () => {
    const { getByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        macLabel="MacBook Pro"
        connectionHealAttempt={6}
        profiles={[
          {
            id: 'p1',
            label: 'MacBook Pro',
            gatewayUrl: 'http://192.168.1.50:8642',
            addedAt: '2026-06-28T00:00:00Z',
          },
        ]}
        onSearchMac={jest.fn()}
      />,
    );
    expect(getByText("Can't reach your computer")).toBeTruthy();
  });

  it('shows wrong Mac on USB when health hostname differs from selected profile', () => {
    const { getByText } = render(
      <ChatConnectionPanel
        connectionState="connected"
        connectionMode="gateway"
        macLabel="Mac mini"
        usbLoopback
        connectionHealAttempt={6}
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
    expect(getByText('Wrong computer plugged in')).toBeTruthy();
    expect(getByText(/USB is connected to Igors-MacBook-Pro/)).toBeTruthy();
  });

  it('explains cellular blocks direct home Wi‑Fi URLs', () => {
    const { getAllByText, getByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        wifiConnected={false}
        cellularBlocksDirect
        macLabel="Mac mini"
        connectionHealAttempt={6}
        onSearchMac={jest.fn()}
      />,
    );
    expect(getAllByText('Use Tailscale from cellular').length).toBeGreaterThan(0);
    expect(getByText(/Home Wi‑Fi addresses won't work on cellular/)).toBeTruthy();
  });

  it('prefers Find computers over USB fix when only loopback profile saved on cellular', () => {
    const { getByTestId, queryByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionMode="gateway"
        wifiConnected={false}
        usbLoopback
        profiles={[
          {
            id: 'usb',
            label: 'Mac via USB',
            gatewayUrl: 'http://127.0.0.1:8642',
            addedAt: '2026-06-28T00:00:00Z',
          },
        ]}
        connectionHealAttempt={6}
        onSearchMac={jest.fn()}
        onFixUsbLink={jest.fn()}
      />,
    );
    expect(getByTestId('chat-connection-search')).toBeTruthy();
    expect(queryByTestId('chat-connection-fix-usb')).toBeNull();
  });

  it('shows Tailscale probing banner while searching tailnet', () => {
    const { getByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        onSearchMac={jest.fn()}
        profiles={[
          {
            id: 'usb',
            label: 'Mac via USB',
            gatewayUrl: 'http://127.0.0.1:8642',
            addedAt: '2026-06-28T00:00:00Z',
          },
        ]}
        tailscaleDiscoveryProbing
        tailnetProbeHostCount={2}
      />,
    );
    expect(getByTestId('tailscale-discovery-probing')).toBeTruthy();
  });

  it('shows Tailscale discovery banner for reachable tailnet Macs', () => {
    const onAdd = jest.fn();
    const { getByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        onSearchMac={jest.fn()}
        tailscaleDiscoveries={[
          {
            gatewayUrl: 'http://100.94.135.78:8642',
            hostname: 'Igors-Mac-mini.local',
            localIp: '192.168.68.56',
            label: 'Igors-Mac-mini',
          },
        ]}
        onAddTailscaleComputer={onAdd}
      />,
    );
    expect(getByTestId('tailscale-discovery-banner')).toBeTruthy();
    fireEvent.press(getByTestId('tailscale-add-igors-mac-mini'));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayUrl: 'http://100.94.135.78:8642' }),
    );
  });

  it('hides status pills during silent heal for returning users', () => {
    const { queryByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionHealAttempt={2}
        connectionHealInFlight
        profiles={[
          {
            id: 'p1',
            label: 'Mac mini',
            gatewayUrl: 'http://192.168.1.50:8642',
            addedAt: '2026-06-28T00:00:00Z',
          },
        ]}
        onSearchMac={jest.fn()}
      />,
    );
    expect(queryByTestId('chat-connection-status-pills')).toBeNull();
  });

  it('shows Tailscale onboarding steps for unreachable saved mini on Tailscale', () => {
    const { getByText, queryByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        connectionHealAttempt={6}
        profiles={[
          {
            id: 'mini',
            label: 'Igors-Mac-mini',
            gatewayUrl: 'http://100.94.135.78:8642',
            addedAt: '2026-06-28T00:00:00Z',
          },
        ]}
        activeProfileId="mini"
        onSearchMac={jest.fn()}
      />,
    );
    expect(getByText('Tailscale connected')).toBeTruthy();
    expect(queryByText('Same home Wi‑Fi')).toBeNull();
  });

  it('allows manual connection using a custom IP or URL', async () => {
    const onAddProfile = jest.fn().mockResolvedValue(undefined);
    const connectSpy = jest
      .spyOn(manualGatewayConnection, 'connectManualGatewayAddress')
      .mockImplementationOnce(async ({ fallbackLabel, gatewayUrl, persistProfile }) => {
        await persistProfile(fallbackLabel, gatewayUrl);
      });
    const { getByTestId } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        onSearchMac={jest.fn()}
        onAddProfile={onAddProfile}
      />,
    );

    expect(getByTestId('chat-manual-input')).toBeTruthy();
    expect(getByTestId('chat-manual-submit')).toBeTruthy();

    // Type a simple Tailscale IP address
    fireEvent.changeText(getByTestId('chat-manual-input'), '100.87.85.85');
    fireEvent.press(getByTestId('chat-manual-submit'));

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalledWith({
        fallbackLabel: 'Tailscale computer',
        gatewayUrl: 'http://100.87.85.85:8642',
        persistProfile: onAddProfile,
      });
      expect(onAddProfile).toHaveBeenCalledWith('Tailscale computer', 'http://100.87.85.85:8642');
    });
    connectSpy.mockRestore();
  });

  it('displays an error message for invalid manual connection entries', async () => {
    const { getByTestId, findByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
        onSearchMac={jest.fn()}
        onAddProfile={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    // Test invalid input handling
    fireEvent.changeText(getByTestId('chat-manual-input'), '   ');
    fireEvent.press(getByTestId('chat-manual-submit'));

    expect(await findByText('Please enter an IP address or URL.')).toBeTruthy();
  });
});
