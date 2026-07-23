/**
 * Remember hostname for Tailscale/LAN IPs after a successful /health.
 * Android "auto-infers" names because USB/pair usually succeeds once and stores
 * hostname on the profile. iPad often only has a bare 100.x IP until health
 * works — this cache keeps the last known name so the picker doesn't regress
 * to "Tailscale 100.x" after a brief outage, and so both platforms behave alike.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatewayProfile } from '../types/gatewayProfile';
import { extractLanIpFromGatewayUrl, gatewayUrlHostname } from './gatewayUrlPolicy';
import { isTailscaleIpv4, magicDnsDeviceName } from './tailscaleHosts';

export type MachineIdentityRecord = {
  hostname: string;
  label: string;
  updatedAt: string;
};

/** Map key = normalized IPv4 or MagicDNS host (lowercase). */
export type MachineIdentityCache = Record<string, MachineIdentityRecord>;

export const MACHINE_IDENTITY_CACHE_KEY = 'hermes-mobile:machine_identity_cache_v1';

/** Process-local mirror so profileDisplayName can read without async. */
let memoryCache: MachineIdentityCache = {};

export function getMachineIdentityCacheMemory(): MachineIdentityCache {
  return memoryCache;
}

export function seedMachineIdentityCacheMemory(cache: MachineIdentityCache): void {
  memoryCache = cache && typeof cache === 'object' ? { ...cache } : {};
}

function cleanHostLabel(hostname: string): string {
  return hostname.replace(/\.local$/i, '').trim();
}

export function identityCacheKeyFromGatewayUrl(gatewayUrl: string): string | null {
  const ip = extractLanIpFromGatewayUrl(gatewayUrl);
  if (ip) {
    return ip;
  }
  const host = gatewayUrlHostname(gatewayUrl)?.toLowerCase();
  return host || null;
}

export function identityCacheKeyFromProfile(profile: GatewayProfile): string | null {
  const fromUrl = identityCacheKeyFromGatewayUrl(profile.gatewayUrl);
  if (fromUrl) {
    return fromUrl;
  }
  const local = profile.localIp?.trim();
  if (local) {
    return local;
  }
  return null;
}

/**
 * Record a successful identity observation (from /health or discovery).
 * Pure: returns next cache map.
 */
export function rememberMachineIdentity(
  cache: MachineIdentityCache,
  input: {
    gatewayUrl?: string | null;
    ip?: string | null;
    hostname?: string | null;
  },
): MachineIdentityCache {
  const hostnameRaw = input.hostname?.trim();
  if (!hostnameRaw) {
    return cache;
  }
  const label = cleanHostLabel(hostnameRaw);
  if (!label || /^\d+\.\d+\.\d+\.\d+$/.test(label)) {
    return cache;
  }
  const keys = new Set<string>();
  if (input.ip?.trim()) {
    keys.add(input.ip.trim());
  }
  if (input.gatewayUrl) {
    const k = identityCacheKeyFromGatewayUrl(input.gatewayUrl);
    if (k) {
      keys.add(k);
    }
  }
  // Also index MagicDNS device key when present on the URL.
  if (input.gatewayUrl) {
    const magic = magicDnsDeviceName(input.gatewayUrl);
    if (magic) {
      keys.add(magic.toLowerCase());
    }
  }
  if (keys.size === 0) {
    return cache;
  }
  const record: MachineIdentityRecord = {
    hostname: hostnameRaw.includes('.local') ? hostnameRaw : `${label}.local`,
    label,
    updatedAt: new Date().toISOString(),
  };
  const next = { ...cache };
  for (const key of keys) {
    next[key] = record;
  }
  return next;
}

/**
 * Resolve a display name for a profile using live fields first, then cache.
 * Does not invent names for unknown IPs.
 */
export function resolveCachedMachineDisplayName(
  profile: GatewayProfile,
  cache: MachineIdentityCache,
): string | null {
  const key = identityCacheKeyFromProfile(profile);
  if (!key) {
    return null;
  }
  const hit = cache[key];
  if (!hit?.label?.trim()) {
    return null;
  }
  // Only upgrade IP-ish / generic titles — never override a real custom label.
  const existing = profile.label?.trim() || '';
  const looksNameless =
    !existing ||
    existing === key ||
    isTailscaleIpv4(existing) ||
    /^Tailscale\s+\d/i.test(existing) ||
    /^Computer\s+\d/i.test(existing) ||
    existing === 'Computer' ||
    existing === 'Tailscale computer';
  if (!looksNameless) {
    return null;
  }
  return hit.label;
}

/** Merge cache into a profile for display/persist (hostname + label when nameless). */
export function applyIdentityCacheToProfile(
  profile: GatewayProfile,
  cache: MachineIdentityCache,
): GatewayProfile {
  const key = identityCacheKeyFromProfile(profile);
  if (!key) {
    return profile;
  }
  const hit = cache[key];
  if (!hit) {
    return profile;
  }
  const cachedName = resolveCachedMachineDisplayName(profile, cache);
  let next = profile;
  if (!profile.hostname?.trim() && hit.hostname) {
    next = { ...next, hostname: hit.hostname };
  }
  if (cachedName && cachedName !== profile.label) {
    next = { ...next, label: cachedName };
  }
  return next;
}

export async function loadMachineIdentityCache(): Promise<MachineIdentityCache> {
  try {
    const raw = await AsyncStorage.getItem(MACHINE_IDENTITY_CACHE_KEY);
    if (!raw) {
      seedMachineIdentityCacheMemory({});
      return {};
    }
    const parsed = JSON.parse(raw) as MachineIdentityCache;
    if (!parsed || typeof parsed !== 'object') {
      seedMachineIdentityCacheMemory({});
      return {};
    }
    seedMachineIdentityCacheMemory(parsed);
    return parsed;
  } catch {
    seedMachineIdentityCacheMemory({});
    return {};
  }
}

/** Observe a successful /health (or discovery) and persist for next cold start. */
export async function observeMachineIdentity(input: {
  gatewayUrl?: string | null;
  ip?: string | null;
  hostname?: string | null;
}): Promise<MachineIdentityCache> {
  const next = rememberMachineIdentity(memoryCache, input);
  if (next === memoryCache) {
    return memoryCache;
  }
  memoryCache = next;
  try {
    await AsyncStorage.setItem(MACHINE_IDENTITY_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — in-memory still helps for the rest of the session.
  }
  return next;
}
