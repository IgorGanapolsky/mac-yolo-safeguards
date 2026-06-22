import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeGatewayUrl } from './gatewayClient';
import {
  EMPTY_GATEWAY_PROFILE_STATE,
  type DiscoveredGateway,
  type GatewayProfile,
  type GatewayProfileState,
} from '../types/gatewayProfile';
import {
  buildGatewayUrlFromLanIp,
  extractLanIpFromGatewayUrl,
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
} from '../utils/gatewayUrlPolicy';

const STORAGE_KEY = 'hermes-mobile:gateway_profiles';

function normalizeGatewayUrlBase(url: string): string {
  return normalizeGatewayUrl(url.trim()).httpBase;
}

export function profileIdFromGatewayUrl(gatewayUrl: string): string {
  const ip = extractLanIpFromGatewayUrl(gatewayUrl);
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

/** True when stored label is missing or only an IP — prefer hostname from discovery/health. */
function isIpOnlyProfileLabel(profile: GatewayProfile): boolean {
  const label = profile.label?.trim();
  if (!label) {
    return true;
  }
  if (profile.localIp && label === profile.localIp) {
    return true;
  }
  return isBareIp(label);
}

export function profileDisplayName(profile: GatewayProfile): string {
  const ip = profile.localIp?.trim();
  const hostname = profile.hostname?.replace(/\.local$/i, '').trim();
  const label = profile.label?.trim();

  if (label && !isBareIp(label) && label !== ip) {
    return label;
  }
  if (hostname && hostname !== ip) {
    return hostname;
  }
  if (ip) {
    return `Mac at ${ip}`;
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
  if (ip && name !== ip && !name.includes(ip)) {
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

function profileDedupeKey(profile: GatewayProfile): string {
  const ip = profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
  if (ip) {
    return `ip:${ip}`;
  }
  return `url:${normalizeGatewayUrlBase(profile.gatewayUrl)}`;
}

function mergeProfileRecords(a: GatewayProfile, b: GatewayProfile): GatewayProfile {
  const gatewayUrl = normalizeGatewayUrlBase(a.gatewayUrl || b.gatewayUrl);
  const hostname = a.hostname?.trim() || b.hostname?.trim();
  const localIp =
    a.localIp?.trim() ||
    b.localIp?.trim() ||
    extractLanIpFromGatewayUrl(gatewayUrl) ||
    undefined;
  const labelPick = [a.label, b.label, hostname?.replace(/\.local$/i, '')]
    .map((v) => v?.trim())
    .find((v) => v && !isBareIp(v));
  const label = labelPick || a.label || b.label || localIp || 'Mac';
  const lastConnectedAt =
    [a.lastConnectedAt, b.lastConnectedAt].filter(Boolean).sort().reverse()[0] ?? a.addedAt;
  const addedAt = a.addedAt <= b.addedAt ? a.addedAt : b.addedAt;
  return {
    id: profileIdFromGatewayUrl(gatewayUrl),
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

export function upsertDiscoveredProfile(
  state: GatewayProfileState,
  discovered: DiscoveredGateway,
  makeActive = false,
): GatewayProfileState {
  const gatewayUrl = normalizeGatewayUrlBase(discovered.gatewayUrl);
  const id = profileIdFromGatewayUrl(gatewayUrl);
  const hostname = discovered.hostname?.trim();
  const localIp =
    discovered.localIp?.trim() || extractLanIpFromGatewayUrl(gatewayUrl) || undefined;
  const label =
    discovered.label?.trim() ||
    hostname?.replace(/\.local$/i, '') ||
    localIp ||
    gatewayUrlHostname(gatewayUrl) ||
    'Mac';

  const existing = state.profiles.find((p) => {
    if (p.id === id) {
      return true;
    }
    if (normalizeGatewayUrlBase(p.gatewayUrl) === gatewayUrl) {
      return true;
    }
    const pIp = p.localIp?.trim() || extractLanIpFromGatewayUrl(p.gatewayUrl);
    return localIp && pIp === localIp;
  });
  const now = new Date().toISOString();

  if (existing) {
    const profiles = state.profiles.map((p) => {
      if (p.id !== existing.id) {
        return p;
      }
      return {
        ...p,
        gatewayUrl,
        label: label || p.label,
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
    const localIp = health.localIp?.trim() || p.localIp;
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

export const gatewayProfiles = {
  async load(): Promise<GatewayProfileState> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...EMPTY_GATEWAY_PROFILE_STATE };
      }
      const parsed = JSON.parse(raw) as Partial<GatewayProfileState>;
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
      return dedupeGatewayProfiles({
        profiles,
        activeProfileId: parsed.activeProfileId ?? profiles[0]?.id ?? null,
      });
    } catch (error) {
      console.error('[hermes-mobile] gatewayProfiles.load failed:', error);
      return { ...EMPTY_GATEWAY_PROFILE_STATE };
    }
  },

  async save(state: GatewayProfileState): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('[hermes-mobile] gatewayProfiles.save failed:', error);
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[hermes-mobile] gatewayProfiles.clear failed:', error);
    }
  },
};
