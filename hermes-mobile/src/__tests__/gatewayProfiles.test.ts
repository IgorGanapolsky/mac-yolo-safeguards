import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  upsertDiscoveredProfile,
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

  it('migrates legacy single gateway into first profile', () => {
    const state = migrateLegacyGateway(EMPTY_GATEWAY_PROFILE_STATE, 'http://127.0.0.1:8642', '192.168.12.208');
    expect(state.profiles[0]?.gatewayUrl).toBe('http://192.168.12.208:8642');
    expect(state.activeProfileId).toBe('mac_192_168_12_208');
  });

  it('formats labels with hostname and IP', () => {
    const label = formatProfileLabel({
      id: 'mac_192_168_12_208',
      label: 'Mac Pro',
      gatewayUrl: 'http://192.168.12.208:8642',
      hostname: 'Mac-Pro',
      localIp: '192.168.12.208',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(label).toContain('Mac Pro');
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
    expect(label).toBe('Mac 192.168.12.138');
  });

  it('displays Mac via USB for loopback gateway URLs', () => {
    const label = formatProfileLabel({
      id: 'mac_127_0_0_1',
      label: '127.0.0.1',
      gatewayUrl: 'http://127.0.0.1:8642',
      localIp: '127.0.0.1',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(label).toBe('Mac via USB');
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
    ).toBe('Mac 10.2.29.103');
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

  it('promotes loopback saved profile to LAN URL when the same Mac is discovered', () => {
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

  it('prefers hostname for loopback profile if hostname is present and label is Mac via USB', () => {
    const name = profileDisplayName({
      id: 'mac_127_0_0_1',
      label: 'Mac via USB',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '127.0.0.1',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(name).toBe('Igors-Mac-mini');
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
    ).toBe(true);
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
    // 1. Initial state: add Mac Mini via USB loopback
    let state = upsertDiscoveredProfile(EMPTY_GATEWAY_PROFILE_STATE, {
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '127.0.0.1',
    }, true);
    expect(state.profiles.length).toBe(1);
    expect(state.profiles[0].id).toBe('mac_igors_mac_mini');
    expect(state.activeProfileId).toBe('mac_igors_mac_mini');

    // 2. Discover MacBook Pro via USB loopback — should NOT overwrite Mac Mini
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
