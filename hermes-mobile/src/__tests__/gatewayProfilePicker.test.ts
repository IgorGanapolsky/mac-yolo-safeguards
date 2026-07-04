import { profileDisplayName } from '../services/gatewayProfiles';
import {
  detectUsbHostMismatch,
  formatUsbHostMismatchMessage,
  profileConnectionRouteLabel,
  profileMatchesDiscoveredGateway,
  profileMatchesHostname,
  profilePickerLines,
  profilesForDevicePicker,
  profilesForSwitchComputerPicker,
  resolveUsbMatchingProfileId,
  shouldOfferUsbLinkRepair,
  hasOnlyLoopbackProfiles,
} from '../utils/gatewayProfilePicker';

describe('gatewayProfilePicker', () => {
  it('splits hostname and IP for picker rows', () => {
    const lines = profilePickerLines({
      id: 'mac_10_2_29_103',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://10.2.29.103:8642',
      localIp: '10.2.29.103',
      addedAt: '2026-06-24T12:00:00Z',
    });
    expect(lines.title).toBe('Igors-MacBook-Pro');
    expect(lines.detail).toBe('10.2.29.103:8642');
  });

  it('lists Mac mini from Tailscale alongside USB MacBook in switch picker', () => {
    const profiles = profilesForSwitchComputerPicker(
      [
        {
          id: 'mac_usb_loopback',
          label: 'Mac via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-28T12:00:00Z',
        },
        {
          id: 'mac_book_usb',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://127.0.0.1:8642',
          hostname: 'Igors-MacBook-Pro',
          addedAt: '2026-06-28T12:00:00Z',
        },
        {
          id: 'mac_mini_ts',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini',
          localIp: '100.94.135.78',
          addedAt: '2026-06-28T12:01:00Z',
        },
      ],
      { activeProfileId: 'mac_book_usb' },
    );
    expect(profiles.map((p) => p.id)).toEqual(['mac_book_usb', 'mac_mini_ts']);
    expect(profilePickerLines(profiles[1]).title).toBe('Igors-Mac-mini');
    expect(profilePickerLines(profiles[1]).detail).toBe('100.94.135.78:8642');
  });

  it('renders localhost loopback as a USB route instead of a computer name', () => {
    const lines = profilePickerLines({
      id: 'mac_usb',
      label: 'localhost',
      gatewayUrl: 'http://127.0.0.1:8642',
      addedAt: '2026-07-04T23:00:00Z',
    });

    expect(lines.title).toBe('Computer via USB');
  });

  it('collapses same-machine Wi-Fi aliases and keeps the active address', () => {
    const profiles = profilesForSwitchComputerPicker(
      [
        {
          id: 'mac_192_168_68_66',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.68.66:8642',
          localIp: '192.168.68.66',
          addedAt: '2026-07-04T22:00:00Z',
          lastConnectedAt: '2026-07-04T22:00:00Z',
        },
        {
          id: 'mac_192_168_68_54',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.68.54:8642',
          localIp: '192.168.68.54',
          addedAt: '2026-07-04T22:30:00Z',
          lastConnectedAt: '2026-07-04T23:00:00Z',
        },
      ],
      { activeProfileId: 'mac_192_168_68_54' },
    );

    expect(profiles.map((p) => p.id)).toEqual(['mac_192_168_68_54']);
    expect(profilePickerLines(profiles[0])).toEqual({
      title: 'Igors-MacBook-Pro',
      detail: '192.168.68.54:8642',
    });
  });

  it('ranks named computers above generic IP-only Wi-Fi rows', () => {
    const profiles = profilesForSwitchComputerPicker([
      {
        id: 'mac_192_168_68_54',
        label: '192.168.68.54',
        gatewayUrl: 'http://192.168.68.54:8642',
        localIp: '192.168.68.54',
        addedAt: '2026-07-04T23:00:00Z',
      },
      {
        id: 'mac_mini',
        label: 'Igors-Mac-mini',
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
        hostname: 'igors-mac-mini.tail12aa33.ts.net',
        addedAt: '2026-07-04T22:00:00Z',
      },
    ]);

    expect(profiles.map((p) => profilePickerLines(p).title)).toEqual([
      'Igors-Mac-mini',
      'Computer 192.168.68.54',
    ]);
  });

  it('shows MagicDNS machine names instead of generic Computer rows', () => {
    const profiles = profilesForSwitchComputerPicker([
      {
        id: 'mac_magicdns',
        label: 'Computer',
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
        addedAt: '2026-07-03T20:00:00Z',
      },
      {
        id: 'mac_tail_ip',
        label: 'Computer',
        gatewayUrl: 'http://100.94.135.78:8642',
        localIp: '100.94.135.78',
        addedAt: '2026-07-03T20:01:00Z',
      },
    ]);

    expect(profilePickerLines(profiles[0]).title).toBe('igors-mac-mini');
    expect(profilePickerLines(profiles[0]).detail).toBe('igors-mac-mini.tail12aa33.ts.net:8642');
    expect(profilePickerLines(profiles[1]).title).toBe('Tailscale 100.94.135.78');
  });

  it('dedupes stale duplicate MagicDNS profiles before rendering the picker', () => {
    const profiles = profilesForSwitchComputerPicker([
      {
        id: 'mac_magicdns_a',
        label: 'Computer',
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
        addedAt: '2026-07-03T20:00:00Z',
      },
      {
        id: 'mac_magicdns_b',
        label: 'igors-mac-mini.tail12aa33.ts.net',
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642/',
        addedAt: '2026-07-03T20:01:00Z',
      },
    ]);

    expect(profiles).toHaveLength(1);
    expect(profilePickerLines(profiles[0]).title).toBe('igors-mac-mini');
  });

  it('does not filter loopback profiles even when LAN profiles exist', () => {
    const profiles = profilesForDevicePicker([
      {
        id: 'junk',
        label: 'http',
        gatewayUrl: 'http://',
        addedAt: '2026-06-24T12:00:00Z',
      },
      {
        id: 'loopback',
        label: '127.0.0.1',
        gatewayUrl: 'http://127.0.0.1:8642',
        addedAt: '2026-06-24T12:00:00Z',
      },
      {
        id: 'lan',
        label: 'MacBook Pro',
        gatewayUrl: 'http://10.2.29.103:8642',
        localIp: '10.2.29.103',
        addedAt: '2026-06-24T12:00:00Z',
      },
    ]);
    expect(profiles.map((p) => p.id)).toEqual(['loopback', 'lan']);
  });

  it('matches relay worker hostnames to saved profiles', () => {
    const profile = {
      id: 'mac_mini',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://192.168.1.50:8642',
      hostname: 'Igors-Mac-mini.local',
      addedAt: '2026-06-24T12:00:00Z',
    };
    expect(profileMatchesHostname(profile, 'Igors-Mac-mini · skool_top1percent')).toBe(true);
    expect(profileMatchesHostname(profile, profileDisplayName(profile))).toBe(true);
  });

  it('detects USB host mismatch when health hostname differs from active profile', () => {
    const macMini = {
      id: 'mac_mini',
      label: 'Mac mini',
      gatewayUrl: 'http://10.2.29.50:8642',
      hostname: 'Igors-Mac-mini.local',
      addedAt: '2026-06-24T12:00:00Z',
    };
    const macBook = {
      id: 'mac_book',
      label: 'MacBook Pro',
      gatewayUrl: 'http://10.2.29.103:8642',
      hostname: 'Igors-MacBook-Pro.local',
      addedAt: '2026-06-24T12:00:00Z',
    };
    const mismatch = detectUsbHostMismatch({
      activeProfile: macMini,
      gatewayUrl: 'http://127.0.0.1:8642',
      healthHostname: 'Igors-MacBook-Pro.local',
      profiles: [macMini, macBook],
      macHttpOk: true,
    });
    expect(mismatch?.usbHostLabel).toBe('Igors-MacBook-Pro');
    expect(mismatch?.selectedProfileLabel).toBe('Mac mini');
    expect(mismatch?.matchingProfileId).toBe('mac_book');
    expect(formatUsbHostMismatchMessage(mismatch!)).toContain('Tap Igors-MacBook-Pro');
  });

  it('returns null when USB host matches active profile', () => {
    const macBook = {
      id: 'mac_book',
      label: 'MacBook Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro.local',
      addedAt: '2026-06-24T12:00:00Z',
    };
    expect(
      detectUsbHostMismatch({
        activeProfile: macBook,
        gatewayUrl: 'http://127.0.0.1:8642',
        healthHostname: 'Igors-MacBook-Pro.local',
        profiles: [macBook],
        macHttpOk: true,
      }),
    ).toBeNull();
  });

  it('resolves USB matching profile id for auto-select', () => {
    const macMini = {
      id: 'mac_mini',
      label: 'Mac mini',
      gatewayUrl: 'http://10.2.29.50:8642',
      hostname: 'Igors-Mac-mini.local',
      addedAt: '2026-06-24T12:00:00Z',
    };
    const macBook = {
      id: 'mac_book',
      label: 'MacBook Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro.local',
      addedAt: '2026-06-24T12:00:00Z',
    };
    expect(
      resolveUsbMatchingProfileId({
        activeProfile: macMini,
        gatewayUrl: 'http://127.0.0.1:8642',
        healthHostname: 'Igors-MacBook-Pro.local',
        profiles: [macMini, macBook],
        macHttpOk: true,
      }),
    ).toBe('mac_book');
  });

  it('shouldOfferUsbLinkRepair is false on Wi‑Fi with unreachable loopback URL', () => {
    expect(
      shouldOfferUsbLinkRepair({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
        macHttpOk: false,
      }),
    ).toBe(false);
    expect(
      shouldOfferUsbLinkRepair({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        macHttpOk: false,
      }),
    ).toBe(true);
  });

  it('shouldOfferUsbLinkRepair prefers Tailscale over USB fix on cellular', () => {
    expect(
      shouldOfferUsbLinkRepair({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        macHttpOk: false,
        tailnetProbeHostCount: 2,
      }),
    ).toBe(false);
    expect(
      shouldOfferUsbLinkRepair({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        macHttpOk: false,
        onlyLoopbackProfiles: true,
      }),
    ).toBe(false);
  });

  it('hasOnlyLoopbackProfiles detects stale USB-only saved state', () => {
    expect(
      hasOnlyLoopbackProfiles([
        {
          id: 'usb',
          label: 'Mac via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-28T00:00:00Z',
        },
      ]),
    ).toBe(true);
    expect(
      hasOnlyLoopbackProfiles([
        {
          id: 'usb',
          label: 'Mac via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-28T00:00:00Z',
        },
        {
          id: 'mini',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-06-28T00:00:01Z',
        },
      ]),
    ).toBe(false);
  });

  it('matches loopback saved profile to LAN discovery by machine name', () => {
    const loopbackProfile = {
      id: 'mac_igors_macbook_pro',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      addedAt: '2026-06-24T12:00:00Z',
    };
    expect(
      profileMatchesDiscoveredGateway(loopbackProfile, {
        gatewayUrl: 'http://192.168.1.42:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '192.168.1.42',
      }),
    ).toBe(true);
  });

  it('labels profile connection routes for multi-Mac switcher', () => {
    expect(
      profileConnectionRouteLabel(
        {
          id: 'usb',
          label: 'Mac USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-24T12:00:00Z',
        },
        true,
      ),
    ).toBe('USB');
    expect(
      profileConnectionRouteLabel(
        {
          id: 'lan',
          label: 'Mac mini',
          gatewayUrl: 'http://192.168.1.50:8642',
          addedAt: '2026-06-24T12:00:00Z',
        },
        true,
      ),
    ).toBe('Wi-Fi');
    expect(
      profileConnectionRouteLabel(
        {
          id: 'lan',
          label: 'Mac mini',
          gatewayUrl: 'http://192.168.1.50:8642',
          addedAt: '2026-06-24T12:00:00Z',
        },
        false,
      ),
    ).toBe('Needs tunnel');
    expect(
      profileConnectionRouteLabel(
        {
          id: 'tunnel',
          label: 'Mac tunnel',
          gatewayUrl: 'https://abc.ngrok-free.app',
          addedAt: '2026-06-24T12:00:00Z',
        },
        false,
      ),
    ).toBe('Tunnel');
    expect(
      profileConnectionRouteLabel(
        {
          id: 'tailscale',
          label: 'Mac mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-06-24T12:00:00Z',
        },
        false,
      ),
    ).toBe('Tailscale');
  });
});
