import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import type { ConnectionHealSnapshot } from './connectionErrorPolicy';
import { shouldShowPairRelayRouteStatus } from './connectionErrorPolicy';
import {
  HERMES_RELAY_ROUTE_LABEL,
  PAIR_RELAY_ROUTE_STATUS,
  VIA_HERMES_RELAY_ENDPOINT,
} from './userFacingRouteCopy';

export type RelayRouteDisplay = {
  machineLabel: string;
  endpointLabel?: string;
  routeStatus: string;
};

function clean(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function relayWorkerDisplayName(worker?: RelayWorker | null): string {
  const label = clean(worker?.label);
  if (label) return label;

  const host = clean(worker?.hostname)?.replace(/\.local$/i, '');
  const project = clean(worker?.project);
  if (host && project) return `${host} · ${project}`;
  if (host) return host;
  if (project) return project;

  const repo = clean(worker?.repo)?.split('/').filter(Boolean).pop();
  if (repo) return repo.replace(/\.git$/i, '');

  return 'active worker';
}

export function selectRelayWorker(
  workers: RelayWorker[],
  activeWorkerId?: string | null,
): RelayWorker | null {
  if (activeWorkerId) {
    const exact = workers.find(
      (worker) => worker.id === activeWorkerId || worker.machine_id === activeWorkerId,
    );
    if (exact) return exact;
  }
  return (
    workers.find((worker) => /online|active|busy|running/i.test(worker.status ?? '')) ??
    workers[0] ??
    null
  );
}

export function resolveRelayRouteDisplay(input: {
  connectionMode: ConnectionMode;
  isPaired: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo';
  workers: RelayWorker[];
  activeWorkerId?: string | null;
  fallbackMachineLabel: string;
  fallbackEndpoint?: string;
  heal?: ConnectionHealSnapshot;
  hasAlternateRoutes?: boolean;
  wifiConnected?: boolean;
  gatewayUrl?: string;
  macHttpOk?: boolean;
}): RelayRouteDisplay {
  if (input.connectionMode === 'gateway') {
    return {
      machineLabel: input.fallbackMachineLabel,
      endpointLabel: input.fallbackEndpoint,
      routeStatus: input.connectionState === 'connected' ? 'Direct local link' : 'Local fallback',
    };
  }

  if (!input.isPaired) {
    const heal = input.heal ?? { attempt: 0, inFlight: false, exhausted: true };
    const showPairNudge = shouldShowPairRelayRouteStatus({
      isPaired: false,
      wifiConnected: input.wifiConnected ?? true,
      gatewayUrl: input.gatewayUrl ?? '',
      hasAlternateRoutes: input.hasAlternateRoutes ?? false,
      heal,
      macHttpOk: input.macHttpOk ?? false,
    });
    const gatewayUrl = input.gatewayUrl?.trim() ?? '';
    const neverConnected =
      !gatewayUrl ||
      gatewayUrl === 'http://127.0.0.1:8642' ||
      gatewayUrl === 'http://localhost:8642';
    return {
      machineLabel: HERMES_RELAY_ROUTE_LABEL,
      routeStatus: showPairNudge
        ? PAIR_RELAY_ROUTE_STATUS
        : heal.inFlight
          ? neverConnected
            ? 'Looking for your computer…'
            : 'Reconnecting…'
          : 'Direct link',
    };
  }

  const worker = selectRelayWorker(input.workers, input.activeWorkerId);
  if (worker) {
    const workerName = relayWorkerDisplayName(worker);
    return {
      machineLabel: workerName,
      endpointLabel: VIA_HERMES_RELAY_ENDPOINT,
      routeStatus: `Cloud approvals via Hermes Relay${worker.status ? ` · ${worker.status}` : ''}`,
    };
  }

  return {
    machineLabel: HERMES_RELAY_ROUTE_LABEL,
    endpointLabel: VIA_HERMES_RELAY_ENDPOINT,
    routeStatus:
      input.connectionState === 'connected'
        ? 'Cloud approvals ready — Chat still needs a computer link'
        : 'Connects when a Hermes Relay worker checks in',
  };
}
