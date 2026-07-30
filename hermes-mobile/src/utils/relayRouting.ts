import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import type { ConnectionHealSnapshot } from './connectionErrorPolicy';
import { shouldShowPairRelayRouteStatus } from './connectionErrorPolicy';

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
    // Fresh install / never connected to a Mac: never say "approval pairing" —
    // that reads as "wait for Mac approval" and is wrong. Cloud approvals are
    // optional Leash lock-screen cards, not the path to chat with your computer
    // (Play Store rage 2026-07-30: "Waiting for approval pairing" after reinstall).
    return {
      machineLabel: neverConnected ? 'Your computer' : 'Cloud approvals',
      routeStatus: neverConnected
        ? heal.inFlight
          ? 'Looking for your Mac…'
          : 'Connect your Mac to chat'
        : showPairNudge
          ? 'Pair to receive approval requests anywhere'
          : heal.inFlight
            ? 'Reconnecting…'
            : 'Cloud approvals are not paired',
    };
  }

  const worker = selectRelayWorker(input.workers, input.activeWorkerId);
  if (worker) {
    const workerName = relayWorkerDisplayName(worker);
    return {
      machineLabel: workerName,
      endpointLabel: 'cloud approvals',
      routeStatus: `Approval requests anywhere${worker.status ? ` · ${worker.status}` : ''}`,
    };
  }

  return {
    machineLabel: 'Cloud approvals',
    endpointLabel: undefined,
    routeStatus:
      input.connectionState === 'connected'
        ? 'Paired for approval requests anywhere'
        : 'Connects when approval requests are available',
  };
}
