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
    expect(onSelect).toHaveBeenCalledWith('mac_192_168_12_50');
  });
});
