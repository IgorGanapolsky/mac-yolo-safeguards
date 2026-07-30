import type { GatewayHealthSnapshot } from '../types/gateway';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import { GATEWAY_WRONG_KEY_MESSAGE, normalizeGatewayUrl } from '../services/gatewayClient';
import {
  findProfileForGatewayUrl,
  isGenericMachineLabel,
  profileDisplayName,
  profileMachineKey,
  stripTransportSuffixFromComputerName,
} from '../services/gatewayProfiles';
import type { LeashConnectionState } from './gatewayEndpoint';
import {
  formatGatewayEndpointLine,
  formatGatewayMachineParts,
  isPrivateLanGatewayUrl,
} from './gatewayEndpoint';
import { isMacGatewayHttpOk } from './gatewayConnection';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { isUsbTransportAllowed, profileMatchesHostname } from './gatewayProfilePicker';
import { relayWorkerDisplayName, selectRelayWorker } from './relayRouting';
import { isTailnetRouteLabel, isTailscaleGatewayUrl } from './tailscaleHosts';

/**
 * PRODUCT LAW (2026-07-20): never claim Tailscale/USB/Home Wi‑Fi as the live path when
 * connectionMode is relay, the account is unpaired, and direct Mac HTTP is down.
 * Tailnet presence ≠ app paired — that misdiagnosis showed "Connecting · Tailscale"
 * above "Hermes relay is not paired yet".
 */
export function shouldClaimHeaderTransport(input: {
  connectionMode: ConnectionMode;
  isPaired: boolean;
  health?: GatewayHealthSnapshot | null;
}): boolean {
  if (input.connectionMode === 'relay' && !input.isPaired && !isMacGatewayHttpOk(input.health)) {
    return false;
  }
  return true;
}

/**
 * Header transport chip from the URL that actually succeeded this session.
 *
 * CEO 2026-07-26 / 2026-07-30: product surface is Tailscale + Home Wi‑Fi only.
 * Loopback/cable is never labeled "USB" unless EXPO_PUBLIC_ALLOW_USB_TRANSPORT=1
 * (agent dogfood escape hatch). Real users must never see "USB" in the header.
 */
export function resolveHeaderTransportLabel(input: {
  gatewayUrl: string;
  wifiConnected?: boolean;
  health?: GatewayHealthSnapshot | null;
}): string | undefined {
  const gatewayUrl = input.gatewayUrl?.trim() ?? '';
  if (!gatewayUrl) {
    return undefined;
  }
  // Tailscale wins before any loopback check — remote Macs are never cable.
  if (isTailscaleGatewayUrl(gatewayUrl)) {
    return 'Tailscale';
  }
  if (isLoopbackGatewayUrl(gatewayUrl)) {
    // Default product: never name the cable. Escape hatch only for dogfood.
    if (!isUsbTransportAllowed()) {
      return undefined;
    }
    // Cellular + 127.0.0.1 without live /health is a stale reverse ghost.
    if (input.wifiConnected === false) {
      const host = input.health?.hostname?.trim();
      const live =
        Boolean(host) &&
        !input.health?.authMismatch &&
        (input.health?.level === 'green' || input.health?.level === 'amber');
      if (!live) {
        return undefined;
      }
    }
    return 'USB';
  }
  if (isPrivateLanGatewayUrl(gatewayUrl)) {
    return 'Home Wi‑Fi';
  }
  return formatGatewayEndpointLine(gatewayUrl, input.health)?.trim() || undefined;
}

/** True only when dogfood USB is allowed AND loopback is the live reach URL. */
export function isUsbHeaderTransportAllowed(input: {
  gatewayUrl: string;
  wifiConnected?: boolean;
  health?: GatewayHealthSnapshot | null;
}): boolean {
  if (!isUsbTransportAllowed()) {
    return false;
  }
  return (
    isLoopbackGatewayUrl(input.gatewayUrl) &&
    resolveHeaderTransportLabel(input) === 'USB'
  );
}

/**
 * Generic label when loopback is selected but live cable identity is unknown.
 * Must not say "Computer via USB" — that markets a dead USB path off-home (2026-07-21).
 */
export const USB_UNKNOWN_MACHINE_LABEL = 'Your computer';

function healthHostname(health?: GatewayHealthSnapshot | null): string | undefined {
  return health?.hostname?.replace(/\.local$/i, '').trim() || undefined;
}

function profileGatewayUrlKey(gatewayUrl: string): string {
  try {
    return normalizeGatewayUrl(gatewayUrl).httpBase;
  } catch {
    return gatewayUrl.trim().replace(/\/+$/, '');
  }
}

/** Active profile was chosen but settings/health still reflect the previous route. */
export function isActiveProfileSwitchInFlight(
  activeProfile: GatewayProfile | null | undefined,
  gatewayUrl: string,
): boolean {
  if (!activeProfile?.gatewayUrl?.trim() || !gatewayUrl.trim()) {
    return false;
  }
  return profileGatewayUrlKey(activeProfile.gatewayUrl) !== profileGatewayUrlKey(gatewayUrl);
}

/**
 * True when a string is an address, not a human computer name.
 * Covers bare CGNAT/LAN IPv4 and "IPv4:port" titles that discovery sometimes
 * persisted as the profile label — those must never win over live
 * /health.hostname (Connected header showed the endpoint instead of the Mac).
 */
function isAddressShapedMachineName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  // Bare IPv4 or IPv4:port
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(trimmed)) {
    return true;
  }
  // http(s)://host:port leftovers
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  return false;
}

function isUnresolvedMachineName(name: string): boolean {
  return (
    isGenericMachineLabel(name) ||
    isAddressShapedMachineName(name) ||
    name === 'computer' ||
    isTailnetRouteLabel(name) ||
    /^(http|https)$/i.test(name)
  );
}

/** Live adb-reverse identity: green/amber /health with a real hostname. */
export function isLiveUsbHealthIdentity(health?: GatewayHealthSnapshot | null): boolean {
  if (!health || health.directGatewayReachable === false) {
    return false;
  }
  if (health.level !== 'green' && health.level !== 'amber') {
    return false;
  }
  const host = healthHostname(health);
  return Boolean(host && !isUnresolvedMachineName(host));
}

/**
 * PRODUCT LAW (multi-Mac USB):
 * Header may show "X · USB" only when live /health (green|amber) hostname is X.
 * While health is null/red, never claim a saved Mac (e.g. another saved Mac) owns the cable.
 */
export function resolveMachineDisplayName(
  activeProfile: GatewayProfile | null | undefined,
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
  _profiles?: GatewayProfile[],
  options?: { isDemo?: boolean },
): string {
  const loopbackUsb = isLoopbackGatewayUrl(gatewayUrl);
  const fromHealth = healthHostname(health);
  const switchInFlight = isActiveProfileSwitchInFlight(activeProfile, gatewayUrl);

  // Demo / fixture loopback uses localhost with a named "Demo computer" profile — keep that label.
  if (
    options?.isDemo ||
    (activeProfile && /^demo computer$/i.test(profileDisplayName(activeProfile).trim()))
  ) {
    const demoName = activeProfile ? profileDisplayName(activeProfile) : undefined;
    if (demoName && !isUnresolvedMachineName(demoName)) {
      return demoName;
    }
  }

  if (loopbackUsb) {
    // User just selected a remote Mac (mini Tailscale) while effective URL is still
    // Pro USB — keep the selected name, do not flash the cable Mac (2026-07-22).
    if (
      switchInFlight &&
      activeProfile &&
      !isLoopbackGatewayUrl(activeProfile.gatewayUrl)
    ) {
      const stickyName = profileDisplayName(activeProfile);
      if (!isUnresolvedMachineName(stickyName)) {
        return stickyName;
      }
      const stickyHost = activeProfile.hostname?.replace(/\.local$/i, '').trim();
      if (stickyHost && !isUnresolvedMachineName(stickyHost)) {
        return stickyHost;
      }
    }
    if (isLiveUsbHealthIdentity(health) && fromHealth) {
      return fromHealth;
    }
    // Unhealthy / unknown cable: never invent a saved Mac name from profiles.
    return USB_UNKNOWN_MACHINE_LABEL;
  }

  // PRODUCT LAW (multi-Mac): during a switch, prefer the user-selected active Mac.
  // Exception (2026-07-20 Reach-out-goal): non-loopback gatewayUrl already belongs to a
  // *different* saved computer AND live /health agrees — chat really POSTed there.
  // Stale Pro USB/health must not rename a just-selected Mini (2026-07-22 rage).
  if (switchInFlight) {
    const urlMatched = findProfileForGatewayUrl(_profiles ?? [], gatewayUrl);
    const activeKey = activeProfile ? profileMachineKey(activeProfile) : undefined;
    const urlKey = urlMatched ? profileMachineKey(urlMatched) : undefined;
    const urlOwnsDifferentMac = Boolean(activeKey && urlKey && activeKey !== urlKey);
    const healthAgreesWithUrl =
      Boolean(fromHealth) &&
      Boolean(urlMatched) &&
      !isLoopbackGatewayUrl(gatewayUrl) &&
      profileMatchesHostname(urlMatched!, fromHealth!);

    if (urlOwnsDifferentMac && healthAgreesWithUrl) {
      if (fromHealth && !isUnresolvedMachineName(fromHealth)) {
        return fromHealth;
      }
      if (urlMatched) {
        const matchedName = profileDisplayName(urlMatched);
        if (!isUnresolvedMachineName(matchedName)) {
          return matchedName;
        }
      }
    }

    if (activeProfile) {
      const stickyName = profileDisplayName(activeProfile);
      if (!isUnresolvedMachineName(stickyName)) {
        return stickyName;
      }
      const stickyHost = activeProfile.hostname?.replace(/\.local$/i, '').trim();
      if (stickyHost && !isUnresolvedMachineName(stickyHost)) {
        return stickyHost;
      }
    }

    if (fromHealth && !isUnresolvedMachineName(fromHealth)) {
      return fromHealth;
    }
    const fromUrl = formatGatewayMachineParts(gatewayUrl, health).machineName;
    if (fromUrl && !isUnresolvedMachineName(fromUrl)) {
      return stripTransportSuffixFromComputerName(fromUrl);
    }
    return 'Your computer';
  }

  // PRODUCT LAW (2026-07-24 / tightened 2026-07-25 Connected Tailscale):
  // Live green|amber /health.hostname always beats IP-shaped profile titles
  // (bare CGNAT/LAN IPv4, IPv4:port, "Tailscale <CGNAT-IP>"). Transport chip
  // already says Tailscale — the name slot is for the Mac.
  if (
    isTailscaleGatewayUrl(gatewayUrl) &&
    fromHealth &&
    !isUnresolvedMachineName(fromHealth) &&
    !health?.authMismatch &&
    (health?.level === 'green' || health?.level === 'amber')
  ) {
    const profileName = activeProfile ? profileDisplayName(activeProfile) : '';
    if (!activeProfile || isUnresolvedMachineName(profileName)) {
      return fromHealth;
    }
  }

  if (activeProfile) {
    const fromProfile = profileDisplayName(activeProfile);
    if (!isUnresolvedMachineName(fromProfile)) {
      return fromProfile;
    }
    const profileHost = activeProfile.hostname?.replace(/\.local$/i, '').trim();
    if (profileHost && !isUnresolvedMachineName(profileHost)) {
      return profileHost;
    }
  }

  let name = activeProfile
    ? profileDisplayName(activeProfile)
    : formatGatewayMachineParts(gatewayUrl, health).machineName;

  if (fromHealth && isUnresolvedMachineName(name)) {
    name = fromHealth;
  }

  // PRODUCT LAW (2026-07-24 / 2026-07-25): never title a Tailscale Mac as an address.
  // Transport badge already says Tailscale; IP/IP:port is not a machine name.
  if (isTailscaleGatewayUrl(gatewayUrl) && isUnresolvedMachineName(name)) {
    name = 'Your computer';
  }

  // Never bake "USB" into the computer title (e.g. saved "Mac mini USB" + Tailscale).
  return stripTransportSuffixFromComputerName(name);
}

export type ChatMachineHeaderDisplay = {
  machineLabel: string;
  machineEndpoint?: string;
  /** Show IP / relay detail even when chat HTTP is up — needed with multiple saved Macs. */
  showDetailWhenConnected: boolean;
};

/** Single-line form used in chat header (e.g. "Host · USB"). */
export function formatChatMachineHeaderLine(display: ChatMachineHeaderDisplay): string {
  if (display.machineEndpoint?.trim()) {
    return `${display.machineLabel} · ${display.machineEndpoint.trim()}`;
  }
  return display.machineLabel;
}

/**
 * True when header claims a *named* Mac owns USB (not "Computer via USB · USB").
 * Required gate: never true unless live USB /health hostname matches that name.
 */
export function usbHeaderClaimsNamedHost(display: ChatMachineHeaderDisplay): boolean {
  if (display.machineEndpoint !== 'USB') {
    return false;
  }
  const label = display.machineLabel.trim();
  if (!label || label === USB_UNKNOWN_MACHINE_LABEL) {
    return false;
  }
  return !isGenericMachineLabel(label) && !isUnresolvedMachineName(label);
}

/**
 * Invariant for tests/CI: named "X · USB" requires live green|amber health hostname matching X.
 * Returns null when OK, or a human error string when the law is broken.
 */
export function assertUsbHeaderIdentityLaw(input: {
  display: ChatMachineHeaderDisplay;
  gatewayUrl: string;
  health?: GatewayHealthSnapshot | null;
}): string | null {
  if (!isLoopbackGatewayUrl(input.gatewayUrl)) {
    return null;
  }
  if (!usbHeaderClaimsNamedHost(input.display)) {
    return null;
  }
  if (!isLiveUsbHealthIdentity(input.health)) {
    return `USB header claims "${input.display.machineLabel}" without live green/amber /health hostname`;
  }
  const live = healthHostname(input.health);
  if (!live) {
    return `USB header claims "${input.display.machineLabel}" but live host is missing`;
  }
  // Named claim must match live host (case-insensitive host stem).
  const claimed = input.display.machineLabel.replace(/\.local$/i, '').trim().toLowerCase();
  const liveStem = live.replace(/\.local$/i, '').trim().toLowerCase();
  if (claimed !== liveStem && !liveStem.includes(claimed) && !claimed.includes(liveStem)) {
    return `USB header claims "${input.display.machineLabel}" but live /health is "${live}"`;
  }
  return null;
}

/**
 * Last real machine name we actually know before falling back to the
 * "Your computer" placeholder.
 *
 * DEFECT (2026-07-30, real device): the header read "Your computer · Waiting for
 * approval pairing…" even though the machine name was knowable. The two
 * placeholder assignments below fired on `!activeProfile` alone and threw away
 * names that were already in hand — the relay's own worker list and a single
 * saved computer. This resolves the name from the sources we have instead of
 * hard-coding the placeholder; "Your computer" is now only used when nothing
 * whatsoever identifies the machine.
 *
 * Deliberately conservative: with more than one saved computer and no active
 * selection there is no unambiguous answer, so the placeholder still wins
 * (never invent which Mac the user meant).
 *
 * Precedence obeys this module's USB identity law: a live green|amber /health
 * hostname is proof of which Mac we are actually talking to, so it outranks an
 * *unselected* saved profile that may well name a different machine. Getting
 * this backwards could title the header with the Mac mini while /health proves
 * the link reaches the MacBook.
 */
function knownMachineNameOrPlaceholder(input: {
  workers: RelayWorker[];
  activeWorkerId?: string | null;
  profiles?: GatewayProfile[];
  health?: GatewayHealthSnapshot | null;
}): string {
  const fromHealth = healthHostname(input.health);

  // 1. Live, proven identity wins outright.
  if (isLiveUsbHealthIdentity(input.health) && fromHealth) {
    return stripTransportSuffixFromComputerName(fromHealth);
  }

  // 2. The relay names its own worker.
  const worker = selectRelayWorker(input.workers, input.activeWorkerId);
  if (worker) {
    const workerName = relayWorkerDisplayName(worker).trim();
    if (workerName && !isUnresolvedMachineName(workerName)) {
      return stripTransportSuffixFromComputerName(workerName);
    }
  }

  // 3. Exactly one saved computer is unambiguous — but never proof.
  const profiles = input.profiles ?? [];
  if (profiles.length === 1) {
    const only = profiles[0];
    const profileName = profileDisplayName(only).trim();
    if (profileName && !isUnresolvedMachineName(profileName)) {
      return stripTransportSuffixFromComputerName(profileName);
    }
    const profileHost = only.hostname?.replace(/\.local$/i, '').trim();
    if (profileHost && !isUnresolvedMachineName(profileHost)) {
      return stripTransportSuffixFromComputerName(profileHost);
    }
  }

  // 4. Any remaining /health hostname beats the placeholder.
  if (fromHealth && !isUnresolvedMachineName(fromHealth)) {
    return stripTransportSuffixFromComputerName(fromHealth);
  }

  return 'Your computer';
}

export function resolveChatMachineHeaderDisplay(input: {
  activeProfile?: GatewayProfile | null;
  gatewayUrl: string;
  health?: GatewayHealthSnapshot | null;
  connectionMode: ConnectionMode;
  isPaired: boolean;
  workers: RelayWorker[];
  activeWorkerId?: string | null;
  savedMacCount?: number;
  profiles?: GatewayProfile[];
  isDemo?: boolean;
  /**
   * When false (cellular), only claim USB if live /health proves the cable
   * (see resolveHeaderTransportLabel). Ghost loopback stays silent.
   */
  wifiConnected?: boolean;
}): ChatMachineHeaderDisplay {
  const gatewayUrl = input.gatewayUrl?.trim() ?? '';

  let machineLabel = resolveMachineDisplayName(
    input.activeProfile,
    gatewayUrl,
    input.health,
    input.profiles,
    { isDemo: input.isDemo },
  );

  if (input.connectionMode === 'relay') {
    if (!input.isPaired && !input.activeProfile) {
      // Unpaired relay: still prefer a real name we already know (relay worker /
      // single saved computer / live health) over the "Your computer" placeholder.
      machineLabel = knownMachineNameOrPlaceholder(input);
    } else if (input.isPaired) {
      const worker = selectRelayWorker(input.workers, input.activeWorkerId);
      if (worker && !input.activeProfile) {
        machineLabel = relayWorkerDisplayName(worker);
      }
    }
  } else if (!gatewayUrl && !input.activeProfile && !input.isDemo) {
    // Fresh gateway-mode install with no URL — never claim a transport we cannot
    // prove, but do use a real machine name when one is already known.
    machineLabel = knownMachineNameOrPlaceholder(input);
  }

  // No URL yet: skip USB/IP endpoint details entirely.
  if (!gatewayUrl && !input.activeProfile && !input.isDemo) {
    return {
      machineLabel,
      machineEndpoint: undefined,
      showDetailWhenConnected: false,
    };
  }

  const claimTransport = shouldClaimHeaderTransport({
    connectionMode: input.connectionMode,
    isPaired: input.isPaired,
    health: input.health,
  });
  const usbAllowed =
    claimTransport &&
    isUsbHeaderTransportAllowed({
      gatewayUrl,
      wifiConnected: input.wifiConnected,
      health: input.health,
    });
  const hasNamedMachine = Boolean(machineLabel && !isGenericMachineLabel(machineLabel));
  const ipLine = claimTransport
    ? resolveHeaderTransportLabel({
        gatewayUrl,
        wifiConnected: input.wifiConnected,
        health: input.health,
      })
    : undefined;
  const detailParts: string[] = [];
  const savedMacCount = input.savedMacCount ?? 0;
  const profileIp = input.activeProfile?.localIp?.trim();

  const labelContainsIp =
    Boolean(profileIp && machineLabel.includes(profileIp)) ||
    Boolean(
      ipLine &&
        ipLine !== 'USB' &&
        ipLine !== 'Tailscale' &&
        ipLine !== 'Home Wi‑Fi' &&
        machineLabel.includes(ipLine.split(':')[0]),
    );

  // Show transport when multi-Mac, USB (Wi‑Fi only), Tailscale/Home Wi‑Fi, or IP not in label.
  // Unpaired relay without direct Mac HTTP never claims a transport chip (see shouldClaimHeaderTransport).
  if (
    ipLine &&
    (savedMacCount > 1 ||
      usbAllowed ||
      ipLine === 'Tailscale' ||
      ipLine === 'Home Wi‑Fi' ||
      !labelContainsIp)
  ) {
    detailParts.push(ipLine);
  }

  if (input.connectionMode === 'relay' && input.isPaired) {
    const worker = selectRelayWorker(input.workers, input.activeWorkerId);
    if (worker) {
      const workerName = relayWorkerDisplayName(worker);
      if (
        workerName &&
        workerName !== 'active worker' &&
        workerName !== machineLabel &&
        !machineLabel.includes(workerName)
      ) {
        detailParts.push(`Tailscale · ${workerName}`);
      }
    }
  }

  return {
    machineLabel,
    machineEndpoint: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
    showDetailWhenConnected:
      claimTransport &&
      (savedMacCount > 1 ||
        usbAllowed ||
        detailParts.some((part) => part.startsWith('Tailscale ·')) ||
        (isTailscaleGatewayUrl(gatewayUrl) &&
          hasNamedMachine &&
          !isTailnetRouteLabel(machineLabel)) ||
        detailParts.includes('Home Wi‑Fi')),
  };
}

/** Orange composer banner when direct Mac HTTP is down — always name the machine + route. */
export function formatMacConnectionRetryBanner(input: {
  connectionState: LeashConnectionState;
  connectingStuck?: boolean;
  gatewayUrl: string;
  health?: GatewayHealthSnapshot | null;
  activeProfile?: GatewayProfile | null;
  profiles?: GatewayProfile[];
  machineLabel?: string;
  machineEndpoint?: string;
  authMismatch?: boolean;
}): string {
  const machineName = resolveMachineDisplayName(
    input.activeProfile,
    input.gatewayUrl,
    input.health,
    input.profiles,
  );
  const label =
    input.machineLabel &&
    !isGenericMachineLabel(input.machineLabel) &&
    input.machineLabel !== 'Your computer' &&
    input.machineLabel !== 'Hermes account relay' &&
    !/^(http|https)$/i.test(input.machineLabel)
      ? input.machineLabel
      : !isGenericMachineLabel(machineName) &&
          machineName !== 'computer' &&
          !/^(http|https)$/i.test(machineName)
        ? machineName
        : machineName !== 'Your computer' &&
          machineName !== 'Hermes account relay' &&
          !/^(http|https)$/i.test(machineName)
          ? machineName
          : 'your computer';

  if (input.authMismatch) {
    return label === 'your computer'
      ? `${GATEWAY_WRONG_KEY_MESSAGE} — tap to reconnect`
      : `${GATEWAY_WRONG_KEY_MESSAGE} (${label}) — tap to reconnect`;
  }

  if (input.connectionState === 'connecting' && !input.connectingStuck) {
    return label === 'your computer'
      ? 'Connecting to your computer… tap to retry'
      : `Connecting to ${label}… tap to retry`;
  }

  const loopbackUsb = isLoopbackGatewayUrl(input.gatewayUrl);
  let routeDetail = input.machineEndpoint?.trim();
  if (!routeDetail || (loopbackUsb && routeDetail.includes('127.0.0.1'))) {
    const endpointLine = formatGatewayEndpointLine(input.gatewayUrl, input.health)?.trim();
    // Never put "USB" in user-facing retry copy (Tailscale-only product surface).
    routeDetail = loopbackUsb
      ? isUsbTransportAllowed()
        ? 'USB'
        : endpointLine && !/127\.0\.0\.1|localhost/i.test(endpointLine)
          ? endpointLine
          : undefined
      : endpointLine || input.gatewayUrl.trim();
  }
  if (routeDetail && !isUsbTransportAllowed() && /\bUSB\b/i.test(routeDetail)) {
    routeDetail = undefined;
  }

  if (routeDetail) {
    return `Can't reach ${label} (${routeDetail}) — tap to retry`;
  }
  return `Can't reach ${label} — tap to retry`;
}
