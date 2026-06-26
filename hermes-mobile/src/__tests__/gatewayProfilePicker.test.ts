import { profileDisplayName } from '../services/gatewayProfiles';
import {
  detectUsbHostMismatch,
  formatUsbHostMismatchMessage,
  profileConnectionRouteLabel,
  profileMatchesHostname,
  profilePickerLines,
  profilesForDevicePicker,
  resolveUsbMatchingProfileId,
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
  });
});
