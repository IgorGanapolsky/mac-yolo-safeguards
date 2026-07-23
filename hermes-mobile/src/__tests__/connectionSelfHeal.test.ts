import type { GatewayProfile } from '../types/gatewayProfile';
import {
  buildSelfHealProbeUrls,
  resolveApiKeyForGatewayProbe,
  resolveCellularTailscaleFailoverUrl,
  savedProfileFallbackUrls,
  shouldClearUsbPrimaryOnCellular,
  shouldDeferLoopbackSuccessOnCellular,
  shouldPreferUsbProbeFirst,
} from '../utils/connectionSelfHeal';

const profiles: GatewayProfile[] = [
  {
    id: 'lan',
    label: 'Mac mini',
    gatewayUrl: 'http://192.168.68.56:8642',
    hostname: 'Igors-Mac-mini',
    localIp: '192.168.68.56',
    addedAt: '2026-06-28T00:00:00Z',
  },
  {
    id: 'ts',
    label: 'Mac mini tailnet',
    gatewayUrl: 'http://100.94.135.78:8642',
    hostname: 'Igors-Mac-mini',
    addedAt: '2026-06-28T00:00:01Z',
  },
];

const twoMacProfiles: GatewayProfile[] = [
  {
    id: 'mini',
    label: 'Igors-Mac-mini',
    hostname: 'Igors-Mac-mini',
    gatewayUrl: 'http://192.168.68.56:8642',
    localIp: '192.168.68.56',
    addedAt: '2026-06-28T00:00:00Z',
  },
  {
    id: 'book',
    label: 'Igors-MacBook-Pro',
    hostname: 'Igors-MacBook-Pro',
    gatewayUrl: 'http://100.94.135.78:8642',
    addedAt: '2026-06-28T00:00:01Z',
  },
];

describe('connectionSelfHeal', () => {
  it('includes same-machine alternate routes when activeProfileId is set', () => {
    expect(
      savedProfileFallbackUrls({
        primaryUrl: 'http://192.168.68.56:8642',
        profiles,
        activeProfileId: 'lan',
      }),
    ).toEqual(['http://100.94.135.78:8642']);
  });

  it('prefers Tailscale before USB loopback on cellular when activeProfileId is set', () => {
    const miniProfiles: GatewayProfile[] = [
      {
        id: 'lan',
        label: 'Mac mini',
        gatewayUrl: 'http://192.168.68.56:8642',
        hostname: 'Igors-Mac-mini',
        localIp: '192.168.68.56',
        addedAt: '2026-06-28T00:00:00Z',
      },
      {
        id: 'ts',
        label: 'Mac mini tailnet',
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini',
        addedAt: '2026-06-28T00:00:01Z',
      },
      {
        id: 'usb',
        label: 'Mac mini USB',
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-Mac-mini',
        localIp: '127.0.0.1',
        addedAt: '2026-06-28T00:00:02Z',
      },
    ];
    const cellular = savedProfileFallbackUrls({
      primaryUrl: 'http://192.168.68.56:8642',
      profiles: miniProfiles,
      activeProfileId: 'lan',
      wifiConnected: false,
    });
    const wifi = savedProfileFallbackUrls({
      primaryUrl: 'http://192.168.68.56:8642',
      profiles: miniProfiles,
      activeProfileId: 'lan',
      wifiConnected: true,
    });
    expect(cellular.indexOf('http://100.94.135.78:8642')).toBeLessThan(
      cellular.indexOf('http://127.0.0.1:8642'),
    );
    expect(wifi.indexOf('http://127.0.0.1:8642')).toBeLessThan(
      wifi.indexOf('http://100.94.135.78:8642'),
    );
  });

  it('does not include other saved Mac URLs when activeProfileId is set', () => {
    expect(
      savedProfileFallbackUrls({
        primaryUrl: 'http://192.168.68.56:8642',
        profiles: twoMacProfiles,
        activeProfileId: 'mini',
      }),
    ).toEqual([]);
  });

  it('prefers Tailscale saved URLs when LAN primary fails and no active id', () => {
    expect(
      savedProfileFallbackUrls({
        primaryUrl: 'http://192.168.68.56:8642',
        profiles,
        preferTailscaleFirst: true,
      }),
    ).toEqual(['http://100.94.135.78:8642']);
  });

  it('builds probe list with same-machine Tailscale first; skips anonymous USB', () => {
    const urls = buildSelfHealProbeUrls({
      primaryUrl: 'http://192.168.68.56:8642',
      wifiConnected: true,
      profiles: [
        ...profiles,
        {
          id: 'usb',
          label: 'Computer via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-28T00:00:02Z',
        },
      ],
      tailnetProbeHosts: ['igors-mac-mini.tail12aa33.ts.net'],
      activeProfileId: 'lan',
    });
    expect(urls[0]).toBe('http://100.94.135.78:8642');
    // Anonymous USB is whichever Mac is cabled — must not steal mini→Pro.
    expect(urls).not.toContain('http://127.0.0.1:8642');
    expect(urls).toContain('http://igors-mac-mini.tail12aa33.ts.net:8642');
  });

  it('includes USB only when the saved loopback row is the active Mac', () => {
    const urls = buildSelfHealProbeUrls({
      primaryUrl: 'http://192.168.68.56:8642',
      wifiConnected: true,
      profiles: [
        ...profiles,
        {
          id: 'usb',
          label: 'Igors-Mac-mini',
          hostname: 'Igors-Mac-mini',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-28T00:00:02Z',
        },
      ],
      activeProfileId: 'lan',
    });
    expect(urls).toContain('http://127.0.0.1:8642');
  });

  it('never probes Pro USB while Mac mini is the active computer', () => {
    const urls = buildSelfHealProbeUrls({
      primaryUrl: 'http://100.94.135.78:8642',
      wifiConnected: false,
      profiles: [
        ...twoMacProfiles,
        {
          id: 'book_usb',
          label: 'Igors-MacBook-Pro',
          hostname: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://127.0.0.1:8642',
          addedAt: '2026-06-28T00:00:02Z',
        },
      ],
      activeProfileId: 'mini',
    });
    expect(urls).not.toContain('http://127.0.0.1:8642');
  });

  it('resolves Tailscale failover URL for cellular with LAN primary', () => {
    const failover = resolveCellularTailscaleFailoverUrl({
      primaryUrl: 'http://192.168.68.56:8642',
      profiles,
      activeProfile: profiles[0],
      discoveries: [
        {
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          localIp: '192.168.68.56',
          label: 'Igors-Mac-mini',
        },
      ],
    });
    expect(failover).toBe('http://100.94.135.78:8642');
  });

  it('buildSelfHealProbeUrls skips other Mac LAN IPs when mini is active', () => {
    const urls = buildSelfHealProbeUrls({
      primaryUrl: 'http://100.94.135.78:8642',
      wifiConnected: true,
      lastLanIp: '192.168.68.71',
      profiles: twoMacProfiles,
      activeProfileId: 'mini',
    });
    expect(urls).not.toContain('http://192.168.68.71:8642');
    expect(urls).not.toContain('http://100.94.135.78:8642');
  });
});

describe('USB primary on cellular', () => {
  it('prefers USB probe only on Wi‑Fi with loopback active', () => {
    expect(
      shouldPreferUsbProbeFirst({
        activeGatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
      }),
    ).toBe(true);
    expect(
      shouldPreferUsbProbeFirst({
        activeGatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
      }),
    ).toBe(false);
    expect(
      shouldPreferUsbProbeFirst({
        activeGatewayUrl: 'http://100.87.85.85:8642',
        wifiConnected: true,
      }),
    ).toBe(false);
  });

  it('defers loopback success on cellular when Tailscale alternate exists', () => {
    expect(
      shouldDeferLoopbackSuccessOnCellular({
        primaryUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        hasTailscaleAlternate: true,
      }),
    ).toBe(true);
    expect(
      shouldDeferLoopbackSuccessOnCellular({
        primaryUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        hasTailscaleAlternate: false,
      }),
    ).toBe(false);
    expect(
      shouldDeferLoopbackSuccessOnCellular({
        primaryUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
        hasTailscaleAlternate: true,
      }),
    ).toBe(false);
  });

  it('clears USB-primary on cellular when Tailscale failover URL is available', () => {
    expect(
      shouldClearUsbPrimaryOnCellular({
        primaryUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        failoverUrl: 'http://100.87.85.85:8642',
      }),
    ).toBe(true);
    expect(
      shouldClearUsbPrimaryOnCellular({
        primaryUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
        failoverUrl: 'http://100.87.85.85:8642',
      }),
    ).toBe(false);
    expect(
      shouldClearUsbPrimaryOnCellular({
        primaryUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        failoverUrl: 'http://100.87.85.85:8642',
        liveUsbConfirmed: true,
      }),
    ).toBe(false);
  });

  it('does not defer live USB loopback success on cellular', () => {
    expect(
      shouldDeferLoopbackSuccessOnCellular({
        primaryUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        hasTailscaleAlternate: true,
        liveUsbConfirmed: true,
      }),
    ).toBe(false);
  });

  it('resolves Tailscale failover for USB primary without fresh discoveries', () => {
    const usbActive: GatewayProfile = {
      id: 'usb',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '127.0.0.1',
      addedAt: '2026-07-16T00:00:00Z',
    };
    const tsSibling: GatewayProfile = {
      id: 'ts',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://100.87.85.85:8642',
      hostname: 'Igors-MacBook-Pro',
      addedAt: '2026-07-16T00:00:01Z',
    };
    expect(
      resolveCellularTailscaleFailoverUrl({
        primaryUrl: 'http://127.0.0.1:8642',
        profiles: [usbActive, tsSibling],
        activeProfile: usbActive,
        discoveries: [],
      }),
    ).toBe('http://100.87.85.85:8642');
  });

  it('falls through to another Tailscale computer only for anonymous USB', () => {
    const usbAnonymous: GatewayProfile = {
      id: 'usb',
      label: 'Computer via USB',
      gatewayUrl: 'http://127.0.0.1:8642',
      localIp: '127.0.0.1',
      addedAt: '2026-07-21T00:00:00Z',
    };
    const miniTs: GatewayProfile = {
      id: 'mini',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '100.94.135.78',
      addedAt: '2026-07-21T00:00:01Z',
    };
    expect(
      resolveCellularTailscaleFailoverUrl({
        primaryUrl: 'http://127.0.0.1:8642',
        profiles: [usbAnonymous, miniTs],
        activeProfile: usbAnonymous,
        discoveries: [],
      }),
    ).toBe('http://100.94.135.78:8642');
  });

  it('does not silently jump named USB MacBook to Mac mini Tailscale', () => {
    const usbMacBook: GatewayProfile = {
      id: 'usb',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      localIp: '127.0.0.1',
      addedAt: '2026-07-21T00:00:00Z',
    };
    const miniTs: GatewayProfile = {
      id: 'mini',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini',
      localIp: '100.94.135.78',
      addedAt: '2026-07-21T00:00:01Z',
    };
    expect(
      resolveCellularTailscaleFailoverUrl({
        primaryUrl: 'http://127.0.0.1:8642',
        profiles: [usbMacBook, miniTs],
        activeProfile: usbMacBook,
        discoveries: [],
      }),
    ).toBeNull();
  });
});

describe('resolveApiKeyForGatewayProbe', () => {
  it('uses the matched profile key when failover probes another saved Mac URL', async () => {
    const profileKeys: Record<string, string> = {
      mini: 'sk-mini-key',
      book: 'sk-mbp-key',
    };
    const key = await resolveApiKeyForGatewayProbe({
      gatewayUrl: 'http://100.94.135.78:8642',
      profiles: twoMacProfiles,
      activeProfileId: 'mini',
      fallbackKey: 'sk-mini-key',
      resolveProfileKey: async (profileId) => profileKeys[profileId] ?? null,
    });
    expect(key).toBe('sk-mbp-key');
  });

  it('keeps the active profile key for same-machine alternate routes', async () => {
    const key = await resolveApiKeyForGatewayProbe({
      gatewayUrl: 'http://100.94.135.78:8642',
      profiles,
      activeProfileId: 'lan',
      fallbackKey: 'sk-stale-global',
      resolveProfileKey: async (profileId) => (profileId === 'lan' ? 'sk-lan-key' : null),
    });
    expect(key).toBe('sk-lan-key');
  });
});
