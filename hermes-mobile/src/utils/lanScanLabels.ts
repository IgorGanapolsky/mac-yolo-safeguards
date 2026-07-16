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

function formatComputersSoFar(foundCount: number): string {
  if (foundCount <= 0) {
    return '';
  }
  const noun = foundCount === 1 ? 'computer' : 'computers';
  return ` · ${foundCount} ${noun} so far`;
}

/**
 * Progress copy must never imply URL aliases are computers
 * (e.g. "6 found so far" while the picker shows 2 Macs).
 */
export function formatLanScanStageLabel(progress: LanScanProgress): string {
  if (progress.stage === 'complete') {
    return formatLanScanResultLabel(progress.foundCount);
  }
  const pct =
    progress.totalHosts > 0
      ? Math.round((progress.completedHosts / progress.totalHosts) * 100)
      : 0;
  const computersHint = formatComputersSoFar(progress.foundCount);
  const links = progress.linkCount ?? 0;
  if (progress.stage === 'pair_server') {
    if (links > progress.foundCount && progress.foundCount > 0) {
      return `Scanning local network for Hermes (${pct}%) · checking ${links} links across ${progress.foundCount} computer${progress.foundCount === 1 ? '' : 's'}`;
    }
    return `Scanning local network for Hermes (${pct}%)${computersHint}`;
  }
  if (links > progress.foundCount && progress.foundCount > 0) {
    return `Checking direct Hermes links (${pct}%) · ${links} links across ${progress.foundCount} computer${progress.foundCount === 1 ? '' : 's'}`;
  }
  return `Checking direct Hermes links (${pct}%)${computersHint}`;
}

export function formatLanScanResultLabel(foundCount: number): string {
  if (foundCount === 0) {
    return 'No local Hermes machines found';
  }
  return `Found ${foundCount} local Hermes machine${foundCount === 1 ? '' : 's'}`;
}

export function formatLanScanResultDetail(result: LanScanResult): string {
  if (result.foundCount === 0) {
    return 'Use Hermes Relay for anywhere approvals, or start Hermes nearby and scan again for direct control.';
  }
  return 'Tap a machine below to target it, or search again to refresh the local list.';
}
