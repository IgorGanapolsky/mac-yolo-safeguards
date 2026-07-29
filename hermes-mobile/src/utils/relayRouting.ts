import type { ConnectionMode } from '../types/gateway';
import type { RelayWorker } from '../types/mobileRelay';
import type { ConnectionHealSnapshot } from './connectionErrorPolicy';
import { shouldShowPairRelayRouteStatus } from './connectionErrorPolicy';
import { resolveOptionalApprovalsFootnote } from './connectionStatusContract';

/**
 * Sentinel meaning "the Mac link speaks for itself — do not put anything in the
 * headline status slot". ChatScreen already treats this value as "no route status".
 */
export const DIRECT_LINK_ROUTE_STATUS = 'Direct link';

export type RelayRouteDisplay = {
  machineLabel: string;
  endpointLabel?: string;
  routeStatus: string;
  /**
   * Calm, secondary line for optional cloud-approvals pairing. NEVER a headline —
   * see PRODUCT LAW in connectionStatusContract.ts.
   */
  optionalApprovalsNote?: string;
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
    // PRODUCT LAW (connectionStatusContract, 2026-07-22 rage; re-broken 2026-07-25):
    // when the phone can reach the Mac over HTTP, optional cloud-approvals pairing is
    // NOT the connection status. Release the headline slot and demote pairing to a
    // calm footnote. Regression this closes:
    // "<mac name> · Cloud approvals are not paired · Tailscale" on a live Tailscale link.
    if (input.macHttpOk) {
      return {
        machineLabel: input.fallbackMachineLabel,
        endpointLabel: input.fallbackEndpoint,
        routeStatus: DIRECT_LINK_ROUTE_STATUS,
        optionalApprovalsNote: resolveOptionalApprovalsFootnote({
          connectionMode: 'relay',
          isPaired: false,
          macDirectOk: true,
        }),
      };
    }
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
      machineLabel: 'Cloud approvals',
      routeStatus: showPairNudge
        ? 'Pair to receive approval requests anywhere'
        : heal.inFlight
          ? neverConnected
            ? 'Waiting for approval pairing…'
            : 'Reconnecting…'
          : 'Cloud approvals are not paired',
      optionalApprovalsNote: resolveOptionalApprovalsFootnote({
        connectionMode: 'relay',
        isPaired: false,
        macDirectOk: false,
      }),
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
