import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import { resolveHeaderTransportLabel } from './chatMachineHeader';
import {
  formatLanScanResultDetail,
  formatLanScanResultLabel,
  formatLanScanStageLabel,
} from './lanScanLabels';

/** Fixed status band so discovery ticks cannot reflow the profile list. */
export const COMPUTER_PICKER_STATUS_MIN_HEIGHT = 88;

/** Hold scan/probe label flips long enough to stop modal jitter. */
export const COMPUTER_PICKER_STATUS_DEBOUNCE_MS = 400;

export type ComputerPickerStatusKind =
  | 'searching'
  | 'result'
  | 'active'
  | 'tailscale_found'
  | 'help';

export type ComputerPickerStatusSnapshot = {
  kind: ComputerPickerStatusKind;
  title: string;
  detail: string;
  success?: boolean;
  discoveries: DiscoveredGateway[];
};

export type ResolveComputerPickerStatusInput = {
  scanning: boolean;
  scanProgress: LanScanProgress | null;
  scanResult: LanScanResult | null;
  showScanResult: boolean;
  tailscaleProbing: boolean;
  tailscaleVpnActive: boolean;
  tailscaleDiscoveries: DiscoveredGateway[];
  /** Active chat gateway URL — same SSoT as the header transport chip. */
  activeGatewayUrl?: string | null;
  wifiConnected?: boolean;
  /** True when the active Mac answers HTTP (header would say Connected). */
  activeReachable?: boolean;
};

/**
 * Collapse stacked Missing / Tailscale / Found cards into one status mode.
 * Searching wins over result/help so poll ticks cannot stack three banners.
 */
export function resolveComputerPickerStatus(
  input: ResolveComputerPickerStatusInput,
): ComputerPickerStatusSnapshot {
  const discoveries = input.tailscaleDiscoveries;
  const probingOnly =
    input.tailscaleVpnActive &&
    input.tailscaleProbing &&
    discoveries.length === 0 &&
    !input.scanning;

  if (input.scanning) {
    const title = input.scanProgress
      ? formatLanScanStageLabel(input.scanProgress)
      : 'Searching for your computer…';
    return {
      kind: 'searching',
      title,
      detail:
        input.tailscaleVpnActive
          ? 'Looking on Wi‑Fi and Tailscale. Keep Hermes open on your computer.'
          : 'Looking on Wi‑Fi. Tailscale is off on this phone.',
      discoveries: [],
    };
  }

  if (probingOnly) {
    return {
      kind: 'searching',
      title: 'On Tailscale — searching for your computer',
      detail:
        'Looking for Hermes on your tailnet. Works on cellular or any Wi‑Fi when Tailscale is on both devices.',
      discoveries: [],
    };
  }

  if (input.showScanResult && input.scanResult) {
    const activeTransport = input.activeGatewayUrl
      ? resolveHeaderTransportLabel({
          gatewayUrl: input.activeGatewayUrl,
          wifiConnected: input.wifiConnected,
        })
      : undefined;
    const scanTitle = formatLanScanResultLabel(input.scanResult);
    // Discovery can find the Mac over USB while chat still uses Home Wi‑Fi / Tailscale.
    // Never let a USB-only scan banner contradict the header's active-path label.
    if (
      input.activeReachable &&
      activeTransport &&
      activeTransport !== 'USB' &&
      /over USB|Using USB/i.test(scanTitle)
    ) {
      return {
        kind: 'active',
        title: `Connected · ${activeTransport}`,
        detail:
          'USB may also be available for this computer — tap a row to switch routes.',
        success: true,
        discoveries: [],
      };
    }
    return {
      kind: 'result',
      title: scanTitle,
      detail: formatLanScanResultDetail(input.scanResult),
      success: input.scanResult.foundCount > 0,
      discoveries: [],
    };
  }

  if (input.activeReachable && input.activeGatewayUrl) {
    const activeTransport = resolveHeaderTransportLabel({
      gatewayUrl: input.activeGatewayUrl,
      wifiConnected: input.wifiConnected,
    });
    if (activeTransport) {
      return {
        kind: 'active',
        title: `Connected · ${activeTransport}`,
        detail:
          activeTransport === 'USB'
            ? 'Chat uses this USB cable. Tap another computer below to switch.'
            : 'Chat uses this path. A USB cable may also be available for the same computer.',
        success: true,
        discoveries: [],
      };
    }
  }

  if (!input.tailscaleVpnActive && (input.tailscaleProbing || discoveries.length > 0)) {
    return {
      kind: 'help',
      title: 'Tailscale is off on this phone',
      detail:
        'Turn on Tailscale to find computers away from your home Wi‑Fi, or add your computer below.',
      discoveries: [],
    };
  }

  if (discoveries.length > 0) {
    return {
      kind: 'tailscale_found',
      title: 'Computer found on Tailscale',
      detail:
        'Tap below to add your computer — works on cellular or any Wi‑Fi when Tailscale is running on both devices.',
      discoveries,
      success: true,
    };
  }

  return {
    kind: 'help',
    title: 'Missing your other machine?',
    detail:
      'Start Hermes on your other machine, keep Tailscale on for both devices, then tap Find computers. Or add its Tailscale name or 100.x address below.',
    discoveries: [],
  };
}

/** Signature used to debounce rapid discovery label / mode flips. */
export function computerPickerStatusSignature(
  status: ComputerPickerStatusSnapshot,
): string {
  const discoveryKeys = status.discoveries
    .map((d) => d.gatewayUrl)
    .sort()
    .join('|');
  return [
    status.kind,
    status.title,
    status.detail,
    status.success === true ? '1' : status.success === false ? '0' : '',
    discoveryKeys,
  ].join('\u0001');
}

/**
 * Whether the visible status band should accept a new snapshot.
 * First paint always applies; identical signatures are no-ops; entering
 * `searching` commits immediately; other mode/label flips debounce.
 */
export function shouldCommitComputerPickerStatus(params: {
  lastCommitAtMs: number;
  nowMs: number;
  prevSignature: string | null;
  nextSignature: string;
  prevKind?: ComputerPickerStatusKind | null;
  nextKind?: ComputerPickerStatusKind;
  minIntervalMs?: number;
}): boolean {
  const { lastCommitAtMs, nowMs, prevSignature, nextSignature } = params;
  const minIntervalMs =
    params.minIntervalMs ?? COMPUTER_PICKER_STATUS_DEBOUNCE_MS;
  if (prevSignature == null) {
    return true;
  }
  if (prevSignature === nextSignature) {
    return false;
  }
  if (params.nextKind === 'searching' && params.prevKind !== 'searching') {
    return true;
  }
  return nowMs - lastCommitAtMs >= minIntervalMs;
}
