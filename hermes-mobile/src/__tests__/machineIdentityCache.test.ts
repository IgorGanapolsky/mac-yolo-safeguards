import {
  applyIdentityCacheToProfile,
  rememberMachineIdentity,
  resolveCachedMachineDisplayName,
} from '../utils/machineIdentityCache';
import type { GatewayProfile } from '../types/gatewayProfile';

const miniIpProfile = (overrides: Partial<GatewayProfile> = {}): GatewayProfile => ({
  id: 'ts_mini',
  label: 'Tailscale 100.94.135.78',
  gatewayUrl: 'http://100.94.135.78:8642',
  localIp: '100.94.135.78',
  addedAt: '2026-07-23T00:00:00.000Z',
  ...overrides,
});

describe('machineIdentityCache', () => {
  it('remembers hostname for a Tailscale IP after health succeeds', () => {
    const cache = rememberMachineIdentity(
      {},
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        ip: '100.94.135.78',
        hostname: 'Igors-Mac-mini.local',
      },
    );
    expect(cache['100.94.135.78']?.label).toBe('Igors-Mac-mini');
    expect(
      resolveCachedMachineDisplayName(miniIpProfile(), cache),
    ).toBe('Igors-Mac-mini');
  });

  it('upgrades nameless Tailscale profile label+hostname from cache', () => {
    const cache = rememberMachineIdentity(
      {},
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
      },
    );
    const next = applyIdentityCacheToProfile(miniIpProfile(), cache);
    expect(next.label).toBe('Igors-Mac-mini');
    expect(next.hostname).toMatch(/Igors-Mac-mini/i);
  });

  it('does not override a real custom label', () => {
    const cache = rememberMachineIdentity(
      {},
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
      },
    );
    const custom = miniIpProfile({ label: 'Studio Mini' });
    expect(resolveCachedMachineDisplayName(custom, cache)).toBeNull();
    expect(applyIdentityCacheToProfile(custom, cache).label).toBe('Studio Mini');
  });

  it('ignores empty hostname observations', () => {
    expect(
      rememberMachineIdentity(
        {},
        { gatewayUrl: 'http://100.94.135.78:8642', hostname: '   ' },
      ),
    ).toEqual({});
  });
});
