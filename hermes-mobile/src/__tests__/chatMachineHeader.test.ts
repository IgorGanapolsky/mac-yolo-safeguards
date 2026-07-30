import type { GatewayProfile } from '../types/gatewayProfile';
import { profileDisplayName } from '../services/gatewayProfiles';
import {
  resolveChatMachineHeaderDisplay,
  formatMacConnectionRetryBanner,
  formatChatMachineHeaderLine,
  usbHeaderClaimsNamedHost,
  assertUsbHeaderIdentityLaw,
  resolveHeaderTransportLabel,
  isUsbHeaderTransportAllowed,
  shouldClaimHeaderTransport,
  DIRECT_LINK_TRANSPORT_LABEL,
  USB_UNKNOWN_MACHINE_LABEL,
} from '../utils/chatMachineHeader';

/**
 * COPY LAW (CEO, 2026-07-22, restated 2026-07-30): the app must never name USB to
 * the user. The loopback/adb-reverse transport is still *identified* internally —
 * every identity invariant below is unchanged — but the chip the user reads is
 * DIRECT_LINK_TRANSPORT_LABEL. Assert against the constant, never a hard-coded
 * 'Direct link', so a future rename cannot leave a stale string behind.
 */
function expectNoCableWordAnywhere(line: string): void {
  expect(line.toLowerCase()).not.toContain('usb');
  expect(line.toLowerCase()).not.toContain('cable');
}

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
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(display.machineEndpoint).toBeUndefined();
    expect(formatChatMachineHeaderLine(display).toLowerCase()).not.toContain('usb');
    expect(formatChatMachineHeaderLine(display)).not.toContain('127.0.0.1');
  });

  it('names the Mac from the relay worker instead of leaking the Your computer placeholder', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: null,
      gatewayUrl: 'http://100.94.135.78:8642',
      health: null,
      connectionMode: 'gateway',
      isPaired: true,
      workers: [
        { id: 'w1', label: 'Igors-Mac-mini', hostname: 'Igors-Mac-mini', status: 'online' },
      ],
      savedMacCount: 0,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel).not.toBe(USB_UNKNOWN_MACHINE_LABEL);
  });

  it('names the Mac from the single saved computer instead of leaking the placeholder', () => {
    const only: GatewayProfile = {
      id: 'mac_mini_ts',
      label: 'Igors-Mac-mini',
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      addedAt: '2026-07-30T00:00:00.000Z',
    };
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: null,
      gatewayUrl: 'http://100.94.135.78:8642',
      health: null,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      profiles: [only],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
  });

  it('INVARIANT: the placeholder upgrade must never fire on an unproven loopback', () => {
    // Two saved Macs + a relay worker naming one of them, but the reach URL is an
    // adb reverse with dead health: the link answers for whichever Mac is attached,
    // so naming ANY of them would re-open the 2026-07-22 wrong-Mac defect.
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: null,
      gatewayUrl: 'http://127.0.0.1:8642',
      health: { level: 'red', checkedAt: '2026-07-30T00:00:00.000Z' },
      connectionMode: 'gateway',
      isPaired: true,
      workers: [
        { id: 'w1', label: 'Igors-Mac-mini', hostname: 'Igors-Mac-mini', status: 'online' },
      ],
      profiles: [macBook],
      savedMacCount: 2,
    });
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
    expect(
      assertUsbHeaderIdentityLaw({
        display,
        gatewayUrl: 'http://127.0.0.1:8642',
        health: { level: 'red', checkedAt: '2026-07-30T00:00:00.000Z' },
      }),
    ).toBeNull();
  });

  it('keeps Your computer label when unpaired with empty URL', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: null,
      gatewayUrl: '',
      health: null,
      connectionMode: 'relay',
      isPaired: false,
      workers: [],
      savedMacCount: 0,
    });
    expect(display.machineLabel).toBe('Your computer');
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
    expect(display.machineEndpoint).toBe('Home Wi‑Fi');
    expect(display.showDetailWhenConnected).toBe(true);
  });

  it('shows Home Wi‑Fi for single Mac LAN reach path', () => {
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
    expect(display.machineEndpoint).toBe('Home Wi‑Fi');
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
    expect(display.machineEndpoint).toContain('Tailscale · Igors-Mac-mini · skool');
  });

  it('shows the direct-link chip for loopback when live health hostname matches (not home LAN IP)', () => {
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
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
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

  it('shows hostname and the direct-link chip for adb reverse loopback when health is live', () => {
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
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
    expect(display.showDetailWhenConnected).toBe(true);
  });

  it('prefers live loopback hostname when saved profile disagrees with the attached Mac', () => {
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
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expect(formatChatMachineHeaderLine(display)).toBe(
      `Igors-MacBook-Pro · ${DIRECT_LINK_TRANSPORT_LABEL}`,
    );
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
  });

  it('never claims a named Mini owns the direct link when health is red (unknown machine)', () => {
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
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
  });

  it('keeps the placeholder label when the loopback name is still generic and health null', () => {
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
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
  });

  it('never invents Mini from profile hostname while loopback health is null', () => {
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

  it('INVARIANT: never borrows Mini name for a generic loopback row while reconnecting (health null)', () => {
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
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    // The exact string from Igor's 2026-07-30 screenshot ("Your computer · … · USB"),
    // now asserted to be cable-free.
    expect(formatChatMachineHeaderLine(display)).toBe(
      `${USB_UNKNOWN_MACHINE_LABEL} · ${DIRECT_LINK_TRANSPORT_LABEL}`,
    );
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
    expect(
      assertUsbHeaderIdentityLaw({
        display,
        gatewayUrl: 'http://127.0.0.1:8642',
        health: null,
      }),
    ).toBeNull();
  });

  it('INVARIANT multi-Mac: Mini selected + loopback + health null → never names Mini', () => {
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
    expect(line).not.toBe(`Igors-Mac-mini · ${DIRECT_LINK_TRANSPORT_LABEL}`);
    expect(line).not.toMatch(/Mac-mini/i);
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
    expectNoCableWordAnywhere(line);
  });

  it('INVARIANT multi-Mac: Mini selected + loopback + live health=MBP → names MBP, not Mini', () => {
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
    expect(formatChatMachineHeaderLine(display)).toBe(
      `Igors-MacBook-Pro · ${DIRECT_LINK_TRANSPORT_LABEL}`,
    );
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
    expect(formatChatMachineHeaderLine(display)).not.toMatch(/Mac-mini/i);
    expect(assertUsbHeaderIdentityLaw({ display, gatewayUrl: 'http://127.0.0.1:8642', health })).toBeNull();
  });

  it('INVARIANT multi-Mac: Mini selected + loopback + red health → never names Mini', () => {
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

  it('assertUsbHeaderIdentityLaw fails if code claims Mini owns the direct link without live health', () => {
    const err = assertUsbHeaderIdentityLaw({
      display: {
        machineLabel: 'Igors-Mac-mini',
        machineEndpoint: DIRECT_LINK_TRANSPORT_LABEL,
        showDetailWhenConnected: true,
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: null,
    });
    expect(err).toMatch(/without live green\/amber/);
  });

  it('suppresses the direct-link transport in unpaired relay when Mac HTTP is down (needs pair, not a local link)', () => {
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
    expect(display.machineEndpoint).toBeUndefined();
    expect(shouldClaimHeaderTransport({
      connectionMode: 'relay',
      isPaired: false,
      health: { level: 'red', checkedAt: '2026-06-24T00:00:00.000Z' },
    })).toBe(false);
  });

  it('never claims Tailscale transport while unpaired relay and Mac HTTP is down', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_ts',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://100.87.85.85:8642',
        hostname: 'Igors-MacBook-Pro.local',
        addedAt: '2026-07-20T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.87.85.85:8642',
      health: {
        level: 'red',
        checkedAt: '2026-07-20T00:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
        directGatewayReachable: false,
      },
      connectionMode: 'relay',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineLabel).toBe('Igors-MacBook-Pro');
    expect(display.machineEndpoint).toBeUndefined();
    expect(formatChatMachineHeaderLine(display)).toBe('Igors-MacBook-Pro');
    expect(formatChatMachineHeaderLine(display)).not.toContain('Tailscale');
  });

  it('keeps Tailscale transport when unpaired relay but direct Mac HTTP is up', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_ts',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://100.87.85.85:8642',
        hostname: 'Igors-MacBook-Pro.local',
        addedAt: '2026-07-20T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.87.85.85:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-20T00:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
        directGatewayReachable: true,
      },
      connectionMode: 'relay',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
    });
    expect(display.machineEndpoint).toBe('Tailscale');
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
  it('names the machine slot and the route instead of a vague failure', () => {
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
      machineEndpoint: DIRECT_LINK_TRANSPORT_LABEL,
    });
    // Retry banner uses sentence-case "your computer" (dual-copy SoT #737).
    // Exact-match subsumes the old "not vague" assertion: any wording that dropped
    // the machine slot or the route parenthetical fails this equality.
    expect(text).toBe(
      `Can't reach your computer (${DIRECT_LINK_TRANSPORT_LABEL}) — tap to retry`,
    );
    expectNoCableWordAnywhere(text);
  });

  it('COPY LAW: retry banner never names a cable even when machineEndpoint is missing', () => {
    const text = formatMacConnectionRetryBanner({
      connectionState: 'disconnected',
      gatewayUrl: 'http://127.0.0.1:8642',
      health: null,
      activeProfile: null,
    });
    expect(text).toBe(
      `Can't reach your computer (${DIRECT_LINK_TRANSPORT_LABEL}) — tap to retry`,
    );
    expectNoCableWordAnywhere(text);
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

describe('resolveHeaderTransportLabel / direct-link allow rule', () => {
  it('labels Tailscale and Home Wi‑Fi from successful reach URL', () => {
    expect(
      resolveHeaderTransportLabel({ gatewayUrl: 'http://100.87.85.85:8642' }),
    ).toBe('Tailscale');
    expect(
      resolveHeaderTransportLabel({
        gatewayUrl: 'http://igors-macbook-pro.tail12aa33.ts.net:8642',
      }),
    ).toBe('Tailscale');
    expect(
      resolveHeaderTransportLabel({ gatewayUrl: 'http://10.2.29.103:8642' }),
    ).toBe('Home Wi‑Fi');
  });

  it('allows the direct link for loopback on Wi‑Fi; cellular needs live /health (ghost guard)', () => {
    expect(
      isUsbHeaderTransportAllowed({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
      }),
    ).toBe(true);
    expect(
      resolveHeaderTransportLabel({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: true,
      }),
    ).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expect(
      isUsbHeaderTransportAllowed({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
      }),
    ).toBe(false);
    expect(
      resolveHeaderTransportLabel({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
      }),
    ).toBeUndefined();
    expect(
      resolveHeaderTransportLabel({
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        health: {
          level: 'green',
          checkedAt: '2026-07-21T13:00:00.000Z',
          hostname: 'Igors-MacBook-Pro.local',
        },
      }),
    ).toBe(DIRECT_LINK_TRANSPORT_LABEL);
  });

  it('COPY LAW: the loopback chip never contains the word USB in any allowed state', () => {
    const states = [
      { gatewayUrl: 'http://127.0.0.1:8642', wifiConnected: true },
      { gatewayUrl: 'http://localhost:8642', wifiConnected: true },
      {
        gatewayUrl: 'http://127.0.0.1:8642',
        wifiConnected: false,
        health: {
          level: 'green' as const,
          checkedAt: '2026-07-30T13:00:00.000Z',
          hostname: 'Igors-MacBook-Pro.local',
        },
      },
    ];
    for (const state of states) {
      const label = resolveHeaderTransportLabel(state);
      expect(label).toBe(DIRECT_LINK_TRANSPORT_LABEL);
      expectNoCableWordAnywhere(label!);
    }
  });

  it('shows the direct-link chip on cellular when live /health proves it (product lock)', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_usb',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '127.0.0.1',
        addedAt: '2026-07-16T00:00:00.000Z',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-16T11:05:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
      wifiConnected: false,
    });
    expect(formatChatMachineHeaderLine(display)).toBe(
      `Igors-MacBook-Pro · ${DIRECT_LINK_TRANSPORT_LABEL}`,
    );
    expect(display.machineEndpoint).toBe(DIRECT_LINK_TRANSPORT_LABEL);
    expectNoCableWordAnywhere(formatChatMachineHeaderLine(display));
    expect(usbHeaderClaimsNamedHost(display)).toBe(true);
  });

  it('never shows a transport chip on cellular for ghost loopback without live /health', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_usb',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '127.0.0.1',
        addedAt: '2026-07-16T00:00:00.000Z',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'red',
        checkedAt: '2026-07-16T11:05:00.000Z',
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
      wifiConnected: false,
    });
    expect(display.machineEndpoint).toBeUndefined();
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
  });

  it('shows Tailscale when reach URL is Tailscale on cellular', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_ts',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://100.87.85.85:8642',
        hostname: 'Igors-MacBook-Pro.local',
        addedAt: '2026-07-16T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.87.85.85:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-16T11:05:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
      wifiConnected: false,
    });
    expect(formatChatMachineHeaderLine(display)).toBe('Igors-MacBook-Pro · Tailscale');
  });

  it('never labels remote Tailscale mini as USB even with stale Mac mini USB profile label', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mini_ts',
        label: 'Mac mini USB',
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        addedAt: '2026-07-17T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-17T14:45:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel.toLowerCase()).not.toContain('usb');
    expect(display.machineEndpoint).toBe('Tailscale');
    expect(formatChatMachineHeaderLine(display)).toBe('Igors-Mac-mini · Tailscale');
    expect(formatChatMachineHeaderLine(display).toLowerCase()).not.toContain('usb');
  });

  it('names the live Mac when sticky activeProfile URL disagrees with gatewayUrl (Reach out goal)', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_book',
        label: 'Igors-MacBook-Pro',
        gatewayUrl: 'http://100.87.85.85:8642',
        hostname: 'Igors-MacBook-Pro.local',
        addedAt: '2026-07-20T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-20T22:20:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: true,
      workers: [],
      savedMacCount: 2,
      profiles: [
        {
          id: 'mac_book',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://100.87.85.85:8642',
          hostname: 'Igors-MacBook-Pro.local',
          addedAt: '2026-07-20T00:00:00.000Z',
        },
        {
          id: 'mac_mini',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          addedAt: '2026-07-20T00:00:00.000Z',
        },
      ],
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel).not.toContain('MacBook');
    expect(display.machineEndpoint).toBe('Tailscale');
  });

  it('keeps user-selected mini while effective URL is still Pro USB mid-switch', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_mini',
        label: 'Igors-Mac-mini',
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        addedAt: '2026-07-22T00:00:00.000Z',
      },
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-22T21:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: true,
      workers: [],
      savedMacCount: 2,
      profiles: [
        {
          id: 'mac_mini',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          addedAt: '2026-07-22T00:00:00.000Z',
        },
        {
          id: 'mac_book',
          label: 'Igors-MacBook-Pro',
          gatewayUrl: 'http://100.87.85.85:8642',
          hostname: 'Igors-MacBook-Pro.local',
          addedAt: '2026-07-22T00:00:01.000Z',
        },
      ],
      wifiConnected: true,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel).not.toContain('MacBook');
  });

  it('keeps mini sticky when URL matches mini even if stale health says Pro', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_mini',
        label: 'Igors-Mac-mini',
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        addedAt: '2026-07-22T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-22T21:00:00.000Z',
        hostname: 'Igors-MacBook-Pro.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: true,
      workers: [],
      savedMacCount: 2,
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel).not.toContain('MacBook');
  });

  it('P0 2026-07-24: Connected Tailscale never shows Tailscale CGNAT IP when /health.hostname is live', () => {
    const nameless = {
      id: 'mac_100_94_135_78',
      label: 'Tailscale 100.94.135.78',
      gatewayUrl: 'http://100.94.135.78:8642',
      localIp: '100.94.135.78',
      addedAt: '2026-07-24T00:00:00.000Z',
    };
    const health = {
      level: 'green' as const,
      checkedAt: '2026-07-24T19:00:00.000Z',
      hostname: 'Igors-Mac-mini.local',
      directGatewayReachable: true,
    };
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: nameless,
      gatewayUrl: nameless.gatewayUrl,
      health,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel).not.toMatch(/100\.94\.135\.78/);
    expect(display.machineEndpoint).toBe('Tailscale');
    expect(formatChatMachineHeaderLine(display)).toBe('Igors-Mac-mini · Tailscale');
  });

  it('P0 2026-07-24: profile without hostname still prefers live /health hostname over Tailscale IP label', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_100_94_135_78',
        label: 'Tailscale 100.94.135.78',
        gatewayUrl: 'http://100.94.135.78:8642',
        addedAt: '2026-07-24T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'amber',
        checkedAt: '2026-07-24T19:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: true,
      workers: [],
      savedMacCount: 2,
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineEndpoint).toBe('Tailscale');
  });

  it('P0 2026-07-24: health null uses persisted profile hostname not Tailscale IP label', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_100_94_135_78',
        label: 'Tailscale 100.94.135.78',
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '100.94.135.78',
        addedAt: '2026-07-24T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: null,
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel).not.toMatch(/100\.94\.135\.78/);
    expect(display.machineEndpoint).toBe('Tailscale');
  });

  it('P0 2026-07-24: Connected green /health without hostname never titles Tailscale CGNAT IP', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_100_94_135_78',
        label: 'Tailscale 100.94.135.78',
        gatewayUrl: 'http://100.94.135.78:8642',
        localIp: '100.94.135.78',
        addedAt: '2026-07-24T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-24T19:00:00.000Z',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Your computer');
    expect(display.machineLabel).not.toMatch(/100\.94\.135\.78/);
    expect(display.machineEndpoint).toBe('Tailscale');
    expect(formatChatMachineHeaderLine(display)).toBe('Your computer · Tailscale');
  });

  it('P0 2026-07-25: Connected never titles endpoint IP:port when /health.hostname is live', () => {
    // Device proof: header showed "100.94.135.78:8642 · Connected · Tailscale"
    // because a discovery label was the gateway endpoint, not the Mac name.
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_100_94_135_78',
        label: '100.94.135.78:8642',
        gatewayUrl: 'http://100.94.135.78:8642',
        localIp: '100.94.135.78',
        addedAt: '2026-07-25T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-25T13:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
      wifiConnected: true,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineLabel).not.toMatch(/100\.94\.135\.78/);
    expect(display.machineEndpoint).toBe('Tailscale');
    expect(formatChatMachineHeaderLine(display)).toBe('Igors-Mac-mini · Tailscale');
  });

  it('P0 2026-07-25: bare CGNAT IP profile label is not a computer name', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_100_94_135_78',
        label: '100.94.135.78',
        gatewayUrl: 'http://100.94.135.78:8642',
        localIp: '100.94.135.78',
        addedAt: '2026-07-25T00:00:00.000Z',
      },
      gatewayUrl: 'http://100.94.135.78:8642',
      health: {
        level: 'green',
        checkedAt: '2026-07-25T13:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        directGatewayReachable: true,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 1,
      wifiConnected: false,
    });
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(display.machineEndpoint).toBe('Tailscale');
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
