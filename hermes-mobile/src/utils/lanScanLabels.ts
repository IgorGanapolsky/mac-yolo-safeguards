import type { LanScanProgress, LanScanResult } from '../types/lanScan';

export function lanScanFraction(progress: LanScanProgress): number {
  if (progress.stage === 'complete') {
    return 1;
  }
  if (progress.totalHosts <= 0) {
    return 0;
  }
  const phaseFrac = progress.completedHosts / progress.totalHosts;
  if (progress.stage === 'gateway_health') {
    return 0.5 + phaseFrac * 0.5;
  }
  return phaseFrac * 0.5;
}

export function formatLanScanStageLabel(progress: LanScanProgress): string {
  if (progress.stage === 'complete') {
    return formatLanScanResultLabel(progress.foundCount);
  }
  const pct =
    progress.totalHosts > 0
      ? Math.round((progress.completedHosts / progress.totalHosts) * 100)
      : 0;
  const foundHint =
    progress.foundCount > 0 ? ` · ${progress.foundCount} found so far` : '';
  if (progress.stage === 'pair_server') {
    return `Scanning Wi‑Fi for Hermes (${pct}%)${foundHint}`;
  }
  return `Checking computer gateways (${pct}%)${foundHint}`;
}

export function formatLanScanResultLabel(foundCount: number): string {
  if (foundCount === 0) {
    return 'No computers found on Wi‑Fi';
  }
  return `Found ${foundCount} computer${foundCount === 1 ? '' : 's'} on Wi‑Fi`;
}

export function formatLanScanResultDetail(result: LanScanResult): string {
  if (result.foundCount === 0) {
    return 'Hermes must be running on your computer, on the same Wi‑Fi as this phone.';
  }
  return 'Tap a computer below to switch, or search again to refresh the list.';
}
