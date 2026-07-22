import type { GatewayProfile } from '../types/gatewayProfile';
import { resolveProfileAfterEnsureUpsert } from '../utils/resolveEnsureProfile';

const usbBook: GatewayProfile = {
  id: 'mac_usb_book',
  label: 'Igors-MacBook-Pro',
  hostname: 'Igors-MacBook-Pro',
  gatewayUrl: 'http://127.0.0.1:8642',
  localIp: '127.0.0.1',
  addedAt: '2026-07-21T00:00:00Z',
};

const miniTs: GatewayProfile = {
  id: 'mac_100_94_135_78',
  label: 'Igors-Mac-mini',
  hostname: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  localIp: '100.94.135.78',
  addedAt: '2026-07-21T00:00:01Z',
};

describe('resolveProfileAfterEnsureUpsert', () => {
  it('never falls back to USB when the tap is Mac mini Tailscale with a stale id', () => {
    const ensure: GatewayProfile = {
      ...miniTs,
      id: 'stale_discovery_mini_id',
    };
    const resolved = resolveProfileAfterEnsureUpsert({
      state: { profiles: [usbBook, miniTs], activeProfileId: usbBook.id },
      requestedProfileId: 'stale_discovery_mini_id',
      ensure,
    });
    expect(resolved?.id).toBe(miniTs.id);
    expect(resolved?.gatewayUrl).toContain('100.94.135.78');
    expect(resolved?.gatewayUrl).not.toContain('127.0.0.1');
  });

  it('resolves live USB ensure to the loopback row', () => {
    const ensure: GatewayProfile = {
      id: 'live_usb_synth',
      label: 'Igors-MacBook-Pro',
      hostname: 'Igors-MacBook-Pro.local',
      gatewayUrl: 'http://127.0.0.1:8642',
      localIp: '127.0.0.1',
      addedAt: '2026-07-21T00:00:02Z',
    };
    const resolved = resolveProfileAfterEnsureUpsert({
      state: { profiles: [miniTs, usbBook], activeProfileId: miniTs.id },
      requestedProfileId: ensure.id,
      ensure,
    });
    expect(resolved?.id).toBe(usbBook.id);
    expect(resolved?.gatewayUrl).toContain('127.0.0.1');
  });

  it('returns undefined for Tailscale ensure when mini is not in catalog yet', () => {
    const ensure = { ...miniTs, id: 'missing' };
    const resolved = resolveProfileAfterEnsureUpsert({
      state: { profiles: [usbBook], activeProfileId: usbBook.id },
      requestedProfileId: 'missing',
      ensure,
    });
    expect(resolved).toBeUndefined();
  });
});
