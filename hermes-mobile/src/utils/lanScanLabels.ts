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
  // foundCount is distinct Hermes HTTP endpoints (loopback/LAN/Tailscale), NOT picker rows.
  // USB+LAN+TS for one Mac collapse to one computer — do not say "machines" here.
  const foundHint =
    progress.foundCount > 0
      ? ` · ${progress.foundCount} Hermes link${progress.foundCount === 1 ? '' : 's'} responding`
      : '';
  if (progress.stage === 'pair_server') {
    return `Scanning local network for Hermes (${pct}%)${foundHint}`;
  }
  return `Checking direct Hermes links (${pct}%)${foundHint}`;
}

export function formatLanScanResultLabel(foundCount: number): string {
  if (foundCount === 0) {
    return 'No Hermes computers found nearby';
  }
  // list.length after discovery; still may collapse further in the picker to one row per Mac.
  return `Found ${foundCount} Hermes link${foundCount === 1 ? '' : 's'} (one row per computer below)`;
}

export function formatLanScanResultDetail(result: LanScanResult): string {
  if (result.foundCount === 0) {
    return 'Use Hermes Relay for anywhere approvals, or start Hermes nearby and scan again for direct control.';
  }
  return 'Each computer is listed once. USB and Tailscale to the same Mac are not shown as two rows.';
}
