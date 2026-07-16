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
});
