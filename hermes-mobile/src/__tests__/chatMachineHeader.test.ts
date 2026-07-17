import type { GatewayProfile } from '../types/gatewayProfile';
import { profileDisplayName } from '../services/gatewayProfiles';
import {
  resolveChatMachineHeaderDisplay,
  formatMacConnectionRetryBanner,
  formatChatMachineHeaderLine,
  usbHeaderClaimsNamedHost,
  assertUsbHeaderIdentityLaw,
  USB_UNKNOWN_MACHINE_LABEL,
} from '../utils/chatMachineHeader';

describe('resolveChatMachineHeaderDisplay', () => {
  const macBook: GatewayProfile = {
    id: 'mac_book',
    label: 'Your Mac',
    gatewayUrl: 'http://10.2.29.103:8642',
    hostname: 'Igors-MacBook-Pro.local',
    localIp: '10.2.29.103',
    addedAt: '2026-06-24T00:00:00.000Z',
  };

  it('never claims Computer via USB on fresh install with empty gateway URL', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: null,
      gatewayUrl: '',
      health: null,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 0,
    });
    expect(display.machineLabel).toBe('Your computer');
    expect(display.machineEndpoint).toBeUndefined();
    expect(formatChatMachineHeaderLine(display).toLowerCase()).not.toContain('usb');
    expect(formatChatMachineHeaderLine(display)).not.toContain('127.0.0.1');
  });

  it('keeps Hermes account relay label when unpaired with empty URL', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: null,
      gatewayUrl: '',
      health: null,
      connectionMode: 'relay',
      isPaired: false,
      workers: [],
      savedMacCount: 0,
    });
    expect(display.machineLabel).toBe('Hermes account relay');
  });

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

  it('shows USB route for loopback when live health hostname matches (not home LAN IP)', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_127_0_0_1',
        label: '127.0.0.1',
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '192.168.68.73',
        hostname: 'Igors-Mac-mini.local',
        addedAt: '2026-06-24T00:00:00.000Z',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'green',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.73',
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineEndpoint).toBe('USB');
    expect(display.machineEndpoint).not.toContain('192.168.68.73');
    expect(assertUsbHeaderIdentityLaw({
      display,
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'green',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
      },
    })).toBeNull();
  });

  it('shows hostname and USB for adb reverse loopback when health is live', () => {
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

  it('prefers live USB hostname when saved profile disagrees with plugged-in Mac', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        ...macMini,
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'green',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
    });
    expect(display.machineLabel).toBe('Igors-MacBook-Pro');
    expect(display.machineEndpoint).toBe('USB');
    expect(formatChatMachineHeaderLine(display)).toBe('Igors-MacBook-Pro · USB');
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
  });

  it('never claims named Mini·USB when health is red (unknown cable)', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        ...macBook,
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'red',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
    });
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(display.machineEndpoint).toBe('USB');
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
  });

  it('keeps generic USB label when loopback name is still generic and health null', () => {
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
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(display.machineLabel).not.toMatch(/127\.0\.0\.1/);
    expect(display.machineEndpoint).toBe('USB');
  });

  it('never invents Mini from profile hostname while USB health is null', () => {
    const withProfileHost = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_127_0_0_1',
        label: '127.0.0.1',
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-Mac-mini.local',
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
    expect(withProfileHost.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(withProfileHost.machineLabel).not.toMatch(/Mac-mini/i);
    expect(usbHeaderClaimsNamedHost(withProfileHost)).toBe(false);

    const withHealthHost = resolveChatMachineHeaderDisplay({
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
        hostname: 'Igors-MacBook-Pro.local',
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(withHealthHost.machineLabel).toBe('Igors-MacBook-Pro');
    expect(withHealthHost.machineLabel).not.toMatch(/127\.0\.0\.1/);
  });

  it('INVARIANT: never borrows Mini name for generic USB while reconnecting (health null)', () => {
    const usbProfile = {
      id: 'mac_127_0_0_1',
      label: 'Computer via USB',
      gatewayUrl: 'http://127.0.0.1:8642',
      localIp: '127.0.0.1',
      addedAt: '2026-06-24T00:00:00.000Z',
    };
    const namedProfile = {
      id: 'mac_127_0_0_1',
      label: 'Computer via USB',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-Mac-mini.local',
      localIp: '127.0.0.1',
      addedAt: '2026-06-24T00:00:00.000Z',
    };
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: usbProfile,
      profiles: [namedProfile],
      gatewayUrl: 'http://127.0.0.1:8642',
      health: null,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(display.machineEndpoint).toBe('USB');
    expect(formatChatMachineHeaderLine(display)).toBe(`${USB_UNKNOWN_MACHINE_LABEL} · USB`);
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
    expect(
      assertUsbHeaderIdentityLaw({
        display,
        gatewayUrl: 'http://127.0.0.1:8642',
        health: null,
      }),
    ).toBeNull();
  });

  it('INVARIANT multi-Mac: Mini selected + loopback + health null → not Mini·USB', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        ...macMini,
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
      },
      profiles: [macMini, macBook],
      gatewayUrl: 'http://127.0.0.1:8642',
      health: null,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
    });
    const line = formatChatMachineHeaderLine(display);
    expect(line).not.toBe('Igors-Mac-mini · USB');
    expect(line).not.toMatch(/Mac-mini/i);
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
  });

  it('INVARIANT multi-Mac: Mini selected + loopback + live health=MBP → MBP·USB not Mini', () => {
    const health = {
      level: 'green' as const,
      checkedAt: '2026-06-24T00:00:00.000Z',
      hostname: 'Igors-MacBook-Pro.local',
      directGatewayReachable: true,
    };
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        ...macMini,
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
      },
      profiles: [macMini, macBook],
      gatewayUrl: 'http://127.0.0.1:8642',
      health,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
    });
    expect(formatChatMachineHeaderLine(display)).toBe('Igors-MacBook-Pro · USB');
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
    expect(assertUsbHeaderIdentityLaw({ display, gatewayUrl: 'http://127.0.0.1:8642', health })).toBeNull();
  });

  it('INVARIANT multi-Mac: Mini selected + loopback + red health → not Mini·USB', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        ...macMini,
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
      },
      profiles: [macMini, macBook],
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'red',
        checkedAt: '2026-06-24T00:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
    });
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
    expect(
      assertUsbHeaderIdentityLaw({
        display,
        gatewayUrl: 'http://127.0.0.1:8642',
        health: { level: 'red', checkedAt: '2026-06-24T00:00:00.000Z' },
      }),
    ).toBeNull();
  });

  it('assertUsbHeaderIdentityLaw fails if code claims Mini·USB without live health', () => {
    const err = assertUsbHeaderIdentityLaw({
      display: { machineLabel: 'Igors-Mac-mini', machineEndpoint: 'USB', showDetailWhenConnected: true },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: null,
    });
    expect(err).toMatch(/without live green\/amber/);
  });

  it('shows generic USB label in relay mode when unpaired loopback and health red', () => {
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
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
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
      machineLabel: USB_UNKNOWN_MACHINE_LABEL,
      machineEndpoint: 'USB',
    });
    expect(text).toBe(`Can't reach ${USB_UNKNOWN_MACHINE_LABEL} (USB) — tap to retry`);
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

  it('shows re-pair copy when auth mismatches instead of tap to retry', () => {
    const text = formatMacConnectionRetryBanner({
      connectionState: 'connected',
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'green',
        checkedAt: '2026-06-24T00:00:00.000Z',
        authMismatch: true,
      },
      activeProfile: {
        id: 'mini',
        label: 'Mac mini',
        gatewayUrl: 'http://100.94.135.78:8642',
        addedAt: '2026-06-24T00:00:00.000Z',
      },
      machineLabel: 'Igors-Mac-mini',
      machineEndpoint: 'Tailscale',
      authMismatch: true,
    });
    expect(text).toBe('Outdated connection (Igors-Mac-mini) — tap to reconnect');
    expect(text).not.toContain('tap to retry');
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
