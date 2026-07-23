import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import GatewayProfilePicker from '../components/GatewayProfilePicker';
import type { GatewayProfile } from '../types/gatewayProfile';

const profiles: GatewayProfile[] = [
  {
    id: 'mac_192_168_12_208',
    label: 'Mac Pro',
    gatewayUrl: 'http://192.168.12.208:8642',
    localIp: '192.168.12.208',
    addedAt: '2026-06-18T12:00:00.000Z',
  },
  {
    id: 'mac_192_168_12_50',
    label: 'Mac Mini',
    gatewayUrl: 'http://192.168.12.50:8642',
    localIp: '192.168.12.50',
    addedAt: '2026-06-18T12:00:00.000Z',
  },
  {
    id: 'mac_usb',
    label: 'Test Laptop',
    gatewayUrl: 'http://127.0.0.1:8642',
    addedAt: '2026-06-18T12:00:00.000Z',
  },
];

describe('GatewayProfilePicker', () => {
  it('renders saved Mac profiles', () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={onSelect}
      />,
    );
    expect(getByTestId('gateway-profile-list')).toBeTruthy();
    expect(getByText(/Mac Pro/)).toBeTruthy();
    expect(getByText(/Mac Mini/)).toBeTruthy();
  });

  it('hides MacScanProgressCard when hideScanCard is set (unified picker status)', () => {
    const { queryByTestId, getByTestId } = render(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={jest.fn()}
        scanning
        scanProgress={{
          stage: 'gateway_health',
          completedHosts: 1,
          totalHosts: 4,
          foundCount: 0,
        }}
        hideScanCard
      />,
    );
    expect(queryByTestId('mac-scan-progress')).toBeNull();
    expect(getByTestId('gateway-profile-list')).toBeTruthy();
    expect(getByTestId('gateway-profile-item-mac_192_168_12_208')).toBeTruthy();
  });

  it('calls onSelect when profile tapped', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByTestId('select-gateway-profile-mac_192_168_12_50'));
    expect(onSelect).toHaveBeenCalledWith(
      'mac_192_168_12_50',
      expect.objectContaining({ id: 'mac_192_168_12_50' }),
    );
  });

  it('shows reachability hints when multiple profiles and off Wi-Fi', () => {
    const { getByTestId } = render(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={jest.fn()}
        wifiConnected={false}
        showReachabilityHints
      />,
    );
    expect(getByTestId('gateway-profile-item-mac_192_168_12_208')).toHaveTextContent(
      /Needs home Wi‑Fi or Tailscale/,
    );
    expect(getByTestId('gateway-profile-item-mac_192_168_12_50')).toHaveTextContent(
      /Needs home Wi‑Fi or Tailscale/,
    );
    expect(getByTestId('gateway-profile-item-mac_usb')).toHaveTextContent(/USB|cable|Cable/i);
  });

  it('passes synthesized live USB profile on tap when cable is plugged in', () => {
    const liveUsb = {
      id: 'mac_127_0_0_1_igors_macbook_pro',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro.local',
      localIp: '127.0.0.1',
      addedAt: '2026-07-14T05:00:00.000Z',
    };
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <GatewayProfilePicker
        profiles={[liveUsb, profiles[1]]}
        activeProfileId="mac_192_168_12_50"
        onSelect={onSelect}
        liveUsb={{ reachable: true, hostname: 'Igors-MacBook-Pro.local' }}
        showReachabilityHints
      />,
    );
    fireEvent.press(getByTestId(`select-gateway-profile-${liveUsb.id}`));
    expect(onSelect).toHaveBeenCalledWith(
      liveUsb.id,
      expect.objectContaining({
        gatewayUrl: 'http://127.0.0.1:8642',
        label: 'Igors-MacBook-Pro',
      }),
    );
  });

  it('shows amber needs re-pair for active profile when auth fails', () => {
    const { getByTestId } = render(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={jest.fn()}
        activeReachable={false}
        authNeedsRepair
        wifiConnected
        showReachabilityHints
      />,
    );
    expect(getByTestId('gateway-profile-item-mac_192_168_12_208')).toHaveTextContent(
      /Needs re-pair/,
    );
    expect(getByTestId('gateway-profile-item-mac_192_168_12_208')).not.toHaveTextContent(
      /Connected/,
    );
  });

  it('labels destructive action Forget (not Remove) for saved non-USB computers', () => {
    const onRemove = jest.fn();
    const { getByTestId, queryByText } = render(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={jest.fn()}
        onRemove={onRemove}
      />,
    );
    const forget = getByTestId('remove-gateway-profile-mac_192_168_12_50');
    expect(forget).toHaveTextContent('Forget this Mac');
    expect(queryByText('Remove')).toBeNull();
    expect(forget.props.accessibilityRole).toBe('button');
    expect(forget.props.hitSlop).toEqual({ top: 14, bottom: 14, left: 14, right: 14 });
    fireEvent.press(forget);
    expect(onRemove).toHaveBeenCalledWith('mac_192_168_12_50');
  });

  it('places Forget below the full-width machine card so long hostnames stay readable', () => {
    const longHostname = 'Igors-MacBook-Pro-with-a-very-long-hostname';
    const longProfile = {
      ...profiles[0],
      id: 'long-hostname',
      label: longHostname,
      hostname: `${longHostname}.local`,
    };
    const { getByTestId, getByText } = render(
      <GatewayProfilePicker
        profiles={[longProfile, profiles[1]]}
        activeProfileId={longProfile.id}
        onSelect={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(getByTestId(`gateway-profile-item-${longProfile.id}`)).toHaveStyle({
      flexDirection: 'column',
    });
    expect(getByText(`${longHostname} (Mac Pro)`).props.numberOfLines).toBe(2);
    expect(getByTestId(`remove-gateway-profile-${longProfile.id}`)).toHaveTextContent(
      'Forget this Mac',
    );
  });

  it('never paints more than one Connected/selected radio (duplicate profile ids)', () => {
    const sharedId = 'mac_100_94_135_78';
    const macBookAway = {
      id: sharedId,
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://100.87.85.85:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '100.87.85.85',
      addedAt: '2026-07-23T14:00:00.000Z',
    };
    const miniIp = {
      id: sharedId,
      label: 'Tailscale 100.94.135.78',
      gatewayUrl: 'http://100.94.135.78:8642',
      localIp: '100.94.135.78',
      addedAt: '2026-07-23T14:01:00.000Z',
    };
    const usb = {
      id: 'mac_igors_macbook_pro',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      addedAt: '2026-07-23T14:00:30.000Z',
    };
    const { getByTestId, queryByTestId } = render(
      <GatewayProfilePicker
        profiles={[usb, macBookAway, miniIp]}
        activeProfileId={sharedId}
        onSelect={jest.fn()}
        activeReachable
        showReachabilityHints
        liveUsb={{ reachable: true, hostname: 'Igors-MacBook-Pro.local' }}
      />,
    );
    expect(getByTestId(`select-gateway-profile-${sharedId}`).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(getByTestId('select-gateway-profile-mac_igors_macbook_pro').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    expect(getByTestId(`gateway-profile-item-${sharedId}`)).toHaveTextContent(/Connected/);
    expect(getByTestId('gateway-profile-item-mac_igors_macbook_pro')).not.toHaveTextContent(
      /Connected/,
    );
    // Second duplicate-id row is not mounted after dedupe.
    expect(queryByTestId('select-gateway-profile-mac_100_94_135_78')).toBeTruthy();
  });

  it('marks exactly one row selected when USB + Tailscale MacBook + mini are listed', () => {
    const macBookUsb = {
      id: 'mac_book_usb',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      addedAt: '2026-07-23T14:00:00.000Z',
    };
    const macBookTs = {
      id: 'mac_book_ts',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://100.87.85.85:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '100.87.85.85',
      addedAt: '2026-07-23T14:00:30.000Z',
    };
    const miniTs = {
      id: 'mac_mini_ts',
      label: 'Tailscale 100.94.135.78',
      gatewayUrl: 'http://100.94.135.78:8642',
      localIp: '100.94.135.78',
      addedAt: '2026-07-23T14:01:00.000Z',
    };
    const { getByTestId } = render(
      <GatewayProfilePicker
        profiles={[macBookUsb, macBookTs, miniTs]}
        activeProfileId="mac_book_ts"
        onSelect={jest.fn()}
        activeReachable
        showReachabilityHints
        liveUsb={{ reachable: true, hostname: 'Igors-MacBook-Pro.local' }}
      />,
    );
    const selectedFlags = [
      getByTestId('select-gateway-profile-mac_book_usb').props.accessibilityState?.selected,
      getByTestId('select-gateway-profile-mac_book_ts').props.accessibilityState?.selected,
      getByTestId('select-gateway-profile-mac_mini_ts').props.accessibilityState?.selected,
    ];
    expect(selectedFlags.filter(Boolean)).toHaveLength(1);
    expect(selectedFlags).toEqual([false, true, false]);
    expect(getByTestId('gateway-profile-item-mac_mini_ts')).not.toHaveTextContent(/Connected/);
    expect(getByTestId('gateway-profile-item-mac_book_ts')).toHaveTextContent(/Connected/);
  });

  it('reserves dense list minHeight and reports selected:1 under progress updates', () => {
    const { getByTestId, rerender } = render(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={jest.fn()}
        dense
        hideScanCard
        scanning
        scanProgress={{
          stage: 'gateway_health',
          completedHosts: 1,
          totalHosts: 6,
          foundCount: 0,
        }}
        activeReachable
      />,
    );
    const list = getByTestId('gateway-profile-list');
    expect(list.props.accessibilityValue).toEqual({ text: 'selected:1' });
    expect(list.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ minHeight: expect.any(Number) })]),
    );

    rerender(
      <GatewayProfilePicker
        profiles={profiles}
        activeProfileId="mac_192_168_12_208"
        onSelect={jest.fn()}
        dense
        hideScanCard
        scanning
        scanProgress={{
          stage: 'gateway_health',
          completedHosts: 5,
          totalHosts: 6,
          foundCount: 2,
        }}
        activeReachable
      />,
    );
    expect(getByTestId('gateway-profile-list').props.accessibilityValue).toEqual({
      text: 'selected:1',
    });
    const selected = [
      getByTestId('select-gateway-profile-mac_192_168_12_208').props.accessibilityState?.selected,
      getByTestId('select-gateway-profile-mac_192_168_12_50').props.accessibilityState?.selected,
      getByTestId('select-gateway-profile-mac_usb').props.accessibilityState?.selected,
    ].filter(Boolean);
    expect(selected).toHaveLength(1);
  });
});
