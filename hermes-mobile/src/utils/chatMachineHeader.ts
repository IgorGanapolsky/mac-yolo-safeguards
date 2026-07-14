import type { GatewayHealthSnapshot } from '../types/gateway';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import { GATEWAY_WRONG_KEY_MESSAGE, normalizeGatewayUrl } from '../services/gatewayClient';
import {
  isGenericMachineLabel,
  profileDisplayName,
} from '../services/gatewayProfiles';
import type { LeashConnectionState } from './gatewayEndpoint';
import { formatGatewayEndpointLine, formatGatewayMachineParts } from './gatewayEndpoint';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { relayWorkerDisplayName, selectRelayWorker } from './relayRouting';
import { isTailnetRouteLabel, isTailscaleGatewayUrl } from './tailscaleHosts';

/** Generic USB label when loopback is selected but live cable identity is unknown. */
export const USB_UNKNOWN_MACHINE_LABEL = 'Computer via USB';

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
    if (isLiveUsbHealthIdentity(health) && fromHealth) {
      return fromHealth;
    }
    // Unhealthy / unknown cable: never invent a saved Mac name from profiles.
    return USB_UNKNOWN_MACHINE_LABEL;
  }

  if (switchInFlight && activeProfile) {
    const switchingName = profileDisplayName(activeProfile);
    if (!isUnresolvedMachineName(switchingName)) {
      return switchingName;
    }
    const switchingHost = activeProfile.hostname?.replace(/\.local$/i, '').trim();
    if (switchingHost && !isUnresolvedMachineName(switchingHost)) {
      return switchingHost;
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

  return name;
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
}): ChatMachineHeaderDisplay {
  let machineLabel = resolveMachineDisplayName(
    input.activeProfile,
    input.gatewayUrl,
    input.health,
    input.profiles,
    { isDemo: input.isDemo },
  );

  if (input.connectionMode === 'relay') {
    if (!input.isPaired && !input.activeProfile) {
      machineLabel = 'Hermes account relay';
    } else if (input.isPaired) {
      const worker = selectRelayWorker(input.workers, input.activeWorkerId);
      if (worker && !input.activeProfile) {
        machineLabel = relayWorkerDisplayName(worker);
      }
    }
  }

  const loopbackUsb = isLoopbackGatewayUrl(input.gatewayUrl);
  const hasNamedMachine = Boolean(machineLabel && !isGenericMachineLabel(machineLabel));
  let ipLine = formatGatewayEndpointLine(input.gatewayUrl, input.health)?.trim();
  if (isTailscaleGatewayUrl(input.gatewayUrl)) {
    ipLine = 'Tailscale';
  }
  // Never show bare 127.0.0.1:8642 in the header — USB is the human route label.
  if (loopbackUsb) {
    ipLine = 'USB';
  }
  const detailParts: string[] = [];
  const savedMacCount = input.savedMacCount ?? 0;
  const profileIp = input.activeProfile?.localIp?.trim();

  const labelContainsIp =
    Boolean(profileIp && machineLabel.includes(profileIp)) ||
    Boolean(
      ipLine &&
        ipLine !== 'USB' &&
        ipLine !== 'Tailscale' &&
        machineLabel.includes(ipLine.split(':')[0]),
    );

  if (ipLine && (savedMacCount > 1 || loopbackUsb || !labelContainsIp)) {
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
        detailParts.push(`relay · ${workerName}`);
      }
    }
  }

  return {
    machineLabel,
    machineEndpoint: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
    showDetailWhenConnected:
      savedMacCount > 1 ||
      loopbackUsb ||
      detailParts.some((part) => part.startsWith('relay ·')) ||
      (isTailscaleGatewayUrl(input.gatewayUrl) &&
        hasNamedMachine &&
        !isTailnetRouteLabel(machineLabel)),
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
    input.machineLabel !== 'Hermes account relay' &&
    !/^(http|https)$/i.test(input.machineLabel)
      ? input.machineLabel
      : !isGenericMachineLabel(machineName) &&
          machineName !== 'computer' &&
          !/^(http|https)$/i.test(machineName)
        ? machineName
        : machineName !== 'Hermes account relay' && !/^(http|https)$/i.test(machineName)
          ? machineName
          : 'your computer';

  if (input.authMismatch) {
    return label === 'your computer'
      ? `${GATEWAY_WRONG_KEY_MESSAGE} — tap to re-pair`
      : `${GATEWAY_WRONG_KEY_MESSAGE} (${label}) — tap to re-pair`;
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
