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
  synthesizeLiveUsbProfile,
  resolveProfileFromPickerRows,
  profileConnectionRouteDisplayLabel,
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
    expect(lines.title).toBe('Igors-MacBook-Pro (Mac Pro)');
    expect(lines.detail).toBe('10.2.29.103:8642');
  });

  it('lists Mac mini from Tailscale without USB MacBook when USB is not live', () => {
    const profiles = profilesForSwitchComputerPicker([
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
    ]);
    expect(profiles.map((p) => p.id)).toEqual(['mac_mini_ts']);
    expect(profilePickerLines(profiles[0]).title).toBe('Igors-Mac-mini');
    expect(profilePickerLines(profiles[0]).detail).toBe('Tailscale · 100.94.135.78:8642');
  });

  it('collapses live USB + Tailscale Mac Pro into one physical-machine row', () => {
    const profiles = profilesForSwitchComputerPicker(
      [
        {
          id: 'mac_book_ts',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://igors-macbook-pro.tail12aa33.ts.net:8642',
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
      {
        activeProfileId: 'mac_mini_ts',
        liveUsb: {
          reachable: true,
          hostname: 'Igors-MacBook-Pro.local',
        },
      },
    );
    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => profileConnectionRouteLabel(p, true))).toEqual([
      'USB',
      'Tailscale',
    ]);
    const usbRow = profiles[0];
    const mbpTs = profiles.find((p) => p.id === 'mac_book_ts');
    expect(usbRow).toBeTruthy();
    expect(mbpTs).toBeUndefined();
    expect(profilePickerLines(usbRow!, { cablePluggedIn: true }).title).toBe(
      'Igors-MacBook-Pro (Mac Pro)',
    );
    expect(profiles[1].id).toBe('mac_mini_ts');
    expect(profilePickerLines(profiles[1]).title).toBe('Igors-Mac-mini');
  });

  it('uses Tailscale for Mac Pro when USB is not reachable and preserves Mac mini', () => {
    const profiles = profilesForSwitchComputerPicker(
      [
        {
          id: 'mac_book_usb',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://127.0.0.1:8642',
          hostname: 'Igors-MacBook-Pro',
          addedAt: '2026-06-28T12:00:00Z',
        },
        {
          id: 'mac_book_ts',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://igors-macbook-pro.tail12aa33.ts.net:8642',
          hostname: 'Igors-MacBook-Pro',
          addedAt: '2026-06-28T12:00:30Z',
        },
        {
          id: 'mac_mini_ts',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini',
          addedAt: '2026-06-28T12:01:00Z',
        },
      ],
      {
        activeProfileId: 'mac_book_ts',
        liveUsb: {
          reachable: false,
          hostname: 'Igors-MacBook-Pro.local',
        },
      },
    );
    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => p.id)).toEqual(['mac_book_ts', 'mac_mini_ts']);
    expect(profiles.map((p) => profileConnectionRouteLabel(p, true))).toEqual([
      'Tailscale',
      'Tailscale',
    ]);
    expect(profilePickerLines(profiles[0]).title).toBe('Igors-MacBook-Pro (Mac Pro)');
    expect(profilePickerLines(profiles[1]).title).toBe('Igors-Mac-mini');
  });

  it('shows Tailscale endpoint instead of home LAN IP for the same Mac mini profile', () => {
    const lines = profilePickerLines({
      id: 'mac_mini_ts',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      localIp: '192.168.68.73',
      addedAt: '2026-07-08T12:00:00Z',
    });
    expect(lines.title).toBe('Igors-Mac-mini');
    expect(lines.detail).toBe('Tailscale · 100.94.135.78:8642');
    expect(lines.detail).not.toContain('192.168.68.73');
  });

  it('hides only phone-hostname Tailscale noise, keeps unnamed Mac candidates visible', () => {
    // P0 2026-07-14: an unnamed, never-connected Tailscale IP profile is exactly what a
    // freshly discovered second Mac looks like before its hostname resolves — it must render,
    // not silently vanish. Only recognizably phone-hostname rows are noise here.
    const profiles = profilesForSwitchComputerPicker(
      [
        {
          id: 'lan_stale',
          label: 'Computer',
          gatewayUrl: 'http://192.168.68.54:8642',
          localIp: '192.168.68.54',
          addedAt: '2026-07-04T19:00:00Z',
        },
        {
          id: 'mac_100_94_135_78',
          label: 'Computer',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-07-04T20:00:00Z',
          lastConnectedAt: '2026-07-04T20:48:00Z',
        },
        {
          id: 'phone_named',
          label: 'igors-s25-1',
          gatewayUrl: 'http://igors-s25-1.tail12aa33.ts.net:8642',
          addedAt: '2026-07-04T20:01:00Z',
        },
        {
          id: 'phone_ip_seed',
          label: 'Computer',
          gatewayUrl: 'http://100.70.124.54:8642',
          addedAt: '2026-07-04T20:02:00Z',
        },
        {
          id: 'usb',
          label: 'Computer via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-07-04T20:03:00Z',
        },
        {
          id: 'localhost',
          label: 'localhost',
          gatewayUrl: 'http://localhost:8642',
          addedAt: '2026-07-04T20:04:00Z',
        },
      ],
      { activeProfileId: 'mac_100_94_135_78' },
    );

    // phone_named (recognizable Android hostname) is still hidden; the two unnamed
    // Tailscale/LAN IP candidates now render instead of being silently dropped.
    expect(profiles.map((profile) => profile.id).sort()).toEqual([
      'lan_stale',
      'mac_100_94_135_78',
      'phone_ip_seed',
    ]);
    const miniIp = profiles.find((p) => p.id === 'mac_100_94_135_78')!;
    expect(profilePickerLines(miniIp).title).toBe('Tailscale 100.94.135.78');
    expect(profilePickerLines(miniIp).detail).toBe('Tailscale · 100.94.135.78:8642');
  });

  it('renders every discovered machine even before its hostname resolves (found 2 -> 2 rows)', () => {
    // Reproduces the P0: "Find computers" reports foundCount=2 (MacBook Pro over USB +
    // Mac mini over Tailscale), but the Mac mini's /health hostname probe hasn't resolved
    // yet, so it is saved as a generic, never-connected, inactive Tailscale-IP profile.
    // Both machines must appear in "Choose your computer" — an undiscovered name is not a
    // reason to hide a reachable computer.
    const macBookUsb = {
      id: 'mac_book_usb',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      addedAt: '2026-07-14T16:00:00Z',
    };
    const freshlyDiscoveredMini = {
      id: 'mac_100_94_135_78',
      label: 'Computer',
      gatewayUrl: 'http://100.94.135.78:8642',
      localIp: '100.94.135.78',
      addedAt: '2026-07-14T16:24:00Z',
      // no hostname, no lastConnectedAt, not the active profile — worst case for naming.
    };
    const profiles = profilesForSwitchComputerPicker([macBookUsb, freshlyDiscoveredMini], {
      activeProfileId: 'mac_book_usb',
      liveUsb: { reachable: true, hostname: 'Igors-MacBook-Pro.local' },
    });

    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => p.id)).toEqual(['mac_book_usb', 'mac_100_94_135_78']);
    expect(profilePickerLines(profiles[1]).title).toBe('Tailscale 100.94.135.78');
    expect(profilePickerLines(profiles[1]).detail).toBe('Tailscale · 100.94.135.78:8642');
  });

  it('hides loopback Mac mini from switch picker when only USB route is saved and USB is not live', () => {
    const profiles = profilesForSwitchComputerPicker([
      {
        id: 'mac_book_lan',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://192.168.68.71:8642',
        localIp: '192.168.68.71',
        hostname: 'Igors-MacBook-Pro',
        addedAt: '2026-07-08T12:00:00Z',
      },
      {
        id: 'mac_igors_mac_mini',
        label: 'Igors-Mac-mini',
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-Mac-mini',
        addedAt: '2026-07-08T12:01:00Z',
      },
    ]);
    expect(profiles.map((p) => p.id)).toEqual(['mac_book_lan']);
    expect(
      profiles.some(
        (p) =>
          profileDisplayName(p).includes('Mac-mini') &&
          profileConnectionRouteLabel(p, true) === 'USB',
      ),
    ).toBe(false);
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


  it('synthesizes live USB row when reverse is reachable and no matching saved loopback', () => {
    const profiles = profilesForSwitchComputerPicker(
      [
        {
          id: 'mac_mini_ts',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini',
          localIp: '100.94.135.78',
          addedAt: '2026-06-28T12:01:00Z',
        },
      ],
      {
        liveUsb: { reachable: true, hostname: 'Igors-MacBook-Pro.local' },
      },
    );
    expect(profiles[0].gatewayUrl).toContain('127.0.0.1');
    expect(profiles[0].label).toMatch(/MacBook-Pro/i);
    expect(profilePickerLines(profiles[0], { cablePluggedIn: true }).detail).toMatch(/cable/i);
    expect(profileConnectionRouteDisplayLabel(profiles[0], true, { cablePluggedIn: true })).toBe(
      'Plugged in with this cable',
    );
  });

  it('resolveProfileFromPickerRows returns synthesized USB for ensure-select', () => {
    const usb = synthesizeLiveUsbProfile('Igors-MacBook-Pro.local');
    const mini = {
      id: 'mac_mini_ts',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      addedAt: '2026-06-28T12:01:00Z',
    };
    expect(resolveProfileFromPickerRows(usb.id, [usb, mini], [mini])).toEqual(usb);
    expect(resolveProfileFromPickerRows('missing', [usb], [mini])).toBeNull();
  });

});
