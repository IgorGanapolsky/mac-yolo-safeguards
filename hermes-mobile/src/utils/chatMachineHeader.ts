import type { GatewayHealthSnapshot } from '../types/gateway';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import { isGenericMachineLabel, profileDisplayName } from '../services/gatewayProfiles';
import type { LeashConnectionState } from './gatewayEndpoint';
import { formatGatewayEndpointLine, formatGatewayMachineParts } from './gatewayEndpoint';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { relayWorkerDisplayName, selectRelayWorker } from './relayRouting';

function healthHostname(health?: GatewayHealthSnapshot | null): string | undefined {
  return health?.hostname?.replace(/\.local$/i, '').trim() || undefined;
}

/** Prefer profile hostname; fall back to /health when the saved label is generic or missing. */
export function resolveMachineDisplayName(
  activeProfile: GatewayProfile | null | undefined,
  gatewayUrl: string,
  health?: GatewayHealthSnapshot | null,
): string {
  let name = activeProfile
    ? profileDisplayName(activeProfile)
    : formatGatewayMachineParts(gatewayUrl, health).machineName;

  const fromHealth = healthHostname(health);
  if (fromHealth && (isGenericMachineLabel(name) || name === 'computer')) {
    return fromHealth;
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
}): ChatMachineHeaderDisplay {
  let machineLabel = resolveMachineDisplayName(
    input.activeProfile,
    input.gatewayUrl,
    input.health,
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
  if (loopbackUsb && hasNamedMachine) {
    ipLine = 'USB';
  }
  const detailParts: string[] = [];
  const savedMacCount = input.savedMacCount ?? 0;
  const profileIp = input.activeProfile?.localIp?.trim();

  const labelContainsIp =
    Boolean(profileIp && machineLabel.includes(profileIp)) ||
    Boolean(ipLine && ipLine !== 'USB' && machineLabel.includes(ipLine.split(':')[0]));

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
      (loopbackUsb && hasNamedMachine) ||
      detailParts.some((part) => part.startsWith('relay ·')),
  };
}

/** Orange composer banner when direct Mac HTTP is down — always name the machine + route. */
export function formatMacConnectionRetryBanner(input: {
  connectionState: LeashConnectionState;
  connectingStuck?: boolean;
  gatewayUrl: string;
  health?: GatewayHealthSnapshot | null;
  activeProfile?: GatewayProfile | null;
  machineLabel?: string;
  machineEndpoint?: string;
}): string {
  const machineName = resolveMachineDisplayName(
    input.activeProfile,
    input.gatewayUrl,
    input.health,
  );
  const label =
    input.machineLabel &&
    !isGenericMachineLabel(input.machineLabel) &&
    input.machineLabel !== 'Hermes account relay'
      ? input.machineLabel
      : !isGenericMachineLabel(machineName) && machineName !== 'computer'
        ? machineName
        : machineName !== 'Hermes account relay'
          ? machineName
          : 'your Mac';

  if (input.connectionState === 'connecting' && !input.connectingStuck) {
    return label === 'your Mac'
      ? 'Connecting to your Mac… tap to retry'
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
