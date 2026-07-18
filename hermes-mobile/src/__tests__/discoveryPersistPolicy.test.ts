import {
  partitionSilentDiscoveries,
  shouldAutoScanOnBootstrap,
} from '../utils/discoveryPersistPolicy';
import type { DiscoveredGateway, GatewayProfile } from '../types/gatewayProfile';

const miniDiscovery: DiscoveredGateway = {
  gatewayUrl: 'http://100.94.135.78:8642',
  hostname: 'Igors-Mac-mini.local',
  label: 'Igors-Mac-mini',
  localIp: '100.94.135.78',
};

const proDiscovery: DiscoveredGateway = {
  gatewayUrl: 'http://100.87.85.85:8642',
  hostname: 'Igors-MacBook-Pro.local',
  label: 'Igors-MacBook-Pro',
  localIp: '100.87.85.85',
};

const savedMini: GatewayProfile = {
  id: 'mini',
  label: 'Igors-Mac-mini',
  hostname: 'Igors-Mac-mini.local',
  gatewayUrl: 'http://100.94.135.78:8642',
  addedAt: '2026-07-17T12:00:00.000Z',
};

describe('discoveryPersistPolicy', () => {
  it('never auto-scans on bootstrap for a brand-new unpaired install', () => {
    expect(shouldAutoScanOnBootstrap([])).toBe(false);
  });

  it('allows bootstrap auto-scan when a real Mac is already saved', () => {
    expect(shouldAutoScanOnBootstrap([savedMini])).toBe(true);
  });

  it('keeps all silent Tailscale hits ephemeral on empty profiles (fresh Play)', () => {
    const { toPersist, ephemeral } = partitionSilentDiscoveries([], [
      proDiscovery,
      miniDiscovery,
    ]);
    expect(toPersist).toEqual([]);
    expect(ephemeral).toEqual([proDiscovery, miniDiscovery]);
  });

  it('route-heals matching saved Macs but does not invent a second Mac', () => {
    const { toPersist, ephemeral } = partitionSilentDiscoveries([savedMini], [
      miniDiscovery,
      proDiscovery,
    ]);
    expect(toPersist).toEqual([miniDiscovery]);
    expect(ephemeral).toEqual([proDiscovery]);
  });
});
