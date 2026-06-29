import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeGatewayUrl } from './gatewayClient';
import {
  EMPTY_GATEWAY_PROFILE_STATE,
  type DiscoveredGateway,
  type GatewayProfile,
  type GatewayProfileState,
} from '../types/gatewayProfile';
import { isPrivateLanGatewayUrl } from '../utils/gatewayEndpoint';
import {
  buildGatewayUrlFromLanIp,
  extractLanIpFromGatewayUrl,
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
  resolveDisplayLanIp,
  isLoopbackHost,
  isValidGatewayUrl,
} from '../utils/gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from '../utils/tailscaleHosts';

const STORAGE_KEY = 'hermes-mobile:gateway_profiles';

function normalizeGatewayUrlBase(url: string): string {
  return normalizeGatewayUrl(url.trim()).httpBase;
}

export function profileIdFromGatewayUrl(gatewayUrl: string, hostname?: string): string {
  const cleanHostname = hostname?.trim().toLowerCase().replace(/[^a-zA-Z0-9]+/g, '_');
  const ip = extractLanIpFromGatewayUrl(gatewayUrl);
  const isLoopback = ip ? isLoopbackHost(ip) : isLoopbackGatewayUrl(gatewayUrl);

  if (isLoopback && cleanHostname && cleanHostname !== 'localhost') {
    return `mac_${cleanHostname}`;
  }
  if (ip) {
    return `mac_${ip.replace(/\./g, '_')}`;
  }
  const host = gatewayUrlHostname(gatewayUrl);
  if (host) {
    return `mac_${host.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
  }
  return `mac_${Date.now()}`;
}

function isBareIp(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed);
}

const GENERIC_PROFILE_LABELS = new Set([
  'mac',
  'computer',
  'your mac',
  'my mac',
  'mac via usb',
  'mac via network',
  'http',
  'https',
]);

export function isGenericMachineLabel(label: string | undefined): boolean {
  const trimmed = label?.trim();
  if (!trimmed) {
    return true;
  }
  return GENERIC_PROFILE_LABELS.has(trimmed.toLowerCase());
}

/** Junk rows from partial QR/deep-link paste — label "http" or URL with no host. */
export function isInvalidGatewayProfile(profile: GatewayProfile): boolean {
  return !isValidGatewayUrl(profile.gatewayUrl);
}

export function sanitizeGatewayProfileState(state: GatewayProfileState): GatewayProfileState {
  const profiles = state.profiles.filter((p) => !isInvalidGatewayProfile(p));
  let activeProfileId = state.activeProfileId;
  if (activeProfileId && !profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id ?? null;
  }
  return dedupeGatewayProfiles({ profiles, activeProfileId });
}

function isGenericProfileLabel(label: string | undefined): boolean {
  return isGenericMachineLabel(label);
}

/** True when stored label is missing or only an IP — prefer hostname from discovery/health. */
function isIpOnlyProfileLabel(profile: GatewayProfile): boolean {
  const label = profile.label?.trim();
  if (!label) {
    return true;
  }
  if (isGenericProfileLabel(label)) {
    return true;
  }
  if (profile.localIp && label === profile.localIp) {
    return true;
  }
  return isBareIp(label);
}

export function profileDisplayName(profile: GatewayProfile): string {
  const ip = resolveDisplayLanIp(profile.localIp, profile.gatewayUrl);
  const hostname = profile.hostname?.replace(/\.local$/i, '').trim();
  const label = profile.label?.trim();

  if (label && !isBareIp(label) && label !== ip && !isGenericProfileLabel(label)) {
    return label;
  }
  if (hostname && hostname !== ip) {
    return hostname;
  }
  if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return 'Mac via USB';
  }
  if (ip) {
    return `Mac ${ip}`;
  }
  if (label) {
    return label;
  }
  if (hostname) {
    return hostname;
  }
  return gatewayUrlHostname(profile.gatewayUrl) ?? profile.gatewayUrl;
}

export function formatProfileLabel(profile: GatewayProfile): string {
  const name = profileDisplayName(profile);
  const ip = profile.localIp?.trim();
  if (ip && ip !== '127.0.0.1' && ip !== 'localhost' && name !== ip && !name.includes(ip)) {
    return `${name} (${ip})`;
  }
  return name;
}

export function findProfileForGatewayUrl(
  profiles: GatewayProfile[],
  gatewayUrl: string,
): GatewayProfile | undefined {
  const base = normalizeGatewayUrlBase(gatewayUrl);
  const matchedBase = profiles.find((p) => normalizeGatewayUrlBase(p.gatewayUrl) === base);
  if (matchedBase) {
    return matchedBase;
  }

  const ipOrHost = extractLanIpFromGatewayUrl(gatewayUrl) || gatewayUrlHostname(gatewayUrl);
  if (!ipOrHost) {
    return undefined;
  }

  return profiles.find((p) => {
    const pIp = p.localIp || extractLanIpFromGatewayUrl(p.gatewayUrl);
    const pHost = p.hostname || gatewayUrlHostname(p.gatewayUrl);
    return (
      (pIp && pIp === ipOrHost) ||
      (pHost && pHost.toLowerCase() === ipOrHost.toLowerCase())
    );
  });
}

function normalizeMachineKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase().replace(/\.local$/i, '');
  return trimmed && trimmed !== 'localhost' ? trimmed : undefined;
}

function profileMachineKey(profile: GatewayProfile): string | undefined {
  return (
    normalizeMachineKey(profile.hostname) ||
    (profile.label && !isGenericMachineLabel(profile.label)
      ? normalizeMachineKey(profile.label)
      : undefined)
  );
}

function profileDedupeKey(profile: GatewayProfile): string {
  const ip = profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
  if (ip && !isLoopbackHost(ip)) {
    return `ip:${ip}`;
  }
  const machineKey = profileMachineKey(profile);
  if (machineKey) {
    return `host:${machineKey}`;
  }
  return `url:${normalizeGatewayUrlBase(profile.gatewayUrl)}`;
}

function preferredGatewayUrl(a: string, b: string): string {
  const aLoop = isLoopbackGatewayUrl(a);
  const bLoop = isLoopbackGatewayUrl(b);
  if (aLoop && !bLoop) {
    return normalizeGatewayUrlBase(b);
  }
  if (!aLoop && bLoop) {
    return normalizeGatewayUrlBase(a);
  }
  const aTail = isTailscaleGatewayUrl(a);
  const bTail = isTailscaleGatewayUrl(b);
  if (aTail && !bTail) {
    return normalizeGatewayUrlBase(a);
  }
  if (!aTail && bTail) {
    return normalizeGatewayUrlBase(b);
  }
  const aLan = isPrivateLanGatewayUrl(a);
  const bLan = isPrivateLanGatewayUrl(b);
  if (!aLan && bLan) {
    return normalizeGatewayUrlBase(a);
  }
  if (aLan && !bLan) {
    return normalizeGatewayUrlBase(b);
  }
  return normalizeGatewayUrlBase(a || b);
}

function mergeProfileRecords(a: GatewayProfile, b: GatewayProfile): GatewayProfile {
  const gatewayUrl = preferredGatewayUrl(a.gatewayUrl, b.gatewayUrl);
  const hostname = a.hostname?.trim() || b.hostname?.trim();
  const localIp =
    a.localIp?.trim() ||
    b.localIp?.trim() ||
    extractLanIpFromGatewayUrl(gatewayUrl) ||
    undefined;
  const labelPick = [a.label, b.label, hostname?.replace(/\.local$/i, '')]
    .map((v) => v?.trim())
    .find((v) => v && !isBareIp(v));
  const label = labelPick || a.label || b.label || localIp || 'computer';
  const lastConnectedAt =
    [a.lastConnectedAt, b.lastConnectedAt].filter(Boolean).sort().reverse()[0] ?? a.addedAt;
  const addedAt = a.addedAt <= b.addedAt ? a.addedAt : b.addedAt;
  return {
    id: profileIdFromGatewayUrl(gatewayUrl, hostname),
    label,
    gatewayUrl,
    hostname,
    localIp,
    addedAt,
    lastConnectedAt,
  };
}

/** Collapse duplicate saved Macs (same LAN IP / URL) from repeated pairing or rescans. */
export function dedupeGatewayProfiles(state: GatewayProfileState): GatewayProfileState {
  const merged = new Map<string, GatewayProfile>();
  for (const profile of state.profiles) {
    const key = profileDedupeKey(profile);
    const hit = merged.get(key);
    merged.set(key, hit ? mergeProfileRecords(hit, profile) : mergeProfileRecords(profile, profile));
  }
  const profiles = Array.from(merged.values());
  let activeProfileId = state.activeProfileId;
  if (activeProfileId && !profiles.some((p) => p.id === activeProfileId)) {
    const prev = state.profiles.find((p) => p.id === activeProfileId);
    const prevIp = prev?.localIp || extractLanIpFromGatewayUrl(prev?.gatewayUrl ?? '');
    activeProfileId =
      profiles.find(
        (p) =>
          p.id === activeProfileId ||
          (prevIp && (p.localIp === prevIp || extractLanIpFromGatewayUrl(p.gatewayUrl) === prevIp)),
      )?.id ??
      profiles[0]?.id ??
      null;
  }
  return { profiles, activeProfileId };
}

export function activeProfile(state: GatewayProfileState): GatewayProfile | null {
  if (!state.activeProfileId) {
    return null;
  }
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
}

/** Persist every healthy Tailscale /health discovery as a saved computer profile. */
export function applyTailscaleDiscoveriesToProfileState(
  state: GatewayProfileState,
  discovered: DiscoveredGateway[],
): GatewayProfileState {
  let next = state;
  for (const item of discovered) {
    next = upsertDiscoveredProfile(next, item, false);
  }
  return next;
}

export function upsertDiscoveredProfile(
  state: GatewayProfileState,
  discovered: DiscoveredGateway,
  makeActive = false,
): GatewayProfileState {
  const gatewayUrl = normalizeGatewayUrlBase(discovered.gatewayUrl);
  const hostname = discovered.hostname?.trim();
  const id = profileIdFromGatewayUrl(gatewayUrl, hostname);
  const localIp =
    discovered.localIp?.trim() || extractLanIpFromGatewayUrl(gatewayUrl) || undefined;
  const label =
    discovered.label?.trim() ||
    hostname?.replace(/\.local$/i, '') ||
    gatewayUrlHostname(gatewayUrl) ||
    'Mac';

  const discoveredMachineKey =
    normalizeMachineKey(hostname) || normalizeMachineKey(label) || undefined;

  const existing = state.profiles.find((p) => {
    if (p.id === id) {
      return true;
    }
    if (normalizeGatewayUrlBase(p.gatewayUrl) === gatewayUrl) {
      const isLoopback = isLoopbackGatewayUrl(gatewayUrl);
      if (isLoopback) {
        if (hostname && p.hostname) {
          return hostname.toLowerCase() === p.hostname.toLowerCase();
        }
        return true;
      }
      return true;
    }
    const pIp = p.localIp?.trim() || extractLanIpFromGatewayUrl(p.gatewayUrl);
    if (localIp && pIp === localIp && !isLoopbackHost(localIp) && !isLoopbackHost(pIp)) {
      return true;
    }
    if (hostname && p.hostname && hostname.toLowerCase() === p.hostname.toLowerCase() && hostname.toLowerCase() !== 'localhost') {
      return true;
    }
    if (
      !isLoopbackGatewayUrl(gatewayUrl) &&
      isLoopbackGatewayUrl(p.gatewayUrl) &&
      discoveredMachineKey &&
      profileMachineKey(p) === discoveredMachineKey
    ) {
      return true;
    }
    return false;
  });
  const now = new Date().toISOString();

  if (existing) {
    const profiles = state.profiles.map((p) => {
      if (p.id !== existing.id) {
        return p;
      }
      const keepExistingLabel =
        p.label &&
        !isBareIp(p.label) &&
        p.label !== 'computer' &&
        (!discovered.label?.trim() || isBareIp(label) || label === 'computer');
      const finalLabel = keepExistingLabel ? p.label : (label || p.label);

      return {
        ...p,
        gatewayUrl,
        label: finalLabel,
        hostname: hostname || p.hostname,
        localIp: localIp || p.localIp,
        lastConnectedAt: now,
      };
    });
    return dedupeGatewayProfiles({
      profiles,
      activeProfileId: makeActive ? existing.id : state.activeProfileId ?? existing.id,
    });
  }

  const profile: GatewayProfile = {
    id,
    label,
    gatewayUrl,
    hostname,
    localIp,
    addedAt: now,
    lastConnectedAt: now,
  };

  return dedupeGatewayProfiles({
    profiles: [profile, ...state.profiles],
    activeProfileId: makeActive ? id : state.activeProfileId ?? id,
  });
}

export function selectProfile(state: GatewayProfileState, profileId: string): GatewayProfileState {
  const exists = state.profiles.some((p) => p.id === profileId);
  if (!exists) {
    return state;
  }
  return dedupeGatewayProfiles({ ...state, activeProfileId: profileId });
}

export function removeProfile(state: GatewayProfileState, profileId: string): GatewayProfileState {
  const profiles = state.profiles.filter((p) => p.id !== profileId);
  let activeProfileId = state.activeProfileId;
  if (activeProfileId === profileId) {
    activeProfileId = profiles[0]?.id ?? null;
  }
  return dedupeGatewayProfiles({ profiles, activeProfileId });
}

export function touchProfileHealth(
  state: GatewayProfileState,
  profileId: string,
  health: { hostname?: string; localIp?: string },
): GatewayProfileState {
  const profiles = state.profiles.map((p) => {
    if (p.id !== profileId) {
      return p;
    }
    const hostname = health.hostname?.trim() || p.hostname;
    const localIp =
      resolveDisplayLanIp(health.localIp, p.gatewayUrl) ||
      resolveDisplayLanIp(p.localIp, p.gatewayUrl);
    const hostnameLabel = hostname?.replace(/\.local$/i, '').trim();
    const label =
      hostnameLabel && isIpOnlyProfileLabel(p)
        ? hostnameLabel
        : p.label;
    return {
      ...p,
      hostname,
      localIp,
      label,
      lastConnectedAt: new Date().toISOString(),
    };
  });
  return dedupeGatewayProfiles({ ...state, profiles });
}

export function migrateLegacyGateway(
  state: GatewayProfileState,
  gatewayUrl: string,
  lastLanIp?: string | null,
): GatewayProfileState {
  if (state.profiles.length > 0) {
    return state;
  }

  let url = gatewayUrl;
  if (isLoopbackGatewayUrl(url) && lastLanIp?.trim()) {
    url = buildGatewayUrlFromLanIp(lastLanIp);
  }
  if (isLoopbackGatewayUrl(url)) {
    return state;
  }

  return upsertDiscoveredProfile(
    state,
    { gatewayUrl: url, localIp: lastLanIp?.trim() || undefined },
    true,
  );
}

let cachedProfileState: GatewayProfileState | null = null;

export function getCachedProfileStateSync(): GatewayProfileState | null {
  return cachedProfileState;
}

export const gatewayProfiles = {
  async load(): Promise<GatewayProfileState> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const state = { ...EMPTY_GATEWAY_PROFILE_STATE };
        cachedProfileState = state;
        return state;
      }
      const parsed = JSON.parse(raw) as Partial<GatewayProfileState>;
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
      const state = sanitizeGatewayProfileState({
        profiles,
        activeProfileId: parsed.activeProfileId ?? profiles[0]?.id ?? null,
      });
      cachedProfileState = state;
      return state;
    } catch (error) {
      console.error('[hermes-mobile] gatewayProfiles.load failed:', error);
      const state = { ...EMPTY_GATEWAY_PROFILE_STATE };
      cachedProfileState = state;
      return state;
    }
  },

  async save(state: GatewayProfileState): Promise<void> {
    try {
      cachedProfileState = state;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('[hermes-mobile] gatewayProfiles.save failed:', error);
    }
  },

  async clear(): Promise<void> {
    try {
      cachedProfileState = null;
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[hermes-mobile] gatewayProfiles.clear failed:', error);
    }
  },
};
