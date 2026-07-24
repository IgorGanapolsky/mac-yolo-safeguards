import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import TailscaleDiscoveryBanner from '../components/TailscaleDiscoveryBanner';

describe('TailscaleDiscoveryBanner', () => {
  it('keeps sibling host names while only the tapped chip shows Adding', async () => {
    let resolveAdd: (() => void) | undefined;
    const onAdd = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        }),
    );

    const { getByTestId, getByText, queryAllByText } = render(
      <TailscaleDiscoveryBanner
        discoveries={[
          {
            gatewayUrl: 'http://100.94.135.78:8642',
            hostname: 'Igors-Mac-mini.local',
            label: 'Igors-Mac-mini',
          },
          {
            gatewayUrl: 'http://100.87.85.85:8642',
            hostname: 'Igors-MacBook-Pro.local',
            label: 'Igors-MacBook-Pro',
          },
        ]}
        onAdd={onAdd}
      />,
    );

    fireEvent.press(getByTestId('tailscale-add-igors-mac-mini'));

    expect(getByText('Adding…')).toBeTruthy();
    expect(getByText('Add Igors-MacBook-Pro')).toBeTruthy();
    expect(queryAllByText('Adding…')).toHaveLength(1);
    expect(onAdd).toHaveBeenCalledTimes(1);

    resolveAdd?.();
    await waitFor(() => {
      expect(getByText('Add Igors-Mac-mini')).toBeTruthy();
    });
  });

  it('renders one Add chip per physical Mac when MagicDNS+CGNAT twins arrive', () => {
    const { queryAllByText, getByText } = render(
      <TailscaleDiscoveryBanner
        discoveries={[
          {
            gatewayUrl: 'http://100.94.135.78:8642',
            hostname: 'Igors-Mac-mini.local',
            label: 'Igors-Mac-mini',
          },
          {
            gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
            hostname: 'Igors-Mac-mini.local',
            label: 'Igors-Mac-mini',
          },
          {
            gatewayUrl: 'http://100.87.85.85:8642',
            hostname: 'Igors-MacBook-Pro.local',
            label: 'Igors-MacBook-Pro',
          },
          {
            gatewayUrl: 'http://igors-macbook-pro.tail12aa33.ts.net:8642',
            hostname: 'Igors-MacBook-Pro.local',
            label: 'Igors-MacBook-Pro',
          },
        ]}
      />,
    );

    expect(queryAllByText('Add Igors-Mac-mini')).toHaveLength(1);
    expect(queryAllByText('Add Igors-MacBook-Pro')).toHaveLength(1);
    expect(getByText('Computer found on Tailscale')).toBeTruthy();
  });
});
