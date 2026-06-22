import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  upsertDiscoveredProfile,
  selectProfile,
  removeProfile,
  migrateLegacyGateway,
  profileIdFromGatewayUrl,
  dedupeGatewayProfiles,
  formatProfileLabel,
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

  it('shows friendly Mac at IP when only IP is known', () => {
    const label = formatProfileLabel({
      id: 'mac_192_168_12_138',
      label: '192.168.12.138',
      gatewayUrl: 'http://192.168.12.138:8642',
      localIp: '192.168.12.138',
      addedAt: '2026-06-18T12:00:00.000Z',
    });
    expect(label).toBe('Mac at 192.168.12.138');
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
});
