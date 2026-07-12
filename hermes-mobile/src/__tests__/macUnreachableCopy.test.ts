import {
  alternateTailscaleDiscoveries,
  formatSavedMacUnreachableBanner,
  reconnectingToMacCopy,
  savedMacUnreachableStatus,
  savedMacUnreachableTitle,
  shouldOfferSwitchComputer,
  shouldShowActiveReconnectingCopy,
  switchComputerHintBody,
} from '../utils/macUnreachableCopy';

describe('macUnreachableCopy', () => {
  it('names the saved Mac when unreachable', () => {
    expect(savedMacUnreachableTitle('Igors-Mac-mini')).toBe(
      "Igors-Mac-mini isn't reachable right now",
    );
    expect(savedMacUnreachableStatus('Igors-Mac-mini')).toBe('Igors-Mac-mini unreachable');
  });

  it('stops reconnecting copy after heal budget is spent', () => {
    expect(
      shouldShowActiveReconnectingCopy({
        macRetryBusy: false,
        healInFlight: true,
        healExhausted: true,
      }),
    ).toBe(false);
    expect(
      shouldShowActiveReconnectingCopy({
        macRetryBusy: false,
        healInFlight: true,
        healExhausted: false,
      }),
    ).toBe(true);
  });

  it('offers switch computer when heal exhausted with alternates', () => {
    expect(
      shouldOfferSwitchComputer({
        healExhausted: true,
        activeProfileReachable: false,
        profiles: [
          { id: 'mini', label: 'Igors-Mac-mini', gatewayUrl: 'http://100.94.135.78:8642', addedAt: '' },
          { id: 'pro', label: 'Igors-MacBook-Pro', gatewayUrl: 'http://100.118.0.126:8642', addedAt: '' },
        ],
        activeProfileId: 'mini',
      }),
    ).toBe(true);
  });

  it('filters tailscale discoveries to other machines', () => {
    const miniProfile = {
      id: 'mini',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      addedAt: '',
    };
    const discoveries = alternateTailscaleDiscoveries({
      profiles: [miniProfile],
      activeProfile: miniProfile,
      discoveries: [
        {
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          label: 'Igors-Mac-mini',
        },
        {
          gatewayUrl: 'http://100.118.0.126:8642',
          hostname: 'Igors-MacBook-Pro.local',
          label: 'Igors-MacBook-Pro',
        },
      ],
    });
    expect(discoveries).toHaveLength(1);
    expect(discoveries[0].label).toBe('Igors-MacBook-Pro');
  });

  it('formats retry banner with switch guidance', () => {
    expect(
      formatSavedMacUnreachableBanner({
        macLabel: 'Igors-Mac-mini',
        machineEndpoint: 'Tailscale',
      }),
    ).toBe("Can't reach Igors-Mac-mini (Tailscale) — switch computer above");
  });

  it('builds switch hint copy for tailnet alternates', () => {
    expect(
      switchComputerHintBody({
        macLabel: 'Igors-Mac-mini',
        alternateProfileCount: 0,
        tailscaleDiscoveryCount: 1,
      }),
    ).toContain('Tap Switch below');
  });

  it('builds reconnecting copy with machine name', () => {
    expect(reconnectingToMacCopy('Igors-Mac-mini')).toBe('Reconnecting to Igors-Mac-mini…');
  });
});
