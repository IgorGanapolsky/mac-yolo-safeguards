import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  upsertDiscoveredProfile,
  applyTailscaleDiscoveriesToProfileState,
  selectProfile,
  removeProfile,
  migrateLegacyGateway,
  profileIdFromGatewayUrl,
  dedupeGatewayProfiles,
  formatProfileLabel,
  profileDisplayName,
  isInvalidGatewayProfile,
  sanitizeGatewayProfileState,
  gatewayProfiles,
  resolvePreferredActiveProfileId,
  shouldActivateDiscoveredUrl,
} from '../services/gatewayProfiles';
import { EMPTY_GATEWAY_PROFILE_STATE } from '../types/gatewayProfile';

describe('gatewayProfiles', () => {
  beforeEach(async () => {
    await gatewayProfiles.clear();
  });

  it('creates stable profile ids from gateway URL', () => {
    expect(profileIdFromGatewayUrl('http://192.168.12.208:8642')).toBe('mac_192_168_12_208');
  });

  it('upserts and selects profiles', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://192.168.12.208:8642',
      hostname: 'Mac-Pro',
      localIp: '192.168.12.208',
    }, true);
    expect(state.profiles.length).toBe(1);
    expect(state.activeProfileId).toBe('mac_192_168_12_208');

    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://192.168.12.50:8642',
      hostname: 'Mac-Mini',
      localIp: '192.168.12.50',
    }, false);
    expect(state.profiles.length).toBe(2);

    state = selectProfile(state, 'mac_192_168_12_50');
    expect(state.activeProfileId).toBe('mac_192_168_12_50');
  });

  it('removes profiles and reassigns active', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://192.168.12.208:8642',
      localIp: '192.168.12.208',
    }, true);
    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://192.168.12.50:8642',
      localIp: '192.168.12.50',
    }, false);
    state = removeProfile(state, 'mac_192_168_12_208');
    expect(state.profiles.length).toBe(1);
    expect(state.activeProfileId).toBe('mac_192_168_12_50');
  });

  it('de-dupes the same machine reachable at two different DHCP LAN IPs (by hostname, not IP)', () => {
    const { profiles } = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mac_192_168_68_54',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.68.54:8642',
          hostname: 'Igors-MacBook-Pro',
          localIp: '192.168.68.54',
          addedAt: '2026-07-04T10:00:00.000Z',
        },
        {
          id: 'mac_192_168_68_66',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.68.66:8642',
          hostname: 'Igors-MacBook-Pro',
          localIp: '192.168.68.66',
          addedAt: '2026-07-04T11:00:00.000Z',
        },
      ],
      activeProfileId: null,
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].hostname).toBe('Igors-MacBook-Pro');
  });

  it('keeps a USB/loopback profile distinct from the same Mac over Wi-Fi (separate route)', () => {
    const { profiles } = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mac_usb_loopback',
          label: 'Computer via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          localIp: '127.0.0.1',
          addedAt: '2026-07-04T10:00:00.000Z',
        },
        {
          id: 'mac_192_168_68_66',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.68.66:8642',
          hostname: 'Igors-MacBook-Pro',
          localIp: '192.168.68.66',
          addedAt: '2026-07-04T11:00:00.000Z',
        },
      ],
      activeProfileId: null,
    });
    expect(profiles).toHaveLength(2);
  });

  it('migrates legacy single gateway into first profile', () => {
    const state = migrateLegacyGateway(EMPTY_GATEWAY_PROFILE_STATE, 'http://127.0.0.1:8642', '192.168.12.208');
    expect(state.profiles[0]?.gatewayUrl).toBe('http://192.168.12.208:8642');
    expect(state.activeProfileId).toBe('mac_192_168_12_208');
  });

  it('formats labels with hostname and IP', () => {
    const label = formatProfileLabel({
      id: 'mac_192_168_12_208',
      label: 'Computer Pro',
      gatewayUrl: 'http://192.168.12.208:8642',
      hostname: 'Mac-Pro',
      localIp: '192.168.12.208',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(label).toContain('Computer Pro');
    expect(label).toContain('192.168.12.208');
  });

  it('prefers hostname when stored label is only an IP', () => {
    const label = formatProfileLabel({
      id: 'mac_192_168_12_138',
      label: '192.168.12.138',
      gatewayUrl: 'http://192.168.12.138:8642',
      hostname: 'Mac-Mini',
      localIp: '192.168.12.138',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(label).toBe('Mac-Mini (192.168.12.138)');
  });

  it('shows friendly computer at IP when only IP is known', () => {
    const label = formatProfileLabel({
      id: 'mac_192_168_12_138',
      label: '192.168.12.138',
      gatewayUrl: 'http://192.168.12.138:8642',
      localIp: '192.168.12.138',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(label).toBe('Computer 192.168.12.138');
  });

  it('displays Computer via USB for loopback gateway URLs', () => {
    const label = formatProfileLabel({
      id: 'mac_127_0_0_1',
      label: '127.0.0.1',
      gatewayUrl: 'http://127.0.0.1:8642',
      localIp: '127.0.0.1',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(label).toBe('Computer via USB');
  });

  it('uses LAN URL IP when stored localIp is loopback', () => {
    expect(
      profileDisplayName({
        id: 'mac_10_2_29_103',
        label: '127.0.0.1',
        gatewayUrl: 'http://10.2.29.103:8642',
        localIp: '127.0.0.1',
        addedAt: '2026-06-18T12:00:00.000Z',
      }),
    ).toBe('Computer 10.2.29.103');
  });

  it('does not use MagicDNS host as profile label when health has no hostname', () => {
    const state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
      localIp: '192.168.68.56',
    }, true);
    expect(state.profiles[0].label).toBe('Computer');
    expect(state.profiles[0].gatewayUrl).toBe('http://igors-mac-mini.tail12aa33.ts.net:8642');
  });

  it('keeps friendly label when deduping LAN and tailnet routes', () => {
    const state = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mac_lan',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini.local',
          gatewayUrl: 'http://192.168.68.56:8642',
          localIp: '192.168.68.56',
          addedAt: '2026-06-28T00:00:00Z',
        },
        {
          id: 'mac_tail',
          label: 'igors-mac-mini.tail12aa33.ts.net',
          hostname: 'Igors-Mac-mini.local',
          gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
          localIp: '192.168.68.56',
          addedAt: '2026-06-28T00:00:01Z',
        },
      ],
      activeProfileId: 'mac_lan',
    });
    expect(state.profiles.length).toBe(1);
    expect(state.profiles[0].label).toBe('Igors-Mac-mini');
  });

  it('dedupes profiles that share the same LAN IP', () => {
    const state = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mac_a',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.12.208:8642',
          localIp: '192.168.12.208',
          addedAt: '2026-06-18T00:00:00Z',
        },
        {
          id: 'mac_b',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.12.208:8642/',
          localIp: '192.168.12.208',
          addedAt: '2026-06-19T00:00:00Z',
        },
        {
          id: 'mac_192_168_12_50',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://192.168.12.50:8642',
          localIp: '192.168.12.50',
          addedAt: '2026-06-18T00:00:00Z',
        },
      ],
      activeProfileId: 'mac_a',
    });
    expect(state.profiles.length).toBe(2);
    expect(state.profiles.some((p) => p.localIp === '192.168.12.50')).toBe(true);
    expect(state.profiles.some((p) => p.localIp === '192.168.12.208')).toBe(true);
    expect(state.activeProfileId).toBe('mac_192_168_12_208');
  });

  it('prefers Tailscale URL when deduping LAN and tailnet routes for the same Mac', () => {
    const state = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mac_lan',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://192.168.68.56:8642',
          localIp: '192.168.68.56',
          addedAt: '2026-06-28T00:00:00Z',
        },
        {
          id: 'mac_tailscale',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini.local',
          gatewayUrl: 'http://100.94.135.78:8642',
          localIp: '192.168.68.56',
          addedAt: '2026-06-28T00:00:01Z',
        },
      ],
      activeProfileId: 'mac_lan',
    });
    expect(state.profiles.length).toBe(1);
    expect(state.profiles[0].gatewayUrl).toBe('http://100.94.135.78:8642');
    expect(state.profiles[0].localIp).toBe('192.168.68.56');
  });

  it('preserves existing friendly label when upserting with only IP', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://192.168.12.208:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '192.168.12.208',
      label: 'Igors-MacBook-Pro',
    }, true);
    expect(state.profiles[0].label).toBe('Igors-MacBook-Pro');

    // Sweep/health check returns IP only or defaults
    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://192.168.12.208:8642',
      localIp: '192.168.12.208',
    }, false);
    expect(state.profiles[0].label).toBe('Igors-MacBook-Pro');
  });

  it('promotes loopback saved profile to LAN URL when the same Computer is discovered', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      label: 'Igors-MacBook-Pro',
    }, true);
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0].gatewayUrl).toBe('http://127.0.0.1:8642');

    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://192.168.1.42:8642',
      hostname: 'Igors-MacBook-Pro.local',
      localIp: '192.168.1.42',
    }, true);
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0].gatewayUrl).toBe('http://192.168.1.42:8642');
    expect(state.profiles[0].label).toBe('Igors-MacBook-Pro');
  });

  it('prefers hostname for loopback profile if hostname is present and label is Computer via USB', () => {
    const name = profileDisplayName({
      id: 'mac_127_0_0_1',
      label: 'Computer via USB',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '127.0.0.1',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(name).toBe('Igors-Mac-mini');
  });

  it('derives the device name from a Tailscale MagicDNS URL instead of a generic Computer label', () => {
    const s25 = profileDisplayName({
      id: 's25',
      label: 'Computer via Tailscale',
      gatewayUrl: 'http://igors-s25-1.tail12aa33.ts.net:8642',
      addedAt: '2026-07-03T12:00:00.000Z',
    });
    expect(s25).toBe('igors-s25-1');

    const mini = profileDisplayName({
      id: 'mini',
      label: 'Computer via Tailscale',
      gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
      addedAt: '2026-07-03T12:00:00.000Z',
    });
    expect(mini).toBe('igors-mac-mini');
  });

  it('does not invent a name for a raw Tailscale CGNAT IP profile', () => {
    const name = profileDisplayName({
      id: 'raw',
      label: 'Computer via Tailscale',
      gatewayUrl: 'http://100.94.135.78:8642',
      addedAt: '2026-07-03T12:00:00.000Z',
    });
    expect(name).not.toBe('100.94.135.78');
    expect(name.toLowerCase()).toContain('computer');
  });

  it('filters junk http-label profiles on sanitize', () => {
    const state = sanitizeGatewayProfileState({
      profiles: [
        {
          id: 'junk',
          label: 'http',
          gatewayUrl: 'http://',
          addedAt: '2026-06-18T12:00:00.000Z',
        },
        {
          id: 'mac_127_0_0_1',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-18T12:00:00.000Z',
        },
      ],
      activeProfileId: 'junk',
    });
    expect(state.profiles.length).toBe(1);
    expect(state.activeProfileId).toBe('mac_127_0_0_1');
    expect(
      isInvalidGatewayProfile({
        id: 'x',
        label: 'http',
        gatewayUrl: 'http://10.0.0.1:8642',
        addedAt: '',
      }),
    ).toBe(false);
    expect(
      isInvalidGatewayProfile({
        id: 'x',
        label: 'http',
        gatewayUrl: 'http://http:8642',
        addedAt: '',
      }),
    ).toBe(true);
  });

  it('auto-adds Tailscale discoveries as saved profiles without switching active', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      label: 'Igors-MacBook-Pro',
    }, true);
    state = applyTailscaleDiscoveriesToProfileState(state, [
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        label: 'Igors-Mac-mini',
        localIp: '100.94.135.78',
      },
    ]);
    expect(state.profiles.map((p) => p.label).sort()).toEqual(
      ['Igors-Mac-mini', 'Igors-MacBook-Pro'].sort(),
    );
    expect(state.activeProfileId).toBe('mac_igors_macbook_pro');
  });

  it('resolvePreferredActiveProfileId keeps last-used then prefers USB', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://100.94.135.78:8642',
      label: 'Igors-MacBook-Pro',
      hostname: 'Igors-MacBook-Pro',
    }, true);
    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://127.0.0.1:8642',
      label: 'Computer via USB',
    }, false);
    expect(resolvePreferredActiveProfileId(state)).toBe(state.activeProfileId);

    const noActive = { ...state, activeProfileId: null };
    const usbId = state.profiles.find((p) => p.gatewayUrl.includes('127.0.0.1'))?.id;
    expect(resolvePreferredActiveProfileId(noActive, { preferUsb: true })).toBe(usbId);
  });

  it('shouldActivateDiscoveredUrl blocks switching to a different saved Mac', () => {
    const state = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mac_mini',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://192.168.68.56:8642',
          localIp: '192.168.68.56',
          addedAt: '2026-06-28T00:00:00Z',
        },
        {
          id: 'mac_book_tail',
          label: 'Igors-MacBook-Pro',
          hostname: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-06-28T00:00:01Z',
        },
      ],
      activeProfileId: 'mac_mini',
    });
    expect(
      shouldActivateDiscoveredUrl(state, 'http://100.94.135.78:8642', true),
    ).toBe(false);
    expect(
      shouldActivateDiscoveredUrl(state, 'http://192.168.68.56:8642', true),
    ).toBe(true);
  });

  it('selectProfile stamps lastConnectedAt', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://192.168.12.208:8642',
      localIp: '192.168.12.208',
    }, true);
    state = selectProfile(state, 'mac_192_168_12_208');
    expect(state.profiles[0]?.lastConnectedAt).toBeTruthy();
  });

  it('persists to AsyncStorage', async () => {
    const state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://192.168.12.208:8642',
      localIp: '192.168.12.208',
    }, true);
    await gatewayProfiles.save(state);
    const loaded = await gatewayProfiles.load();
    expect(loaded.profiles.length).toBe(1);
    expect(loaded.activeProfileId).toBe('mac_192_168_12_208');
    await AsyncStorage.clear();
  });

  it('prevents loopback/USB profile overwrite collisions and handles dynamic upgrades', () => {
    // 1. Initial state: add Computer Mini via USB loopback
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '127.0.0.1',
    }, true);
    expect(state.profiles.length).toBe(1);
    expect(state.profiles[0].id).toBe('mac_igors_mac_mini');
    expect(state.activeProfileId).toBe('mac_igors_mac_mini');

    // 2. Discover MacBook Pro via USB loopback — should NOT overwrite Computer Mini
    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '127.0.0.1',
    }, true);
    expect(state.profiles.length).toBe(2);
    expect(state.profiles.some(p => p.id === 'mac_igors_mac_mini')).toBe(true);
    expect(state.profiles.some(p => p.id === 'mac_igors_macbook_pro')).toBe(true);
    expect(state.activeProfileId).toBe('mac_igors_macbook_pro');

    // 3. Upgrade legacy/unlabeled loopback profile (no hostname) to a named profile
    let legacyState = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://127.0.0.1:8642',
      localIp: '127.0.0.1',
    }, true);
    expect(legacyState.profiles.length).toBe(1);
    expect(legacyState.profiles[0].id).toBe('mac_127_0_0_1');

    // Now discover hostname on the same loopback connection — should merge and transition the ID
    legacyState = upsertDiscoveredProfile(legacyState, {
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '127.0.0.1',
    }, true);
    expect(legacyState.profiles.length).toBe(1);
    expect(legacyState.profiles[0].id).toBe('mac_igors_mac_mini');
    expect(legacyState.activeProfileId).toBe('mac_igors_mac_mini');
  });
});
