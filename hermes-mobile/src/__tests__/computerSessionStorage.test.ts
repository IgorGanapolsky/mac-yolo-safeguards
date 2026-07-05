import type { GatewayProfile } from '../types/gatewayProfile';
import { storage } from '../services/storage';
import {
  primaryComputerSessionStorageKey,
  resolveComputerSessionStorageKeys,
} from '../utils/computerSessionStorage';
import { resolveSessionAfterListLoad } from '../utils/sessionListSelection';

const macMiniLan: GatewayProfile = {
  id: 'mac_192_168_68_56',
  label: 'Igors-Mac-mini',
  hostname: 'Igors-Mac-mini',
  gatewayUrl: 'http://192.168.68.56:8642',
  localIp: '192.168.68.56',
  addedAt: '2026-06-28T00:00:00Z',
};

const macMiniTailscale: GatewayProfile = {
  id: 'mac_100_94_135_78',
  label: 'Igors-Mac-mini',
  hostname: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  addedAt: '2026-06-28T00:00:01Z',
};

describe('resolveComputerSessionStorageKeys', () => {
  it('prefers stable machine hostname over drifting profile ids', () => {
    expect(resolveComputerSessionStorageKeys(macMiniLan)).toEqual([
      'host:igors-mac-mini',
      'mac_192_168_68_56',
      'http://192.168.68.56:8642',
    ]);
    expect(resolveComputerSessionStorageKeys(macMiniTailscale)).toEqual([
      'host:igors-mac-mini',
      'mac_100_94_135_78',
      'http://100.94.135.78:8642',
    ]);
    expect(primaryComputerSessionStorageKey(macMiniLan)).toBe('host:igors-mac-mini');
    expect(primaryComputerSessionStorageKey(macMiniTailscale)).toBe('host:igors-mac-mini');
  });

  it('falls back to profile id and gateway URL when hostname is missing', () => {
    const profile: GatewayProfile = {
      id: 'mac_192_168_12_208',
      label: 'Computer 192.168.12.208',
      gatewayUrl: 'http://192.168.12.208:8642',
      localIp: '192.168.12.208',
      addedAt: '2026-06-28T00:00:00Z',
    };
    expect(resolveComputerSessionStorageKeys(profile)).toEqual([
      'mac_192_168_12_208',
      'http://192.168.12.208:8642',
    ]);
  });
});

describe('session restore on reconnect (selection contract)', () => {
  beforeEach(async () => {
    await storage.clearAll();
  });

  it('restores LAN-remembered session after Tailscale profile id drift', async () => {
    await storage.saveLastSessionForComputer(['host:igors-mac-mini'], 'sess_prior_chat');

    const sessions = [
      { id: 'sess_prior_chat', title: 'Print money', last_active_at: '2026-06-28T12:00:00Z' },
      { id: 'sess_new_empty', title: 'New mobile session #3', last_active_at: '2026-07-05T12:00:00Z' },
    ];
    const projectState = {
      projects: [],
      sessionProjectMap: {},
      sessionLabels: {},
      activeProjectId: null,
    };

    const rememberedSessionId = await storage.loadLastSessionForComputer(
      resolveComputerSessionStorageKeys(macMiniTailscale),
    );
    expect(rememberedSessionId).toBe('sess_prior_chat');

    const restored = resolveSessionAfterListLoad({
      sessions,
      projectState,
      currentSessionId: null,
      rememberedSessionId,
      selectLatest: true,
    });
    expect(restored?.id).toBe('sess_prior_chat');
  });
});
