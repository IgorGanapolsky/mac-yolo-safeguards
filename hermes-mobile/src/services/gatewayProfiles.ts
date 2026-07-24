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
import { isTailnetRouteLabel, isTailscaleGatewayUrl, isTailscaleIpv4, magicDnsDeviceName } from '../utils/tailscaleHosts';
import { filterPhoneTailscaleSelfPeers } from '../utils/tailscaleSelfPeer';

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
  'your computer',
  'my mac',
  'mac via usb',
  'computer via usb',
  'mac via tailscale',
  'computer via tailscale',
  'mac via network',
  'custom mac',
  'custom computer',
  'tailscale computer',
  'localhost',
  '127.0.0.1',
  'http',
  'https',
]);

export const GENERIC_USB_PROFILE_LABEL = 'Computer via USB';
export const GENERIC_TAILSCALE_PROFILE_LABEL = 'Computer via Tailscale';

export const LEGACY_USB_PROFILE_LABEL = 'Mac via USB';

const GENERIC_COMPUTER_IP_LABEL = /^computer \d{1,3}(\.\d{1,3}){3}$/i;
const GENERIC_TAILSCALE_IP_LABEL = /^tailscale \d{1,3}(\.\d{1,3}){3}$/i;

export function isGenericMachineLabel(label: string | undefined): boolean {
  const trimmed = label?.trim();
  if (!trimmed) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (GENERIC_PROFILE_LABELS.has(lower)) {
    return true;
  }
  return GENERIC_COMPUTER_IP_LABEL.test(trimmed) || GENERIC_TAILSCALE_IP_LABEL.test(trimmed);
}

/** Junk rows from partial QR/deep-link paste — label "http" or URL with no host. */
export function isInvalidGatewayProfile(profile: GatewayProfile): boolean {
  return !isValidGatewayUrl(profile.gatewayUrl);
}

const GENERIC_USB_LOOPBACK_ID = 'mac_usb_loopback';

function isGenericUsbLoopbackProfile(profile: GatewayProfile): boolean {
  return (
    profile.id === GENERIC_USB_LOOPBACK_ID ||
    (isLoopbackGatewayUrl(profile.gatewayUrl) &&
      isGenericProfileLabel(profile.label) &&
      !profile.hostname?.trim())
  );
}

function namedMachineFromProfiles(
  profiles: GatewayProfile[],
): { hostname: string; label: string } | undefined {
  const candidates: { hostname: string; label: string; machineKey: string }[] = [];
  const seenKeys = new Set<string>();
  for (const profile of profiles) {
    if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
      continue;
    }
    const label = profileDisplayName(profile);
    if (isGenericMachineLabel(label)) {
      continue;
    }
    const host = bonjourHostname(profile.hostname) ?? label;
    const machineKey = normalizeMachineKey(profile.hostname) || normalizeMachineKey(host) || host.toLowerCase();
    if (seenKeys.has(machineKey)) {
      continue;
    }
    seenKeys.add(machineKey);
    candidates.push({
      hostname: profile.hostname?.trim() || `${host}.local`,
      label: host,
      machineKey,
    });
  }
  // Multi-Mac: if more than 1 distinct machine, do NOT hydrate generic USB with first one's name
  // — would mislabel USB-to-Pro as Mini. Keep generic so header borrows live health hostname instead.
  if (candidates.length !== 1) {
    return undefined;
  }
  return candidates[0];
}

/** Copy human Mac name onto generic adb-reverse loopback rows from saved tailnet/LAN siblings. */
function hydrateLoopbackProfileNames(profiles: GatewayProfile[]): GatewayProfile[] {
  const namedSource = namedMachineFromProfiles(profiles);
  let next = profiles.map((profile) => {
    if (!isLoopbackGatewayUrl(profile.gatewayUrl) || !isGenericUsbLoopbackProfile(profile)) {
      return profile;
    }
    if (!namedSource) {
      return profile;
    }
    const label = resolveStoredProfileLabel({
      gatewayUrl: profile.gatewayUrl,
      hostname: namedSource.hostname,
      label: namedSource.label,
      localIp: profile.localIp ?? '127.0.0.1',
    });
    return {
      ...profile,
      id: profileIdFromGatewayUrl(profile.gatewayUrl, namedSource.label),
      hostname: namedSource.hostname,
      label,
      localIp: '127.0.0.1',
    };
  });

  const hasNamedLoopback = next.some(
    (profile) => isLoopbackGatewayUrl(profile.gatewayUrl) && !isGenericUsbLoopbackProfile(profile),
  );
  if (hasNamedLoopback) {
    next = next.filter((profile) => profile.id !== GENERIC_USB_LOOPBACK_ID);
  }
  return next;
}

export function sanitizeGatewayProfileState(state: GatewayProfileState): GatewayProfileState {
  const relabeled = state.profiles
    .filter((p) => !isInvalidGatewayProfile(p))
    .map(relabelStoredProfile);
  const profiles = hydrateLoopbackProfileNames(relabeled);
  let activeProfileId = state.activeProfileId;
  if (activeProfileId && !profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id ?? null;
  }
  if (activeProfileId === GENERIC_USB_LOOPBACK_ID && hasNamedLoopbackProfile(profiles)) {
    const namedLoopback = profiles.find(
      (profile) =>
        isLoopbackGatewayUrl(profile.gatewayUrl) && !isGenericUsbLoopbackProfile(profile),
    );
    activeProfileId = namedLoopback?.id ?? activeProfileId;
  }
  return dedupeGatewayProfiles({ profiles, activeProfileId });
}

function hasNamedLoopbackProfile(profiles: GatewayProfile[]): boolean {
  return profiles.some(
    (profile) =>
      isLoopbackGatewayUrl(profile.gatewayUrl) && !isGenericUsbLoopbackProfile(profile),
  );
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

function bonjourHostname(hostname: string | undefined): string | undefined {
  const host = hostname?.replace(/\.local$/i, '').trim();
  if (!host || isTailnetRouteLabel(host)) {
    return undefined;
  }
  return host;
}

function pickFriendlyProfileLabel(...candidates: (string | undefined)[]): string | undefined {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed && !isBareIp(trimmed) && !isGenericProfileLabel(trimmed) && !isTailnetRouteLabel(trimmed)) {
      return trimmed;
    }
  }
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed && !isBareIp(trimmed) && !isGenericProfileLabel(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

/** Stored profile label: hostname from /health, pairing extraName, or MagicDNS — never bare "Computer" when identity is known. */
function resolveStoredProfileLabel(input: {
  gatewayUrl: string;
  hostname?: string;
  label?: string;
  localIp?: string;
}): string {
  const gatewayUrl = normalizeGatewayUrlBase(input.gatewayUrl);
  const hostname = input.hostname?.trim();
  const urlHost = gatewayUrlHostname(gatewayUrl);

  const friendly = pickFriendlyProfileLabel(
    input.label,
    bonjourHostname(hostname),
    magicDnsDeviceName(hostname),
    magicDnsDeviceName(gatewayUrl),
    urlHost && !isTailnetRouteLabel(urlHost) ? urlHost : undefined,
    urlHost ? magicDnsDeviceName(urlHost) : undefined,
  );
  if (friendly) {
    return friendly;
  }

  if (isLoopbackGatewayUrl(gatewayUrl)) {
    return bonjourHostname(hostname) ?? GENERIC_USB_PROFILE_LABEL;
  }
  if (isTailscaleGatewayUrl(gatewayUrl)) {
    return magicDnsDeviceName(gatewayUrl) ?? GENERIC_TAILSCALE_PROFILE_LABEL;
  }
  const ip = input.localIp?.trim() || extractLanIpFromGatewayUrl(gatewayUrl);
  if (ip) {
    return isTailscaleIpv4(ip) ? `Tailscale ${ip}` : `Computer ${ip}`;
  }
  return input.label?.trim() || 'Computer';
}

function relabelStoredProfile(profile: GatewayProfile): GatewayProfile {
  if (!isIpOnlyProfileLabel(profile)) {
    return profile;
  }
  const label = resolveStoredProfileLabel({
    gatewayUrl: profile.gatewayUrl,
    hostname: profile.hostname,
    label: profile.label,
    localIp: profile.localIp,
  });
  return label === profile.label ? profile : { ...profile, label };
}

/**
 * Strip transport tokens from a computer name ("Mac mini USB" → "Mac mini").
 * Transport belongs in the route badge, never in the machine title — especially for
 * remote Tailscale Macs (mini in another city must never read as "… USB").
 */
export function stripTransportSuffixFromComputerName(name: string): string {
  let next = name.trim();
  if (!next) {
    return next;
  }
  // Repeat so "Foo via USB · USB" / "Foo USB USB" collapse cleanly.
  for (let i = 0; i < 3; i += 1) {
    const stripped = next
      .replace(/\s*[·•]\s*USB\s*$/i, '')
      .replace(/\s*\(\s*USB\s*\)\s*$/i, '')
      .replace(/\s+via\s+USB\s*$/i, '')
      .replace(/\s+USB\s*$/i, '')
      .trim();
    if (stripped === next) {
      break;
    }
    next = stripped;
  }
  return next || name.trim();
}

export function profileDisplayName(profile: GatewayProfile): string {
  const ip = resolveDisplayLanIp(profile.localIp, profile.gatewayUrl);
  const hostname = bonjourHostname(profile.hostname);
  const rawLabel = profile.label?.trim();
  const label = rawLabel ? stripTransportSuffixFromComputerName(rawLabel) : undefined;
  // Saved "Mac mini USB" on a Tailscale/LAN profile must never win over hostname.
  const labelIsUsbBranded =
    Boolean(rawLabel) && /usb/i.test(rawLabel!) && !isLoopbackGatewayUrl(profile.gatewayUrl);

  if (
    label &&
    !labelIsUsbBranded &&
    !isBareIp(label) &&
    label !== ip &&
    !isGenericProfileLabel(label) &&
    !isTailnetRouteLabel(label)
  ) {
    return label;
  }
  if (hostname && hostname !== ip) {
    return hostname;
  }
  // Derive a real device name from a Tailscale MagicDNS host (phone.tailXXXX.ts.net ->
  // phone) so name-less or stale-generic-labelled Tailscale profiles show a real name
  // instead of "Computer". Must run before the stale-label fallback below.
  const magicName = magicDnsDeviceName(profile.hostname) ?? magicDnsDeviceName(profile.gatewayUrl);
  if (magicName) {
    return magicName;
  }
  if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return GENERIC_USB_PROFILE_LABEL;
  }
  if (ip && !isTailscaleIpv4(ip)) {
    return `Computer ${ip}`;
  }
  if (ip && isTailscaleIpv4(ip)) {
    return `Tailscale ${ip}`;
  }
  if (label && !isTailnetRouteLabel(label)) {
    return label;
  }
  if (hostname) {
    return hostname;
  }
  const urlHost = gatewayUrlHostname(profile.gatewayUrl);
  if (urlHost && !isTailnetRouteLabel(urlHost)) {
    return urlHost;
  }
  if (isTailscaleGatewayUrl(profile.gatewayUrl)) {
    return GENERIC_TAILSCALE_PROFILE_LABEL;
  }
  return urlHost ?? profile.gatewayUrl;
}

export function formatProfileLabel(profile: GatewayProfile): string {
  const name = profileDisplayName(profile);
  if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return name;
  }
  if (isTailscaleGatewayUrl(profile.gatewayUrl)) {
    const host = gatewayUrlHostname(profile.gatewayUrl);
    if (host && name !== host && !name.includes(host) && !isTailnetRouteLabel(name)) {
      return `${name} (${host})`;
    }
    return name;
  }
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

export function profileMachineKey(profile: GatewayProfile): string | undefined {
  return (
    normalizeMachineKey(profile.hostname) ||
    normalizeMachineKey(magicDnsDeviceName(profile.gatewayUrl)) ||
    (profile.label && !isGenericMachineLabel(profile.label)
      ? normalizeMachineKey(profile.label)
      : undefined)
  );
}

export function profilesShareMachine(a: GatewayProfile, b: GatewayProfile): boolean {
  const aKey = profileMachineKey(a);
  const bKey = profileMachineKey(b);
  return Boolean(aKey && bKey && aKey === bKey);
}

/** When the user picked a computer, heal/discovery may only use that machine's routes. */
export function profilesForActiveMachine(
  profiles: GatewayProfile[],
  activeProfileId: string | null | undefined,
): GatewayProfile[] {
  if (!activeProfileId) {
    return profiles;
  }
  const active = profiles.find((profile) => profile.id === activeProfileId);
  if (!active) {
    return profiles;
  }
  return profiles.filter(
    (profile) => profile.id === active.id || profilesShareMachine(active, profile),
  );
}

export function shouldProbeGatewayUrlForActiveProfile(
  state: GatewayProfileState,
  gatewayUrl: string,
  options?: { liveUsbHostname?: string | null },
): boolean {
  if (!state.activeProfileId) {
    return true;
  }
  return isDiscoveredUrlAllowedForActiveProfile(state, gatewayUrl, options);
}

/**
 * USB loopback may adopt a Tailscale URL only when it does not steal another Mac.
 * - Anonymous USB (no machine key) → any Tailscale (escape "Computer via USB" theater).
 * - Named USB (e.g. MacBook Pro) → same-machine Tailscale only.
 * Never silently activate Mac mini while USB identity is MacBook (or vice versa).
 */
export function canUsbLoopbackEscapeToUrl(
  state: GatewayProfileState,
  successfulUrl: string,
): boolean {
  const active = activeProfile(state);
  if (!active || !isLoopbackGatewayUrl(active.gatewayUrl)) {
    return false;
  }
  if (!isTailscaleGatewayUrl(successfulUrl)) {
    return false;
  }
  const activeKey = profileMachineKey(active);
  if (!activeKey) {
    return true;
  }
  const matched = findProfileForGatewayUrl(state.profiles, successfulUrl);
  if (!matched) {
    return false;
  }
  return profilesShareMachine(active, matched);
}

/** Heal must not repoint settings/active profile at another saved Mac. */
export function resolveHealPersistDecision(
  state: GatewayProfileState,
  successfulUrl: string,
  requestedActivation: boolean,
  options?: { liveUsbHostname?: string | null },
): {
  catalogOnly: boolean;
  returnUrl: string;
  requestedActivation: boolean;
} {
  const active = activeProfile(state);
  const allowed = isDiscoveredUrlAllowedForActiveProfile(state, successfulUrl, options);
  const usbLoopbackEscape = canUsbLoopbackEscapeToUrl(state, successfulUrl);
  if (state.activeProfileId && !allowed && !usbLoopbackEscape) {
    return {
      catalogOnly: true,
      returnUrl: active?.gatewayUrl?.trim() || successfulUrl,
      requestedActivation: false,
    };
  }
  return {
    catalogOnly: false,
    returnUrl: successfulUrl,
    requestedActivation: usbLoopbackEscape ? true : requestedActivation,
  };
}

/**
 * Heal may connect via this URL without switching away from the user's active profile.
 *
 * Unmatched USB/loopback is NOT a free pass: a cable to MacBook Pro answers on
 * 127.0.0.1 even when the user selected Mac mini over Tailscale. Only allow
 * loopback when:
 * - the active computer is already USB, or
 * - a saved loopback row shares the active machine identity, or
 * - liveUsbHostname matches the sticky Mac (same-machine USB prefer; product 2026-07-23).
 */
export function isDiscoveredUrlAllowedForActiveProfile(
  state: GatewayProfileState,
  successfulUrl: string,
  options?: { liveUsbHostname?: string | null },
): boolean {
  if (!state.activeProfileId) {
    return true;
  }
  const active = activeProfile(state);
  if (!active) {
    return false;
  }
  const matched = findProfileForGatewayUrl(state.profiles, successfulUrl);
  if (!matched) {
    // Never let anonymous 127.0.0.1 steal a Tailscale/LAN selection — unless the
    // live cable hostname proves it is the same sticky Mac (USB prefer-when-cabled).
    if (isLoopbackGatewayUrl(successfulUrl)) {
      if (isLoopbackGatewayUrl(active.gatewayUrl)) {
        return true;
      }
      const liveKey = normalizeMachineKey(options?.liveUsbHostname ?? undefined);
      const activeKey = profileMachineKey(active);
      return Boolean(liveKey && activeKey && liveKey === activeKey);
    }
    return false;
  }
  if (matched.id === active.id) {
    return true;
  }
  return profilesShareMachine(active, matched);
}

/** True when heal persist accepted the probed URL (not catalog-only rejection). */
export function healPersistAcceptedProbedUrl(appliedUrl: string, probedUrl: string): boolean {
  return normalizeGatewayUrlBase(appliedUrl) === normalizeGatewayUrlBase(probedUrl);
}

/** Update the active profile's gateway URL when heal finds an alternate route to the same Mac. */
export function updateActiveProfileGatewayUrl(
  state: GatewayProfileState,
  successfulUrl: string,
  meta?: { hostname?: string; localIp?: string; label?: string },
): GatewayProfileState {
  const activeId = state.activeProfileId;
  if (!activeId) {
    return state;
  }
  const gatewayUrl = normalizeGatewayUrlBase(successfulUrl);
  const now = new Date().toISOString();
  const profiles = state.profiles.map((profile) => {
    if (profile.id !== activeId) {
      return profile;
    }
    const priorKey = profileMachineKey(profile);
    const incomingHost = meta?.hostname?.trim();
    const incomingKey = normalizeMachineKey(incomingHost);
    // Cable identity must not rename the user's selected Mac (mini → Pro).
    const hostname =
      priorKey && incomingKey && priorKey !== incomingKey
        ? profile.hostname
        : incomingHost || profile.hostname;
    const label =
      priorKey && incomingKey && priorKey !== incomingKey
        ? profile.label
        : meta?.label?.trim() || profile.label;
    return {
      ...profile,
      gatewayUrl,
      hostname,
      localIp: meta?.localIp?.trim() || profile.localIp,
      label,
      lastConnectedAt: now,
    };
  });
  return dedupeGatewayProfiles({ ...state, profiles });
}

/** Catalog discovery and optionally activate — never switches to a different saved Mac on heal. */
export function applyHealDiscoveredUrl(
  state: GatewayProfileState,
  discovered: DiscoveredGateway,
  requestedActivation: boolean,
): GatewayProfileState {
  const url = discovered.gatewayUrl;
  const priorActive = activeProfile(state);
  const priorMachineKey = priorActive ? profileMachineKey(priorActive) : undefined;
  let next = upsertDiscoveredProfile(state, discovered, false);
  if (shouldActivateDiscoveredUrl(next, url, requestedActivation)) {
    next = upsertDiscoveredProfile(next, discovered, true);
  } else if (
    requestedActivation &&
    priorActive &&
    isDiscoveredUrlAllowedForActiveProfile(next, url) &&
    normalizeGatewayUrlBase(priorActive.gatewayUrl) !== normalizeGatewayUrlBase(url)
  ) {
    const discoveredKey = normalizeMachineKey(discovered.hostname) || normalizeMachineKey(discovered.label);
    // USB of another Mac must stay catalog-only — never rewrite active route/identity.
    if (
      isLoopbackGatewayUrl(url) &&
      priorMachineKey &&
      discoveredKey &&
      discoveredKey !== priorMachineKey
    ) {
      // already catalog-upserted above
    } else {
      next = updateActiveProfileGatewayUrl(next, url, {
        hostname: discovered.hostname,
        localIp: discovered.localIp,
        label: discovered.label,
      });
    }
  }
  if (priorMachineKey) {
    const afterActive = activeProfile(next);
    if (!afterActive || profileMachineKey(afterActive) !== priorMachineKey) {
      const sameMachine = next.profiles.find(
        (profile) => profileMachineKey(profile) === priorMachineKey,
      );
      if (sameMachine) {
        next = { ...next, activeProfileId: sameMachine.id };
      } else if (state.activeProfileId) {
        next = { ...next, activeProfileId: state.activeProfileId };
      }
    }
  }
  return next;
}

function profileDedupeKey(profile: GatewayProfile): string {
  const machineKey = profileMachineKey(profile);
  // Loopback/USB WITH a known machine identity → key by that machine (the USB route merges with the
  // same Mac's Wi-Fi/Tailscale entry, and USB-to-Pro stays distinct from USB-to-mini). Loopback
  // WITHOUT identity → collapse every generic "localhost"/"Computer via USB" row into ONE.
  if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return machineKey ? `host:${machineKey}` : 'loopback:usb';
  }
  // The same physical Mac can get a new LAN IP from DHCP, which
  // used to split it into duplicate rows. De-dupe by resolved machine identity (hostname), not IP.
  if (machineKey) {
    return `host:${machineKey}`;
  }
  const ip = profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
  if (ip && !isLoopbackHost(ip)) {
    return `ip:${ip}`;
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
  const label = resolveStoredProfileLabel({
    gatewayUrl,
    hostname,
    localIp,
    label:
      pickFriendlyProfileLabel(
        a.label,
        b.label,
        bonjourHostname(a.hostname),
        bonjourHostname(b.hostname),
        a.hostname?.replace(/\.local$/i, ''),
        b.hostname?.replace(/\.local$/i, ''),
      ) ||
      a.label ||
      b.label,
  });
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
    const prevKey = prev ? profileMachineKey(prev) : undefined;
    if (prevKey) {
      const sameMachine = profiles.find((profile) => profileMachineKey(profile) === prevKey);
      if (sameMachine) {
        activeProfileId = sameMachine.id;
        return { profiles, activeProfileId };
      }
    }
    const prevIp = prev?.localIp || extractLanIpFromGatewayUrl(prev?.gatewayUrl ?? '');
    activeProfileId =
      profiles.find(
        (p) =>
          p.id === activeProfileId ||
          (prevIp && (p.localIp === prevIp || extractLanIpFromGatewayUrl(p.gatewayUrl) === prevIp)),
      )?.id ?? activeProfileId;
  }
  return { profiles, activeProfileId };
}

export function activeProfile(state: GatewayProfileState): GatewayProfile | null {
  if (!state.activeProfileId) {
    return null;
  }
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
}

/**
 * Cold-start priority: last-used active id → most recently connected named/LAN/Tailscale
 * profile → (only if preferUsb) USB loopback.
 *
 * Never auto-pick USB loopback over a real paired computer by default — USB health can
 * go green without a key and produce Connected ⊕ Wrong key (2026-07-14 crisis).
 */
export function resolvePreferredActiveProfileId(
  state: GatewayProfileState,
  options?: { preferUsb?: boolean },
): string | null {
  const profiles = state.profiles.filter((p) => !isInvalidGatewayProfile(p));
  if (profiles.length === 0) {
    return null;
  }
  if (state.activeProfileId && profiles.some((p) => p.id === state.activeProfileId)) {
    return state.activeProfileId;
  }
  if (options?.preferUsb) {
    const usb = profiles.find((p) => isLoopbackGatewayUrl(p.gatewayUrl));
    if (usb) {
      return usb.id;
    }
  }
  // Prefer non-loopback computers (paired Tailscale/LAN) over synthetic USB loopback.
  const nonUsb = profiles.filter((p) => !isLoopbackGatewayUrl(p.gatewayUrl));
  const pool = nonUsb.length > 0 ? nonUsb : profiles;
  const sorted = [...pool].sort((a, b) =>
    (b.lastConnectedAt ?? b.addedAt).localeCompare(a.lastConnectedAt ?? a.addedAt),
  );
  return sorted[0]?.id ?? profiles[0]?.id ?? null;
}

/** Only switch active profile on heal/discovery when user has no selection or exact profile match. */
export function shouldActivateDiscoveredUrl(
  state: GatewayProfileState,
  successfulUrl: string,
  requested: boolean,
): boolean {
  if (!requested) {
    return false;
  }
  if (!state.activeProfileId) {
    return true;
  }
  const active = activeProfile(state);
  if (!active) {
    return false;
  }
  const matched = findProfileForGatewayUrl(state.profiles, successfulUrl);
  if (!matched) {
    return false;
  }
  return matched.id === state.activeProfileId;
}

/**
 * True when Choose computer would show "Tailscale 100.x" / generic Tailscale label
 * because hostname was never persisted from /health or MagicDNS.
 */
export function profileNeedsMachineNameEnrichment(profile: GatewayProfile): boolean {
  if (!isTailscaleGatewayUrl(profile.gatewayUrl)) {
    return false;
  }
  return isGenericMachineLabel(profileDisplayName(profile));
}

/** Persist every healthy Tailscale /health discovery as a saved computer profile. */
export function applyTailscaleDiscoveriesToProfileState(
  state: GatewayProfileState,
  discovered: DiscoveredGateway[],
  phoneTailscaleIp?: string | null,
): GatewayProfileState {
  let next = state;
  for (const item of filterPhoneTailscaleSelfPeers(discovered, phoneTailscaleIp)) {
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
  const urlIp = extractLanIpFromGatewayUrl(gatewayUrl);
  // Never let /health LAN local_ip replace a Tailscale CGNAT URL identity.
  const localIp =
    (urlIp && isTailscaleIpv4(urlIp) ? urlIp : undefined) ||
    discovered.localIp?.trim() ||
    urlIp ||
    undefined;
  const label = resolveStoredProfileLabel({
    gatewayUrl,
    hostname,
    label: discovered.label,
    localIp,
  });

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
      // Same LAN IP is not enough when hostnames disagree — poisoned pair.json once stamped
      // Mac mini's Tailscale URL with the MacBook's LAN IP and silently merged Mac Pro away.
      const existingKey =
        normalizeMachineKey(p.hostname) ||
        (p.label && !isGenericProfileLabel(p.label) ? normalizeMachineKey(p.label) : undefined);
      if (
        discoveredMachineKey &&
        existingKey &&
        discoveredMachineKey !== existingKey
      ) {
        return false;
      }
      return true;
    }
    if (
      hostname &&
      p.hostname &&
      hostname.toLowerCase() === p.hostname.toLowerCase() &&
      hostname.toLowerCase() !== 'localhost'
    ) {
      // Hostname-only match must not retarget another Mac's URL onto this row
      // (Pro identity + mini Tailscale URL used to steal the mini entry).
      const urlOwnedByOther = state.profiles.some(
        (other) =>
          other.id !== p.id &&
          normalizeGatewayUrlBase(other.gatewayUrl) === gatewayUrl,
      );
      if (urlOwnedByOther) {
        return false;
      }
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
      // Never stamp a foreign /health hostname onto the matched row (e.g. Pro identity
      // onto mini Tailscale URL during saveSettings→applyHeal). That flips machine key
      // and dedupe silently merges mini→Pro (2026-07-22 force-switch rage).
      const acceptIncomingIdentity = shouldAcceptHealthIdentityForProfile(p, {
        hostname,
        localIp,
      });
      const nextHostname = acceptIncomingIdentity ? hostname || p.hostname : p.hostname;
      const keepExistingLabel =
        p.label &&
        !isGenericProfileLabel(p.label) &&
        (!discovered.label?.trim() || isGenericProfileLabel(label) || !acceptIncomingIdentity);
      const finalLabel = keepExistingLabel
        ? p.label
        : resolveStoredProfileLabel({
            gatewayUrl,
            hostname: nextHostname,
            label: discovered.label || label || p.label,
            localIp: localIp || p.localIp,
          });

      return {
        ...p,
        gatewayUrl,
        label: finalLabel,
        hostname: nextHostname,
        localIp: localIp || p.localIp,
        lastConnectedAt: now,
      };
    });
    return dedupeGatewayProfiles({
      profiles,
      activeProfileId: makeActive ? existing.id : state.activeProfileId,
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
    activeProfileId: makeActive ? id : state.activeProfileId,
  });
}

export function selectProfile(state: GatewayProfileState, profileId: string): GatewayProfileState {
  const exists = state.profiles.some((p) => p.id === profileId);
  if (!exists) {
    return state;
  }
  const now = new Date().toISOString();
  const profiles = state.profiles.map((p) =>
    p.id === profileId ? { ...p, lastConnectedAt: now } : p,
  );
  return dedupeGatewayProfiles({ ...state, profiles, activeProfileId: profileId });
}

export function removeProfile(state: GatewayProfileState, profileId: string): GatewayProfileState {
  const profiles = state.profiles.filter((p) => p.id !== profileId);
  let activeProfileId = state.activeProfileId;
  if (activeProfileId === profileId) {
    activeProfileId = profiles[0]?.id ?? null;
  }
  return dedupeGatewayProfiles({ profiles, activeProfileId });
}

/**
 * Refuse foreign /health identity. Overwriting mini's hostname with MacBook Pro
 * (USB cable answering while Tailscale mini is active) then running dedupe merges
 * the two computers and silently steals the user's selection (2026-07-21 rage).
 */
export function shouldAcceptHealthIdentityForProfile(
  profile: GatewayProfile,
  health: { hostname?: string; localIp?: string },
): boolean {
  const priorKey = profileMachineKey(profile);
  const incomingKey = normalizeMachineKey(health.hostname);
  if (priorKey && incomingKey && priorKey !== incomingKey) {
    return false;
  }
  return true;
}

export function touchProfileHealth(
  state: GatewayProfileState,
  profileId: string,
  health: { hostname?: string; localIp?: string },
): GatewayProfileState {
  const target = state.profiles.find((p) => p.id === profileId);
  if (!target) {
    return state;
  }
  if (!shouldAcceptHealthIdentityForProfile(target, health)) {
    return state;
  }
  const profiles = state.profiles.map((p) => {
    if (p.id !== profileId) {
      return p;
    }
    const hostname = health.hostname?.trim() || p.hostname;
    const localIp =
      resolveDisplayLanIp(health.localIp, p.gatewayUrl) ||
      resolveDisplayLanIp(p.localIp, p.gatewayUrl);
    const label =
      isIpOnlyProfileLabel(p) || isTailnetRouteLabel(p.label)
        ? resolveStoredProfileLabel({
            gatewayUrl: p.gatewayUrl,
            hostname,
            label: p.label,
            localIp,
          })
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
