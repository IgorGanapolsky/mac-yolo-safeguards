import {
  isTailscaleIpv4,
  mergeTailnetProbeHosts,
  normalizeTailnetProbeHost,
} from './tailscaleHosts';

/**
 * Expand stored/pair probe hosts so Find computers can hit Hermes-capable peers
 * even when MagicDNS renamed a node (offline bare name vs live `*-1` sibling)
 * or the phone only retained one of IP / MagicDNS.
 *
 * Hermes Mobile does not embed the Tailscale LocalAPI; discovery is still
 * probe-based. Expansion recovers the common rename + dual-address cases.
 */
export function expandTailnetProbeHosts(hosts: string[]): string[] {
  const base = mergeTailnetProbeHosts(hosts);
  const expanded = new Set<string>(base);

  for (const host of base) {
    const normalized = normalizeTailnetProbeHost(host);
    if (!normalized || isTailscaleIpv4(normalized)) {
      continue;
    }
    if (!normalized.endsWith('.ts.net')) {
      continue;
    }
    const parts = normalized.split('.');
    const device = parts[0]?.trim();
    if (!device) {
      continue;
    }
    const rest = parts.slice(1).join('.');
    if (/-\d+$/.test(device)) {
      const bare = device.replace(/-\d+$/, '');
      if (bare) {
        expanded.add(`${bare}.${rest}`);
      }
    } else {
      expanded.add(`${device}-1.${rest}`);
    }
  }

  return Array.from(expanded);
}
