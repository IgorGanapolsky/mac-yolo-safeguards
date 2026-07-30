import type { LanScanProgress, LanScanReachCounts, LanScanResult } from '../types/lanScan';

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

function asReachCounts(input: number | LanScanReachCounts): LanScanReachCounts {
  if (typeof input === 'number') {
    return { foundCount: input };
  }
  return input;
}

function nounComputer(n: number): string {
  return n === 1 ? 'computer' : 'computers';
}

/**
 * Progress copy must never imply URL aliases are computers
 * (e.g. "6 found so far" while the picker shows 2 Macs).
 */
export function formatLanScanStageLabel(progress: LanScanProgress): string {
  if (progress.stage === 'complete') {
    return formatLanScanResultLabel(progress);
  }
  const pct =
    progress.totalHosts > 0
      ? Math.round((progress.completedHosts / progress.totalHosts) * 100)
      : 0;
  const computersHint = formatComputersSoFar(progress.foundCount);
  const links = progress.linkCount ?? 0;
  if (progress.stage === 'pair_server') {
    if (links > progress.foundCount && progress.foundCount > 0) {
      return `Searching for Hermes computers (${pct}%) · checking ${links} links across ${progress.foundCount} ${nounComputer(progress.foundCount)}`;
    }
    return `Searching for Hermes computers (${pct}%)${computersHint}`;
  }
  if (links > progress.foundCount && progress.foundCount > 0) {
    return `Checking direct Hermes links (${pct}%) · ${links} links across ${progress.foundCount} ${nounComputer(progress.foundCount)}`;
  }
  return `Checking direct Hermes links (${pct}%)${computersHint}`;
}

/**
 * True when every unique computer this scan found was reached over the loopback
 * cable path and nothing else.
 *
 * Structural replacement for the old `/over USB|Using USB/` regex on the banner
 * title. The title no longer names the cable (2026-07-30 Tailscale-only copy
 * rule), so callers that need to know "this was a cable-only discovery" must ask
 * the counts, not the user-facing string.
 */
export function isLoopbackOnlyScanReach(input: number | LanScanReachCounts): boolean {
  const counts = asReachCounts(input);
  return (
    (counts.usbCount ?? 0) > 0 &&
    (counts.lanCount ?? 0) === 0 &&
    (counts.tailscaleCount ?? 0) === 0
  );
}

/**
 * Result banner copy rules:
 * - "local" only when every unique computer's winning URL is true LAN/mDNS (RFC1918 / .local), never Tailscale 100.64/10.
 * - Tailscale-only → "Found N on Tailscale"
 * - Loopback-only → neutral count (the cable is never named to the user)
 * - Mixed or unknown reach → neutral "Found N Hermes computers" (never "local")
 */
export function formatLanScanResultLabel(input: number | LanScanReachCounts): string {
  const counts = asReachCounts(input);
  const { foundCount } = counts;
  if (foundCount === 0) {
    return 'None found yet';
  }

  const lan = counts.lanCount ?? 0;
  const tailscale = counts.tailscaleCount ?? 0;
  const usb = counts.usbCount ?? 0;
  const classified = lan + tailscale + usb;

  if (classified === 0) {
    return `Found ${foundCount} Hermes ${nounComputer(foundCount)}`;
  }

  if (tailscale > 0 && lan === 0 && usb === 0) {
    return `Found ${foundCount} on Tailscale`;
  }
  if (usb > 0 && lan === 0 && tailscale === 0) {
    // Tailscale-only copy: report the count, never the cable.
    return `Found ${foundCount} Hermes ${nounComputer(foundCount)}`;
  }
  if (lan > 0 && tailscale === 0 && usb === 0) {
    return `Found ${foundCount} local Hermes ${nounComputer(foundCount)}`;
  }

  return `Found ${foundCount} Hermes ${nounComputer(foundCount)}`;
}

export function formatLanScanResultDetail(result: LanScanResult): string {
  if (result.foundCount === 0) {
    return 'Paste your Mac’s Tailscale IP below. Hermes must be open on that Mac.';
  }

  const lan = result.lanCount ?? 0;
  const tailscale = result.tailscaleCount ?? 0;
  const usb = result.usbCount ?? 0;

  if (tailscale > 0 && lan === 0 && usb === 0) {
    return 'Tap a computer below to target it, or search again to refresh the Tailscale list.';
  }
  if (usb > 0 && lan === 0 && tailscale === 0) {
    return 'Tap a computer below to target it. Finding a Mac here does not change your current connection.';
  }
  if (lan > 0 && tailscale === 0 && usb === 0) {
    return 'Tap a computer below to target it, or search again to refresh the local list.';
  }
  return 'Tap a computer below to target it, or search again to refresh the list.';
}
