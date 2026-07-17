import {
  profileIdsOnLiveTailscale,
  profileMatchesLiveTailscaleDiscovery,
} from '../utils/pickerLiveTailscale';
import type { DiscoveredGateway, GatewayProfile } from '../types/gatewayProfile';

const pro: GatewayProfile = {
  id: 'mac_pro',
  label: 'Igors-MacBook-Pro',
  gatewayUrl: 'http://igors-macbook-pro.tail12aa33.ts.net:8642',
  hostname: 'Igors-MacBook-Pro.local',
  localIp: '192.168.1.20',
  addedAt: '2026-07-17T12:00:00.000Z',
};

const mini: GatewayProfile = {
  id: 'mac_mini',
  label: 'Igors-Mac-mini',
  gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
  hostname: 'Igors-Mac-mini.local',
  addedAt: '2026-07-17T12:00:00.000Z',
};

const proDiscovery: DiscoveredGateway = {
  gatewayUrl: 'http://100.87.85.85:8642',
  hostname: 'Igors-MacBook-Pro.local',
  label: 'Igors-MacBook-Pro',
  localIp: '192.168.1.20',
};

describe('pickerLiveTailscale', () => {
  it('matches saved Mac Pro to live Tailscale discovery by hostname/IP', () => {
    expect(profileMatchesLiveTailscaleDiscovery(pro, [proDiscovery])).toBe(true);
    expect(profileMatchesLiveTailscaleDiscovery(mini, [proDiscovery])).toBe(false);
  });

  it('matches by normalized Tailscale URL base', () => {
    const sameUrl: DiscoveredGateway = {
      gatewayUrl: 'http://igors-macbook-pro.tail12aa33.ts.net:8642/',
      hostname: 'Igors-MacBook-Pro.local',
    };
    expect(profileMatchesLiveTailscaleDiscovery(pro, [sameUrl])).toBe(true);
  });

  it('collects profile ids currently on live Tailscale', () => {
    const ids = profileIdsOnLiveTailscale([pro, mini], [proDiscovery]);
    expect([...ids]).toEqual(['mac_pro']);
  });
});
