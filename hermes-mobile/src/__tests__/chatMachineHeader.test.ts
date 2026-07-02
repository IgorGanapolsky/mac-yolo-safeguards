import type { GatewayProfile } from '../types/gatewayProfile';
import { profileDisplayName } from '../services/gatewayProfiles';
import { resolveChatMachineHeaderDisplay, formatMacConnectionRetryBanner } from '../utils/chatMachineHeader';

describe('resolveChatMachineHeaderDisplay', () => {
  const macBook: GatewayProfile = {
    id: 'mac_book',
    label: 'Your Mac',
    gatewayUrl: 'http://10.2.29.103:8642',
    hostname: 'Igors-MacBook-Pro.local',
    localIp: '10.2.29.103',
    addedAt: '2026-06-24T00:00:00.000Z',
  };

  const macMini: GatewayProfile = {
    id: 'mac_mini',
    label: 'Mac mini',
    gatewayUrl: 'http://10.2.29.50:8642',
    hostname: 'Igors-Mac-mini.local',
    localIp: '10.2.29.50',
    addedAt: '2026-06-24T00:00:00.000Z',
  };

  it('uses hostname when profile label is generic Your Mac', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: macBook,
      gatewayUrl: macBook.gatewayUrl,
      health: { level: 'green', checkedAt: '2026-06-24T00:00:00.000Z' },
      connectionMode: 'relay',
      isPaired: true,
      workers: [],
      savedMacCount: 2,
    });
    expect(display.machineLabel).toBe('Igors-MacBook-Pro');
    expect(display.machineEndpoint).toContain('10.2.29.103:8642');
    expect(display.showDetailWhenConnected).toBe(true);
  });

  it('shows IP for single Mac when label does not include it', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: { ...macMini, label: 'Igors-Mac-mini' },
      gatewayUrl: macMini.gatewayUrl,
      health: null,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineEndpoint).toBe('10.2.29.50:8642');
  });

  it('includes relay worker when different from chat Mac', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: macBook,
      gatewayUrl: macBook.gatewayUrl,
      health: null,
      connectionMode: 'relay',
      isPaired: true,
      workers: [
        {
          id: 'w1',
          label: 'Igors-Mac-mini · skool',
          hostname: 'Igors-Mac-mini',
          status: 'online',
        },
      ],
      savedMacCount: 2,
    });
    expect(display.machineEndpoint).toContain('relay · Igors-Mac-mini · skool');
  });

  it('shows hostname and USB for adb reverse loopback when health has hostname', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_127_0_0_1',
        label: '127.0.0.1',
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
        addedAt: '2026-06-24T00:00:00.000Z',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'green',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineEndpoint).toBe('USB');
    expect(display.showDetailWhenConnected).toBe(true);
  });

  it('keeps loopback address when machine name is still generic', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_127_0_0_1',
        label: '127.0.0.1',
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
        addedAt: '2026-06-24T00:00:00.000Z',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: null,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Computer via USB');
    expect(display.machineEndpoint).toBe('127.0.0.1:8642');
  });

  it('keeps saved Mac name in relay mode when unpaired with a direct profile', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_usb',
        label: 'Your Mac',
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '127.0.0.1',
        addedAt: '2026-06-24T00:00:00.000Z',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'red',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
      },
      connectionMode: 'relay',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Igors-MacBook-Pro');
    expect(display.machineEndpoint).toBe('USB');
  });

  it('shows friendly Mac name with Tailscale route detail when connected via MagicDNS', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_tail',
        label: 'igors-mac-mini.tail12aa33.ts.net',
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.56',
        addedAt: '2026-06-29T00:00:00.000Z',
      },
      gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
      health: {
        level: 'green',
        checkedAt: '2026-06-29T00:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.56',
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineEndpoint).toBe('Tailscale');
    expect(display.showDetailWhenConnected).toBe(true);
  });
});

describe('formatMacConnectionRetryBanner', () => {
  it('names the Mac and route instead of a vague direct link', () => {
    const text = formatMacConnectionRetryBanner({
      connectionState: 'disconnected',
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'red',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
      },
      activeProfile: {
        id: 'mac_usb',
        label: 'Your Mac',
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '127.0.0.1',
        addedAt: '2026-06-24T00:00:00.000Z',
      },
      machineLabel: 'Igors-MacBook-Pro',
      machineEndpoint: 'USB',
    });
    expect(text).toBe("Can't reach Igors-MacBook-Pro (USB) — tap to retry");
    expect(text).not.toContain('direct link');
  });

  it('never shows http as the machine name for junk profiles', () => {
    const text = formatMacConnectionRetryBanner({
      connectionState: 'disconnected',
      gatewayUrl: 'http://',
      health: null,
      activeProfile: {
        id: 'junk',
        label: 'http',
        gatewayUrl: 'http://',
        addedAt: '2026-06-24T00:00:00.000Z',
      },
      machineLabel: 'http',
      machineEndpoint: 'http',
    });
    expect(text).not.toMatch(/\bhttp\b.*\bhttp\b/i);
    expect(text).toContain('your computer');
  });
});

describe('profileDisplayName generic labels', () => {
  it('prefers hostname over Your Mac label', () => {
    expect(
      profileDisplayName({
        id: 'x',
        label: 'Your Mac',
        gatewayUrl: 'http://10.2.29.103:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '10.2.29.103',
        addedAt: '2026-06-24T00:00:00.000Z',
      }),
    ).toBe('Igors-MacBook-Pro');
  });

  it('prefers Bonjour hostname over Tailscale MagicDNS label', () => {
    expect(
      profileDisplayName({
        id: 'tail',
        label: 'igors-mac-mini.tail12aa33.ts.net',
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.56',
        addedAt: '2026-06-29T00:00:00.000Z',
      }),
    ).toBe('Igors-Mac-mini');
  });
});
