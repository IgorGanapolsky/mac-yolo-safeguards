import type { GatewayHealthSnapshot } from '../types/gateway';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';
import {
  GENERIC_USB_PROFILE_LABEL,
  isGenericMachineLabel,
  profileDisplayName,
  profilesShareMachine,
} from '../services/gatewayProfiles';
import type { LeashConnectionState } from './gatewayEndpoint';
import { formatGatewayEndpointLine, formatGatewayMachineParts } from './gatewayEndpoint';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { profileMatchesHostname } from './gatewayProfilePicker';
import { relayWorkerDisplayName, selectRelayWorker } from './relayRouting';
import { isTailnetRouteLabel, isTailscaleGatewayUrl } from './tailscaleHosts';

function healthHostname(health?: GatewayHealthSnapshot | null): string | undefined {
  return health?.hostname?.replace(/\.local$/i, '').trim() || undefined;
}

function usbTunnelHostname(health?: GatewayHealthSnapshot | null): string | undefined {
  return health?.usbTunnelHostname?.replace(/\.local$/i, '').trim() || undefined;
}

function isLiveUsbHealthHostname(
  health: GatewayHealthSnapshot | null | undefined,
  hostname: string,
): boolean {
  return (
    Boolean(hostname) &&
    health?.directGatewayReachable !== false &&
    (health?.level === 'green' || health?.level === 'amber')
  );
}

function isUnresolvedMachineName(name: string): boolean {
  return (
    isGenericMachineLabel(name) ||
    name === 'computer' ||
    isTailnetRouteLabel(name) ||
    /^(http|https)$/i.test(name)
  );
}

/** Borrow a friendly name from saved profiles when the active row is still generic (USB loopback). */
function borrowMachineNameFromProfiles(input: {
  activeProfile?: GatewayProfile | null;
  profiles?: GatewayProfile[];
  health?: GatewayHealthSnapshot | null;
}): string | undefined {
  const profiles = input.profiles ?? [];
  if (profiles.length === 0) {
    return undefined;
  }

  const active = input.activeProfile;
  const fromHealth = healthHostname(input.health);
  if (fromHealth) {
    const match = profiles.find((profile) => profileMatchesHostname(profile, fromHealth));
    if (match) {
      const matchedName = profileDisplayName(match);
      if (!isUnresolvedMachineName(matchedName)) {
        return matchedName;
      }
    }
    if (!isUnresolvedMachineName(fromHealth)) {
      return fromHealth;
    }
  }

  if (!active) {
    return undefined;
  }

  const canonical = profiles.find((profile) => profile.id === active.id) ?? active;
  const canonicalHost = canonical.hostname?.replace(/\.local$/i, '').trim();
  if (canonicalHost && !isUnresolvedMachineName(canonicalHost)) {
    return canonicalHost;
  }
  const canonicalLabel = profileDisplayName(canonical);
  if (!isUnresolvedMachineName(canonicalLabel)) {
    return canonicalLabel;
  }

  if (!isLoopbackGatewayUrl(active.gatewayUrl)) {
    return undefined;
  }

  const namedSiblings = profiles.filter((profile) => {
    if (profile.id === active.id) {
      return false;
    }
    const name = profileDisplayName(profile);
    return !isUnresolvedMachineName(name) && profilesShareMachine(profile, canonical);
  });
  if (namedSiblings.length === 1) {
    return profileDisplayName(namedSiblings[0]);
  }

  return undefined;
}

/** Prefer the saved active profile name; only borrow /health hostname when identity is still generic. */
export function resolveMachineDisplayName(
  activeProfile: GatewayProfile | null | undefined,
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
  profiles?: GatewayProfile[],
): string {
  const loopbackUsb = isLoopbackGatewayUrl(gatewayUrl);
  const fromPairServer = usbTunnelHostname(health);
  const fromHealth = healthHostname(health);
  const liveUsbHost =
    loopbackUsb &&
    fromHealth &&
    isLiveUsbHealthHostname(health, fromHealth);

  // Pair-server hostname is authoritative for adb reverse — always wins on USB loopback.
  if (loopbackUsb && fromPairServer) {
    if (!activeProfile || !profileMatchesHostname(activeProfile, fromPairServer)) {
      return fromPairServer;
    }
    const activeName = profileDisplayName(activeProfile);
    if (!isUnresolvedMachineName(activeName)) {
      return activeName;
    }
    return fromPairServer;
  }

  // USB adb reverse reaches whichever Mac is plugged in — live /health hostname wins over stale profile.
  if (liveUsbHost) {
    if (!activeProfile || !profileMatchesHostname(activeProfile, fromHealth!)) {
      return fromHealth!;
    }
  }

  if (loopbackUsb) {
    // Stale red /health hostname can lag after switching USB hosts — trust named active profile.
    if (
      fromHealth &&
      health?.level === 'red' &&
      activeProfile &&
      !profileMatchesHostname(activeProfile, fromHealth)
    ) {
      const activeName = profileDisplayName(activeProfile);
      if (!isUnresolvedMachineName(activeName)) {
        return activeName;
      }
    }
    // No tunnel identity at all — never trust a named saved profile on loopback (may be the wrong Mac).
    if (
      !fromPairServer &&
      !liveUsbHost &&
      !fromHealth &&
      activeProfile &&
      !isGenericMachineLabel(profileDisplayName(activeProfile))
    ) {
      return GENERIC_USB_PROFILE_LABEL;
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

  if (isUnresolvedMachineName(name)) {
    const borrowed = borrowMachineNameFromProfiles({ activeProfile, profiles, health });
    if (borrowed) {
      return borrowed;
    }
  }

  return name;
}

export type ChatMachineHeaderDisplay = {
  machineLabel: string;
  machineEndpoint?: string;
  /** Show IP / relay detail even when chat HTTP is up — needed with multiple saved Macs. */
  showDetailWhenConnected: boolean;
};

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
  /** Chat HTTP to :8642 is up — required before claiming USB route in the header. */
  macHttpOk?: boolean;
}): ChatMachineHeaderDisplay {
  let machineLabel = resolveMachineDisplayName(
    input.activeProfile,
    input.gatewayUrl,
    input.health,
    input.profiles,
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
  const usbReverseActive =
    loopbackUsb &&
    (input.macHttpOk === true ||
      Boolean(usbTunnelHostname(input.health)) ||
      input.health?.directGatewayReachable === true);
  const hasNamedMachine = Boolean(machineLabel && !isGenericMachineLabel(machineLabel));
  let ipLine: string | undefined = formatGatewayEndpointLine(input.gatewayUrl, input.health)?.trim();
  if (isTailscaleGatewayUrl(input.gatewayUrl)) {
    ipLine = 'Tailscale';
  }
  // Never show bare 127.0.0.1:8642 in the header — USB is the human route label when reverse is active.
  if (usbReverseActive) {
    ipLine = 'USB';
  } else if (loopbackUsb) {
    ipLine = undefined;
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

  if (ipLine && (savedMacCount > 1 || usbReverseActive || !labelContainsIp)) {
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
      usbReverseActive ||
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
