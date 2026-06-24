import React from 'react';
import { render } from '@testing-library/react-native';
import ChatConnectionPanel from '../components/ChatConnectionPanel';

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

    expect(getByText('Saved computers')).toBeTruthy();
    expect(getByTestId('gateway-profile-list')).toBeTruthy();
    expect(getByTestId('select-gateway-profile-p1')).toBeTruthy();
  });

  it('does not call an unreachable active computer active now', () => {
    const { getByText, queryByText } = render(
      <ChatConnectionPanel
        connectionState="disconnected"
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

    expect(getByText('Selected · cannot reach')).toBeTruthy();
    expect(queryByText('Active now')).toBeNull();
  });
});
