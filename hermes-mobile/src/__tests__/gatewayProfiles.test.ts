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
  applyHealDiscoveredUrl,
  activeProfile,
  profileMachineKey,
  resolvePreferredActiveProfileId,
  shouldActivateDiscoveredUrl,
  profilesForActiveMachine,
  shouldProbeGatewayUrlForActiveProfile,
  resolveHealPersistDecision,
} from '../services/gatewayProfiles';
import { EMPTY_GATEWAY_PROFILE_STATE } from '../types/gatewayProfile';

describe('gatewayProfiles', () => {
  beforeEach(async () => {
    await gatewayProfiles.clear();
  });

  it('creates stable profile ids from gateway URL', () => {
    expect(profileIdFromGatewayUrl('http://192.168.12.208:8642')).toBe('mac_192_168_12_208');
  });

  it('upserts and selects profiles with distinct hostname labels', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://192.168.12.208:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '192.168.12.208',
    }, true);
    expect(state.profiles.length).toBe(1);
    expect(state.profiles[0].label).toBe('Igors-MacBook-Pro');
    expect(state.activeProfileId).toBe('mac_192_168_12_208');

    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://192.168.12.50:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '192.168.12.50',
    }, false);
    expect(state.profiles.length).toBe(2);
    expect(state.profiles.map((p) => p.label).sort()).toEqual(
      ['Igors-Mac-mini', 'Igors-MacBook-Pro'].sort(),
    );

    state = selectProfile(state, 'mac_192_168_12_50');
    expect(state.activeProfileId).toBe('mac_192_168_12_50');
  });

  it('does not merge Mac Pro into mini when poisoned pair.json shares the MacBook LAN IP', () => {
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://100.87.85.85:8642',
      hostname: 'Igors-MacBook-Pro.local',
      localIp: '192.168.68.69',
      label: 'Igors-MacBook-Pro',
    }, true);
    state = upsertDiscoveredProfile(state, {
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '192.168.68.69',
      label: 'Igors-Mac-mini',
    }, false);
    expect(state.profiles.length).toBe(2);
    const urls = state.profiles.map((p) => p.gatewayUrl).sort();
    expect(urls).toEqual(['http://100.87.85.85:8642', 'http://100.94.135.78:8642'].sort());
    expect(state.profiles.some((p) => /MacBook-Pro/i.test(p.label || p.hostname || ''))).toBe(true);
    expect(state.profiles.some((p) => /Mac-mini/i.test(p.label || p.hostname || ''))).toBe(true);
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

  it('collapses multiple loopback/USB profiles (localhost + Computer via USB) into one', () => {
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
          id: 'localhost_usb',
          label: 'localhost',
          gatewayUrl: 'http://localhost:8642',
          addedAt: '2026-07-04T11:00:00.000Z',
        },
      ],
      activeProfileId: null,
    });
    expect(profiles).toHaveLength(1);
  });

  it('hydrates generic USB loopback with sibling Mac hostname on sanitize', () => {
    const state = sanitizeGatewayProfileState({
      profiles: [
        {
          id: 'mac_usb_loopback',
          label: 'Computer via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          localIp: '127.0.0.1',
          addedAt: '2026-07-13T00:00:00.000Z',
        },
        {
          id: 'mac_tail',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://100.87.85.85:8642',
          hostname: 'Igors-MacBook-Pro.local',
          addedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
      activeProfileId: 'mac_usb_loopback',
    });
    expect(state.profiles).toHaveLength(1);
    expect(profileDisplayName(state.profiles[0])).toBe('Igors-MacBook-Pro');
    expect(state.profiles[0].gatewayUrl).toBe('http://100.87.85.85:8642');
    expect(state.activeProfileId).toBe(state.profiles[0].id);
    expect(state.profiles.some((p) => p.id === 'mac_usb_loopback')).toBe(false);
  });

  it('migrates legacy single gateway into first profile', () => {
    const state = migrateLegacyGateway(EMPTY_GATEWAY_PROFILE_STATE, 'http://127.0.0.1:8642', '192.168.12.208');
    expect(state.profiles[0]?.gatewayUrl).toBe('http://192.168.12.208:8642');
    expect(state.activeProfileId).toBe('mac_192_168_12_208');
  });

  it('does not rewrite a saved loopback profile to an owner-specific machine', () => {
    const state = sanitizeGatewayProfileState({
      profiles: [
        {
          id: 'mac_usb',
          label: 'Workstation',
          gatewayUrl: 'http://127.0.0.1:8642',
          hostname: 'Workstation.local',
          addedAt: '2026-07-08T12:00:00Z',
        },
      ],
      activeProfileId: 'mac_usb',
    });
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0].gatewayUrl).toBe('http://127.0.0.1:8642');
    expect(state.profiles[0].localIp).toBe('127.0.0.1');
    expect(profileDisplayName(state.profiles[0])).toBe('Workstation');
  });

  it('prefers Tailscale host over home LAN IP in profile labels', () => {
    const label = formatProfileLabel({
      id: 'mac_mini_ts',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      localIp: '192.168.68.73',
      addedAt: '2026-07-08T12:00:00.000Z',
    });
    expect(label).toBe('Igors-Mac-mini (100.94.135.78)');
    expect(label).not.toContain('192.168.68.73');
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

  it('stores MagicDNS short name as profile label when health has no hostname', () => {
    const state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
      localIp: '192.168.68.56',
    }, true);
    expect(state.profiles[0].label).toBe('igors-mac-mini');
    expect(state.profiles[0].gatewayUrl).toBe('http://igors-mac-mini.tail12aa33.ts.net:8642');
  });

  it('migrates generic Computer labels to hostname on sanitize load', () => {
    const state = sanitizeGatewayProfileState({
      profiles: [
        {
          id: 'mac_mini',
          label: 'Computer',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-07-04T10:00:00Z',
        },
        {
          id: 'mac_book',
          label: 'Computer via USB',
          hostname: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://127.0.0.1:8642',
          localIp: '127.0.0.1',
          addedAt: '2026-07-04T11:00:00Z',
        },
        {
          id: 'lan_stale',
          label: 'Computer 192.168.88.54',
          hostname: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.88.54:8642',
          localIp: '192.168.88.54',
          addedAt: '2026-07-04T12:00:00Z',
        },
      ],
      activeProfileId: 'mac_mini',
    });
    expect(state.profiles.map((p) => p.label).sort()).toEqual(
      ['Igors-Mac-mini', 'Igors-MacBook-Pro'].sort(),
    );
    const mini = state.profiles.find((p) => p.label === 'Igors-Mac-mini');
    expect(mini).toBeTruthy();
    expect(profileDisplayName(mini!)).toBe('Igors-Mac-mini');
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
    expect(name).toBe('Tailscale 100.94.135.78');
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

  it('resolvePreferredActiveProfileId keeps last-used; default skips USB; preferUsb opt-in', () => {
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
    const macbookId = state.profiles.find((p) => p.label === 'Igors-MacBook-Pro')?.id;
    // Default: never auto-steal to USB over a paired Tailscale/LAN Mac
    expect(resolvePreferredActiveProfileId(noActive)).toBe(macbookId);
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

  it('applyHealDiscoveredUrl keeps activeProfileId when another Mac is reachable', () => {
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
    const next = applyHealDiscoveredUrl(
      state,
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-MacBook-Pro',
      },
      true,
    );
    expect(profileMachineKey(activeProfile(next)!)).toBe('igors-mac-mini');
    expect(next.activeProfileId).not.toBe('mac_book_tail');
  });

  it('applyHealDiscoveredUrl updates active profile URL for same-machine Tailscale heal', () => {
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
          id: 'mac_mini_tail',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-06-28T00:00:01Z',
        },
      ],
      activeProfileId: 'mac_mini',
    });
    const next = applyHealDiscoveredUrl(
      state,
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.56',
      },
      true,
    );
    const healedActive = activeProfile(next);
    expect(profileMachineKey(healedActive!)).toBe('igors-mac-mini');
    expect(healedActive?.gatewayUrl).toBe('http://100.94.135.78:8642');
  });

  it('profilesForActiveMachine scopes heal candidates to the selected computer', () => {
    const profiles = [
      {
        id: 'mini',
        label: 'Igors-Mac-mini',
        hostname: 'Igors-Mac-mini',
        gatewayUrl: 'http://100.94.135.78:8642',
        addedAt: '2026-06-28T00:00:00Z',
      },
      {
        id: 'book',
        label: 'Igors-MacBook-Pro',
        hostname: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://192.168.68.71:8642',
        localIp: '192.168.68.71',
        addedAt: '2026-06-28T00:00:01Z',
      },
    ];
    expect(profilesForActiveMachine(profiles, 'mini').map((p) => p.id)).toEqual(['mini']);
  });

  it('resolveHealPersistDecision blocks cross-machine gateway repointing', () => {
    const state = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mini',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-06-28T00:00:00Z',
        },
        {
          id: 'book',
          label: 'Igors-MacBook-Pro',
          hostname: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.68.71:8642',
          localIp: '192.168.68.71',
          addedAt: '2026-06-28T00:00:01Z',
        },
      ],
      activeProfileId: 'mini',
    });
    const decision = resolveHealPersistDecision(state, 'http://192.168.68.71:8642', true);
    expect(decision.catalogOnly).toBe(true);
    expect(decision.returnUrl).toBe('http://100.94.135.78:8642');
    expect(decision.requestedActivation).toBe(false);
  });

  it('shouldProbeGatewayUrlForActiveProfile rejects another Mac LAN IP', () => {
    const state = dedupeGatewayProfiles({
      profiles: [
        {
          id: 'mini',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          addedAt: '2026-06-28T00:00:00Z',
        },
        {
          id: 'book',
          label: 'Igors-MacBook-Pro',
          hostname: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://192.168.68.71:8642',
          localIp: '192.168.68.71',
          addedAt: '2026-06-28T00:00:01Z',
        },
      ],
      activeProfileId: 'mini',
    });
    expect(
      shouldProbeGatewayUrlForActiveProfile(state, 'http://192.168.68.71:8642'),
    ).toBe(false);
    expect(
      shouldProbeGatewayUrlForActiveProfile(state, 'http://100.94.135.78:8642'),
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
