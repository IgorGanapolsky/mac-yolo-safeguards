import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { GatewayProfile } from '../types/gatewayProfile';
import { normalizeGatewayUrl } from './gatewayClient';
import { findProfileForGatewayUrl, profileDisplayName } from './gatewayProfiles';
import { profileMatchesDiscoveredGateway } from '../utils/gatewayProfilePicker';
import {
  buildTailscaleGatewayUrl,
  isTailscaleGatewayHost,
  isTailscaleGatewayUrl,
  isTailscaleIpv4,
  magicDnsDeviceName,
  mergeTailnetProbeHosts,
  normalizeTailnetProbeHost,
} from '../utils/tailscaleHosts';
import { extractLanIpFromGatewayUrl, gatewayUrlHostname, resolveDisplayLanIp } from '../utils/gatewayUrlPolicy';

const PROBE_TIMEOUT_MS = 2500;
const GATEWAY_PORT = 8642;

export type GatewayHealthBody = {
  status?: string;
  hostname?: string;
  local_ip?: string;
  localIp?: string;
};

/** Build a saved-computer profile payload from a /health JSON body. */
export function discoveredGatewayFromHealth(
  gatewayUrl: string,
  body: GatewayHealthBody,
): DiscoveredGateway | null {
  if (body.status !== 'ok') {
    return null;
  }
  const httpBase = normalizeGatewayUrl(gatewayUrl).httpBase;
  const reportedIp =
    typeof body.local_ip === 'string'
      ? body.local_ip
      : typeof body.localIp === 'string'
        ? body.localIp
        : undefined;
  const hostname = typeof body.hostname === 'string' ? body.hostname : undefined;
  const label = hostname?.replace(/\.local$/i, '').trim();
  return {
    gatewayUrl: httpBase,
    hostname,
    localIp: resolveDisplayLanIp(reportedIp, httpBase) ?? undefined,
    label: label || undefined,
  };
}

export async function probeTailscaleGatewayHost(host: string): Promise<DiscoveredGateway | null> {
  const normalized = normalizeTailnetProbeHost(host);
  if (!normalized) {
    return null;
  }
  const gatewayUrl = buildTailscaleGatewayUrl(normalized, GATEWAY_PORT);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${gatewayUrl}/health`, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as GatewayHealthBody;
    return discoveredGatewayFromHealth(gatewayUrl, body);
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

/** Merge tailnet probe hosts from a LAN/USB pair-server sweep into storage. */
export async function mergeTailnetProbeHostsFromScan(
  tailnetProbeHosts: string[],
  storage: {
    merge: (hosts: string[]) => Promise<string[]>;
  },
  currentRef: { current: string[] },
): Promise<string[]> {
  if (tailnetProbeHosts.length === 0) {
    return currentRef.current;
  }
  const merged = await storage.merge(tailnetProbeHosts);
  currentRef.current = merged;
  return merged;
}

export function collectTailnetProbeHosts(
  profiles: GatewayProfile[],
  storedHosts: string[] = [],
  extraHosts: string[] = [],
): string[] {
  const fromProfiles: string[] = [];
  for (const profile of profiles) {
    const host = gatewayUrlHostname(profile.gatewayUrl);
    if (host && isTailscaleGatewayHost(host)) {
      fromProfiles.push(host);
    }
    const ip = profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
    if (ip && isTailscaleIpv4(ip)) {
      fromProfiles.push(ip);
    }
  }
  return mergeTailnetProbeHosts(storedHosts, fromProfiles, extraHosts);
}

export function tailnetHostsFromDiscoveries(discovered: DiscoveredGateway[]): string[] {
  const hosts: string[] = [];
  for (const item of discovered) {
    const host = gatewayUrlHostname(item.gatewayUrl);
    if (host) {
      hosts.push(host);
    }
    const ip = item.localIp?.trim();
    if (ip && isTailscaleIpv4(ip)) {
      hosts.push(ip);
    }
  }
  return mergeTailnetProbeHosts(hosts);
}

/** Probe tailnet hosts and return a Tailscale route for an existing saved Mac profile. */
export async function discoverTailscaleGatewayForProfile(
  profile: GatewayProfile,
  probeHosts: string[],
): Promise<DiscoveredGateway | null> {
  const hosts = mergeTailnetProbeHosts(probeHosts);
  if (hosts.length === 0) {
    return null;
  }
  const discovered = await discoverTailscaleGateways(hosts);
  return discovered.find((item) => profileMatchesDiscoveredGateway(profile, item)) ?? null;
}

export async function discoverTailscaleGateways(
  probeHosts: string[],
): Promise<DiscoveredGateway[]> {
  const hosts = mergeTailnetProbeHosts(probeHosts);
  if (hosts.length === 0) {
    return [];
  }
  const results = await Promise.all(hosts.map((host) => probeTailscaleGatewayHost(host)));
  const map = new Map<string, DiscoveredGateway>();
  for (const item of results) {
    if (!item?.gatewayUrl) {
      continue;
    }
    const key = normalizeGatewayUrl(item.gatewayUrl).httpBase;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    map.set(key, {
      gatewayUrl: key,
      hostname: item.hostname || existing.hostname,
      localIp: item.localIp || existing.localIp,
      label: item.label || existing.label,
    });
  }
  return Array.from(map.values());
}

export function isDiscoveredComputerAlreadySaved(
  profiles: GatewayProfile[],
  discovered: DiscoveredGateway,
): boolean {
  if (findProfileForGatewayUrl(profiles, discovered.gatewayUrl)) {
    return true;
  }
  const hostname = discovered.hostname?.trim().toLowerCase();
  if (hostname) {
    const needle = hostname.replace(/\.local$/i, '');
    const hit = profiles.some((profile) => {
      const haystack = [
        profile.hostname,
        profile.label,
        profileDisplayName(profile),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/\.local/gi, '');
      if (!haystack.includes(needle)) {
        return false;
      }
      // Same machine saved on LAN only — still offer the Tailscale route.
      if (
        isTailscaleGatewayUrl(discovered.gatewayUrl) &&
        !isTailscaleGatewayUrl(profile.gatewayUrl)
      ) {
        return false;
      }
      return true;
    });
    if (hit) {
      return true;
    }
  }
  const ip = discovered.localIp?.trim();
  if (ip && !isTailscaleIpv4(ip)) {
    return profiles.some((profile) => {
      const profileIp =
        profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
      if (profileIp !== ip) {
        return false;
      }
      if (
        isTailscaleGatewayUrl(discovered.gatewayUrl) &&
        !isTailscaleGatewayUrl(profile.gatewayUrl)
      ) {
        return false;
      }
      return true;
    });
  }
  return false;
}

export function filterNewTailscaleDiscoveries(
  profiles: GatewayProfile[],
  discovered: DiscoveredGateway[],
): DiscoveredGateway[] {
  return discovered.filter((item) => !isDiscoveredComputerAlreadySaved(profiles, item));
}

export function tailscaleDiscoveryLabel(discovered: DiscoveredGateway): string {
  const fromHostname = discovered.hostname?.replace(/\.local$/i, '').trim();
  if (fromHostname) {
    return fromHostname;
  }
  if (discovered.label?.trim()) {
    return discovered.label.trim();
  }
  const magicName = magicDnsDeviceName(discovered.gatewayUrl);
  if (magicName) {
    return magicName;
  }
  const host = gatewayUrlHostname(discovered.gatewayUrl);
  return host ?? 'Computer';
}

export function isTailscaleRouteProfile(profile: GatewayProfile): boolean {
  return isTailscaleGatewayUrl(profile.gatewayUrl);
}
