import type { DiscoveredGateway, GatewayProfile } from '../types/gatewayProfile';
import {
  crossMachineRecoveryCandidates,
  resolveCrossMachineRecoveryOffer,
} from '../utils/crossMachineRecovery';
import { savedProfileFallbackUrls } from '../utils/connectionSelfHeal';

const mini: GatewayProfile = {
  id: 'mac_igors_mac_mini',
  label: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  hostname: 'Igors-Mac-mini.local',
  localIp: '100.94.135.78',
  addedAt: '2026-07-01T10:00:00Z',
  lastConnectedAt: '2026-07-30T09:00:00Z',
};

const miniLan: GatewayProfile = {
  id: 'mac_192_168_1_50',
  label: 'Igors-Mac-mini',
  gatewayUrl: 'http://192.168.1.50:8642',
  hostname: 'Igors-Mac-mini.local',
  localIp: '192.168.1.50',
  addedAt: '2026-07-01T10:00:00Z',
  lastConnectedAt: '2026-07-29T09:00:00Z',
};

const pro: GatewayProfile = {
  id: 'mac_igors_macbook_pro',
  label: 'Igors-MacBook-Pro',
  gatewayUrl: 'http://100.87.85.85:8642',
  hostname: 'Igors-MacBook-Pro.local',
  localIp: '100.87.85.85',
  addedAt: '2026-07-02T10:00:00Z',
  lastConnectedAt: '2026-07-28T09:00:00Z',
};

const proReachable: DiscoveredGateway = {
  gatewayUrl: 'http://100.87.85.85:8642',
  hostname: 'Igors-MacBook-Pro.local',
  localIp: '100.87.85.85',
  label: 'Igors-MacBook-Pro',
};

const offlineActiveInput = {
  profiles: [mini, pro],
  activeProfileId: mini.id,
  activeProfileReachable: false,
  healExhausted: true,
  reachableGateways: [proReachable],
};

describe('crossMachineRecoveryCandidates', () => {
  it('offers the healthy other Mac when the active Mac is fully offline', () => {
    const candidates = crossMachineRecoveryCandidates({
      profiles: [mini, pro],
      activeProfileId: mini.id,
      reachableGateways: [proReachable],
    });

    expect(candidates.map((profile) => profile.id)).toEqual([pro.id]);
  });

  it('never offers another route to the SAME machine (same-machine healing stays automatic)', () => {
    const candidates = crossMachineRecoveryCandidates({
      profiles: [mini, miniLan],
      activeProfileId: mini.id,
      reachableGateways: [
        {
          gatewayUrl: 'http://192.168.1.50:8642',
          hostname: 'Igors-Mac-mini.local',
          localIp: '192.168.1.50',
        },
      ],
    });

    expect(candidates).toEqual([]);
  });

  it('never offers a machine that did not answer /health', () => {
    const candidates = crossMachineRecoveryCandidates({
      profiles: [mini, pro],
      activeProfileId: mini.id,
      reachableGateways: [],
    });

    expect(candidates).toEqual([]);
  });

  it('ignores loopback rows — a cable answers for whichever Mac is attached', () => {
    const loopback: GatewayProfile = {
      id: 'mac_usb_loopback',
      label: 'Computer',
      gatewayUrl: 'http://127.0.0.1:8642',
      addedAt: '2026-07-02T10:00:00Z',
    };
    const candidates = crossMachineRecoveryCandidates({
      profiles: [mini, loopback],
      activeProfileId: mini.id,
      reachableGateways: [{ gatewayUrl: 'http://127.0.0.1:8642' }],
    });

    expect(candidates).toEqual([]);
  });

  it('orders candidates by most recently connected', () => {
    const older: GatewayProfile = {
      ...pro,
      id: 'mac_studio',
      label: 'Mac-Studio',
      hostname: 'Mac-Studio.local',
      gatewayUrl: 'http://100.70.1.9:8642',
      localIp: '100.70.1.9',
      lastConnectedAt: '2026-07-10T09:00:00Z',
    };
    const candidates = crossMachineRecoveryCandidates({
      profiles: [mini, older, pro],
      activeProfileId: mini.id,
      reachableGateways: [
        proReachable,
        { gatewayUrl: 'http://100.70.1.9:8642', hostname: 'Mac-Studio.local', localIp: '100.70.1.9' },
      ],
    });

    expect(candidates.map((profile) => profile.id)).toEqual([pro.id, older.id]);
  });
});

describe('resolveCrossMachineRecoveryOffer', () => {
  it('surfaces an explicit one-tap switch naming both computers', () => {
    const offer = resolveCrossMachineRecoveryOffer(offlineActiveInput);

    expect(offer).not.toBeNull();
    expect(offer?.profileId).toBe(pro.id);
    expect(offer?.gatewayUrl).toBe(pro.gatewayUrl);
    expect(offer?.computerName).toBe('Igors-MacBook-Pro');
    expect(offer?.offlineComputerName).toBe('Igors-Mac-mini');
    expect(offer?.title).toBe('Igors-Mac-mini is offline');
    expect(offer?.actionLabel).toBe('Switch to Igors-MacBook-Pro');
  });

  it('warns that switching moves where commands run — never silently reroutes', () => {
    const offer = resolveCrossMachineRecoveryOffer(offlineActiveInput);

    expect(offer?.body).toMatch(/Igors-MacBook-Pro/);
    expect(offer?.body).toMatch(/Igors-Mac-mini/);
    expect(offer?.body).toMatch(/run/i);
  });

  it('stays silent while silent heal still has budget', () => {
    expect(
      resolveCrossMachineRecoveryOffer({ ...offlineActiveInput, healExhausted: false }),
    ).toBeNull();
  });

  it('stays silent while the active computer is reachable', () => {
    expect(
      resolveCrossMachineRecoveryOffer({ ...offlineActiveInput, activeProfileReachable: true }),
    ).toBeNull();
  });

  it('stays silent when no computer is selected', () => {
    expect(
      resolveCrossMachineRecoveryOffer({ ...offlineActiveInput, activeProfileId: null }),
    ).toBeNull();
  });

  it('never emits USB copy and never says the phone is unpaired', () => {
    const offer = resolveCrossMachineRecoveryOffer(offlineActiveInput);
    const copy = [offer?.title, offer?.body, offer?.actionLabel].join(' ');

    expect(copy).not.toMatch(/usb/i);
    expect(copy).not.toMatch(/not paired|unpaired|invalid/i);
    expect(copy).not.toMatch(/upgrade|unlock|purchase|subscribe/i);
  });

  it('falls back to neutral copy when a saved row has no real machine name', () => {
    const nameless: GatewayProfile = {
      id: 'mac_100_70_1_9',
      label: 'Computer via USB',
      gatewayUrl: 'http://100.70.1.9:8642',
      addedAt: '2026-07-02T10:00:00Z',
    };
    const offer = resolveCrossMachineRecoveryOffer({
      profiles: [mini, nameless],
      activeProfileId: mini.id,
      activeProfileReachable: false,
      healExhausted: true,
      reachableGateways: [{ gatewayUrl: 'http://100.70.1.9:8642' }],
    });

    expect(offer).not.toBeNull();
    expect([offer?.title, offer?.body, offer?.actionLabel].join(' ')).not.toMatch(/usb/i);
  });
});

describe('automatic healing stays same-machine only', () => {
  it('savedProfileFallbackUrls still refuses to auto-probe another Mac', () => {
    const urls = savedProfileFallbackUrls({
      primaryUrl: mini.gatewayUrl,
      profiles: [mini, miniLan, pro],
      activeProfileId: mini.id,
    });

    expect(urls).toContain(miniLan.gatewayUrl);
    expect(urls).not.toContain(pro.gatewayUrl);
  });
});
