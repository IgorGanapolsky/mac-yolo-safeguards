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
import { profileMatchesHostname } from './gatewayProfilePicker';
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
 * USB: live loopback on Wi‑Fi, or cellular when /health proves a live cable Mac
 * (hostname + green|amber). Ghost 127.0.0.1 on cellular without live health stays silent.
 * Never USB for Tailscale/MagicDNS/100.x (remote mini in another city).
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
  // Tailscale wins before any loopback/USB check — remote Macs are never USB.
  if (isTailscaleGatewayUrl(gatewayUrl)) {
    return 'Tailscale';
  }
  if (isLoopbackGatewayUrl(gatewayUrl)) {
    // Cellular + 127.0.0.1 without live /health is a stale USB primary / wireless-adb ghost.
    // Live hostname on green|amber proves adb reverse — claim USB even on 5G (product lock).
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

/** USB header chip when loopback is the reach URL and Wi‑Fi or live-cable health confirms. */
export function isUsbHeaderTransportAllowed(input: {
  gatewayUrl: string;
  wifiConnected?: boolean;
  health?: GatewayHealthSnapshot | null;
}): boolean {
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

function isUnresolvedMachineName(name: string): boolean {
  return (
    isGenericMachineLabel(name) ||
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

  // PRODUCT LAW (2026-07-24 Connected Tailscale): never show "Tailscale <CGNAT-IP>" when
  // live green|amber /health.hostname is available (prefer health → persisted hostname).
  if (
    isTailscaleGatewayUrl(gatewayUrl) &&
    fromHealth &&
    !isUnresolvedMachineName(fromHealth) &&
    !health?.authMismatch &&
    (health?.level === 'green' || health?.level === 'amber')
  ) {
    if (!activeProfile || isUnresolvedMachineName(profileDisplayName(activeProfile))) {
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
      machineLabel = 'Your computer';
    } else if (input.isPaired) {
      const worker = selectRelayWorker(input.workers, input.activeWorkerId);
      if (worker && !input.activeProfile) {
        machineLabel = relayWorkerDisplayName(worker);
      }
    }
  } else if (!gatewayUrl && !input.activeProfile && !input.isDemo) {
    // Fresh gateway-mode install with no URL — never claim "Computer via USB".
    machineLabel = 'Your computer';
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
    routeDetail = loopbackUsb ? 'USB' : endpointLine || input.gatewayUrl.trim();
  }

  if (routeDetail) {
    return `Can't reach ${label} (${routeDetail}) — tap to retry`;
  }
  return `Can't reach ${label} — tap to retry`;
}
