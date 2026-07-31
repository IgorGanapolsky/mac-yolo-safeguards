import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  gatewayProfiles,
  mergeGatewayProfileScanResult,
  upsertDiscoveredProfile,
} from '../services/gatewayProfiles';
import type { GatewayProfile } from '../types/gatewayProfile';

const STORAGE_KEY = 'hermes-mobile:gateway_profiles';
const discoveredProfile: GatewayProfile = {
  id: 'mac_100_94_135_78',
  label: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  hostname: 'Igors-Mac-mini',
  addedAt: '2026-07-27T05:27:16.344Z',
};

describe('gatewayProfiles cold-start persistence', () => {
  beforeEach(async () => {
    await gatewayProfiles.clear();
  });

  it('preserves an explicit unselected state when discovery cataloged a computer', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profiles: [discoveredProfile],
        activeProfileId: null,
      }),
    );

    const loaded = await gatewayProfiles.load();

    expect(loaded.activeProfileId).toBeNull();
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.profiles[0]).toEqual(expect.objectContaining(discoveredProfile));
  });

  it('still migrates legacy state that omitted activeProfileId', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profiles: [discoveredProfile],
      }),
    );

    const loaded = await gatewayProfiles.load();

    expect(loaded.activeProfileId).toBe(discoveredProfile.id);
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.profiles[0]).toEqual(expect.objectContaining(discoveredProfile));
  });

  it('keeps the explicitly selected LAN route when background Tailscale discovery finds the same Mac', async () => {
    const lanProfile: GatewayProfile = {
      id: 'mac_192_168_68_60',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://192.168.68.60:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '192.168.68.60',
      addedAt: '2026-07-27T05:53:31.828Z',
    };
    await gatewayProfiles.save({
      profiles: [lanProfile],
      activeProfileId: lanProfile.id,
    });

    const selectedLan = await gatewayProfiles.load();
    const afterBackgroundDiscovery = upsertDiscoveredProfile(
      selectedLan,
      {
        gatewayUrl: 'http://100.87.85.85:8642',
        hostname: 'Igors-MacBook-Pro',
        localIp: '100.87.85.85',
        label: 'Igors-MacBook-Pro',
      },
      false,
    );
    await gatewayProfiles.save(afterBackgroundDiscovery);

    const relaunched = await gatewayProfiles.load();

    expect(relaunched.profiles).toHaveLength(1);
    expect(relaunched.profiles[0].gatewayUrl).toBe(
      'http://192.168.68.60:8642',
    );
    expect(relaunched.activeProfileId).toBe('mac_192_168_68_60');
  });

  it('preserves a selection made while an older background scan was still running', () => {
    const selectedMacBook: GatewayProfile = {
      id: 'mac_100_87_85_85',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://100.87.85.85:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '100.87.85.85',
      addedAt: '2026-07-27T06:12:00.000Z',
    };
    const discoveredMini: GatewayProfile = {
      id: 'mac_100_94_135_78',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '100.94.135.78',
      addedAt: '2026-07-27T06:11:00.000Z',
    };

    const merged = mergeGatewayProfileScanResult(
      {
        profiles: [selectedMacBook],
        activeProfileId: selectedMacBook.id,
      },
      {
        profiles: [discoveredMini, discoveredProfile],
        activeProfileId: null,
      },
    );

    expect(merged.activeProfileId).toBe(selectedMacBook.id);
    expect(merged.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: selectedMacBook.id,
          gatewayUrl: selectedMacBook.gatewayUrl,
        }),
        expect.objectContaining({
          id: discoveredMini.id,
          gatewayUrl: discoveredMini.gatewayUrl,
        }),
      ]),
    );
  });

  it('does not resurrect a stale active profile after the latest state cleared it', () => {
    const merged = mergeGatewayProfileScanResult(
      {
        profiles: [discoveredProfile],
        activeProfileId: null,
      },
      {
        profiles: [discoveredProfile],
        activeProfileId: discoveredProfile.id,
      },
    );

    expect(merged.activeProfileId).toBeNull();
  });

  it('does not replace the newly selected Tailscale route with a stale same-Mac LAN scan result', () => {
    const selectedTailscale: GatewayProfile = {
      id: 'mac_igors_macbook_pro',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://100.87.85.85:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '100.87.85.85',
      addedAt: '2026-07-27T06:20:00.000Z',
    };
    const staleLanResult: GatewayProfile = {
      ...selectedTailscale,
      gatewayUrl: 'http://192.168.68.60:8642',
      localIp: '192.168.68.60',
    };

    const merged = mergeGatewayProfileScanResult(
      {
        profiles: [selectedTailscale],
        activeProfileId: selectedTailscale.id,
      },
      {
        profiles: [staleLanResult],
        activeProfileId: null,
      },
    );

    expect(merged.activeProfileId).toBe(merged.profiles[0].id);
    expect(merged.activeProfileId).not.toBeNull();
    expect(merged.profiles).toHaveLength(1);
    expect(merged.profiles[0].gatewayUrl).toBe(selectedTailscale.gatewayUrl);
    expect(merged.profiles[0].localIp).toBe(selectedTailscale.localIp);
  });
});
