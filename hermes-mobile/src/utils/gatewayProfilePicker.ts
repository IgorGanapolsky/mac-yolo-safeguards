import { Platform } from 'react-native';
import type { GatewayProfile } from '../types/gatewayProfile';
import {
  extractLanIpFromGatewayUrl,
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
  isLoopbackHost,
  resolveDisplayLanIp,
} from './gatewayUrlPolicy';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import {
  isInvalidGatewayProfile,
  profileDisplayName,
  profileMachineKey,
  GENERIC_USB_PROFILE_LABEL,
  LEGACY_USB_PROFILE_LABEL,
} from '../services/gatewayProfiles';
import { isTailscaleGatewayUrl } from './tailscaleHosts';

export type ProfilePickerLines = {
  title: string;
  detail?: string;
};

export function profilePickerLines(profile: GatewayProfile): ProfilePickerLines {
  const title = profileDisplayName(profile);
  const ip = resolveDisplayLanIp(profile.localIp, profile.gatewayUrl);
  if (ip && !title.includes(ip)) {
    return { title, detail: `${ip}:8642` };
  }
  const host = gatewayUrlHostname(profile.gatewayUrl);
  if (host && !isLoopbackHost(host) && !title.toLowerCase().includes(host.toLowerCase())) {
    const endpoint = host.includes(':') ? host : `${host}:8642`;
    return { title, detail: endpoint };
  }
  return { title };
}

function profilePickerDedupeKey(profile: GatewayProfile): string {
  const route = profileConnectionRouteLabel(profile, true);
  const title = profileDisplayName(profile).trim().toLowerCase();
  if (title) {
    return `${route}:${title}`;
  }
  return `${route}:${gatewayUrlHostname(profile.gatewayUrl) ?? profile.gatewayUrl}`;
}

export function profilesForDevicePicker(profiles: GatewayProfile[]): GatewayProfile[] {
  const seen = new Set<string>();
  const result: GatewayProfile[] = [];
  for (const profile of profiles) {
    if (isInvalidGatewayProfile(profile)) {
      continue;
    }
    const key = profilePickerDedupeKey(profile);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(profile);
  }
  return result;
}

const GENERIC_USB_LOOPBACK_ID = 'mac_usb_loopback';

export function isGenericUsbLoopbackProfile(profile: GatewayProfile): boolean {
  return (
    profile.id === GENERIC_USB_LOOPBACK_ID ||
    (isLoopbackGatewayUrl(profile.gatewayUrl) &&
      (profile.label?.trim() === GENERIC_USB_PROFILE_LABEL ||
        profile.label?.trim() === LEGACY_USB_PROFILE_LABEL) &&
      !profile.hostname?.trim())
  );
}

function hasNamedUsbLoopbackProfile(profiles: GatewayProfile[]): boolean {
  return profiles.some(
    (p) =>
      isLoopbackGatewayUrl(p.gatewayUrl) &&
      !isGenericUsbLoopbackProfile(p) &&
      Boolean(
        p.hostname?.trim() ||
          (p.label?.trim() &&
            p.label.trim() !== GENERIC_USB_PROFILE_LABEL &&
            p.label.trim() !== LEGACY_USB_PROFILE_LABEL),
      ),
  );
}

export type SwitchComputerPickerOptions = {
  activeProfileId?: string | null;
};

function profileRecency(profile: GatewayProfile): string {
  return profile.lastConnectedAt ?? profile.addedAt;
}

function profilePickerAliasKey(profile: GatewayProfile): string {
  const route = profileConnectionRouteLabel(profile, true);
  const machineKey =
    profileMachineKey(profile) ??
    profileDisplayName(profile)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return `${route}:${machineKey || gatewayUrlHostname(profile.gatewayUrl) || profile.gatewayUrl}`;
}

function preferPickerAlias(
  current: GatewayProfile,
  candidate: GatewayProfile,
  activeProfileId?: string | null,
): GatewayProfile {
  if (candidate.id === activeProfileId && current.id !== activeProfileId) {
    return candidate;
  }
  if (current.id === activeProfileId && candidate.id !== activeProfileId) {
    return current;
  }
  const currentName = profileDisplayName(current);
  const candidateName = profileDisplayName(candidate);
  const currentGeneric = isGenericPickerTitle(currentName);
  const candidateGeneric = isGenericPickerTitle(candidateName);
  if (currentGeneric !== candidateGeneric) {
    return candidateGeneric ? current : candidate;
  }
  return profileRecency(candidate) > profileRecency(current) ? candidate : current;
}

function collapsePickerAliases(
  profiles: GatewayProfile[],
  activeProfileId?: string | null,
): GatewayProfile[] {
  const byAlias = new Map<string, GatewayProfile>();
  for (const profile of profiles) {
    const key = profilePickerAliasKey(profile);
    const current = byAlias.get(key);
    byAlias.set(
      key,
      current ? preferPickerAlias(current, profile, activeProfileId) : profile,
    );
  }
  return Array.from(byAlias.values());
}

function isGenericPickerTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    !normalized ||
    normalized === GENERIC_USB_PROFILE_LABEL.toLowerCase() ||
    normalized === 'localhost' ||
    normalized.startsWith('computer ') ||
    normalized.startsWith('tailscale ')
  );
}

function profilePickerSortRank(profile: GatewayProfile, activeProfileId?: string | null): number {
  if (profile.id === activeProfileId) {
    return 0;
  }
  const route = profileConnectionRouteLabel(profile, true);
  const generic = isGenericPickerTitle(profileDisplayName(profile));
  if (!generic && route === 'Tailscale') {
    return 1;
  }
  if (!generic && route === 'Wi-Fi') {
    return 2;
  }
  if (!generic && route === 'USB') {
    return 3;
  }
  if (!generic) {
    return 4;
  }
  if (route === 'Tailscale') {
    return 5;
  }
  if (route === 'Wi-Fi') {
    return 6;
  }
  if (route === 'USB') {
    return 7;
  }
  return 8;
}

function sortProfilesForSwitchPicker(
  profiles: GatewayProfile[],
  activeProfileId?: string | null,
): GatewayProfile[] {
  return profiles
    .map((profile, index) => ({ profile, index }))
    .sort((a, b) => {
      const rank = profilePickerSortRank(a.profile, activeProfileId) -
        profilePickerSortRank(b.profile, activeProfileId);
      if (rank !== 0) {
        return rank;
      }
      const recency = profileRecency(b.profile).localeCompare(profileRecency(a.profile));
      if (recency !== 0) {
        return recency;
      }
      const name = profileDisplayName(a.profile).localeCompare(profileDisplayName(b.profile));
      if (name !== 0) {
        return name;
      }
      return a.index - b.index;
    })
    .map((item) => item.profile);
}

/** Switch-computer list: valid profiles, readable names, and canonical rows for duplicate aliases. */
export function profilesForSwitchComputerPicker(
  profiles: GatewayProfile[],
  options: SwitchComputerPickerOptions = {},
): GatewayProfile[] {
  const valid = profiles.filter((p) => !isInvalidGatewayProfile(p));
  const withoutRedundantUsb = hasNamedUsbLoopbackProfile(valid)
    ? valid.filter((p) => !isGenericUsbLoopbackProfile(p))
    : valid;
  const collapsed = collapsePickerAliases(withoutRedundantUsb, options.activeProfileId);
  return sortProfilesForSwitchPicker(collapsed, options.activeProfileId);
}

export type UsbHostMismatch = {
  usbHostLabel: string;
  selectedProfileLabel: string;
  matchingProfileId?: string;
};

/** USB adb reverse reaches whichever Mac is plugged in — may differ from the saved active profile. */
export function detectUsbHostMismatch(input: {
  activeProfile: GatewayProfile | null;
  gatewayUrl: string;
  healthHostname?: string | null;
  profiles: GatewayProfile[];
  macHttpOk?: boolean;
}): UsbHostMismatch | null {
  const healthHost = input.healthHostname?.trim();
  if (!healthHost || !input.macHttpOk) {
    return null;
  }
  if (!isLoopbackGatewayUrl(input.gatewayUrl)) {
    return null;
  }
  const active = input.activeProfile;
  if (!active) {
    return null;
  }
  if (profileMatchesHostname(active, healthHost)) {
    return null;
  }
  const usbHostLabel = healthHost.replace(/\.local$/i, '');
  const selectedProfileLabel = profileDisplayName(active);
  const matchingProfile = input.profiles.find((profile) =>
    profileMatchesHostname(profile, healthHost),
  );
  return {
    usbHostLabel,
    selectedProfileLabel,
    matchingProfileId: matchingProfile?.id,
  };
}

export function formatUsbHostMismatchMessage(mismatch: UsbHostMismatch): string {
  if (mismatch.matchingProfileId) {
    return `USB is connected to ${mismatch.usbHostLabel}, but you selected ${mismatch.selectedProfileLabel}. Tap ${mismatch.usbHostLabel} in Saved computers below.`;
  }
  return `USB is connected to ${mismatch.usbHostLabel}, not ${mismatch.selectedProfileLabel}. Switch saved computers or unplug from the other computer.`;
}

export type ProfileConnectionRoute = 'USB' | 'Wi-Fi' | 'Tailscale' | 'Tunnel' | 'Needs tunnel';

/** Reachability route label for multi-Mac switcher rows. */
export function profileConnectionRouteLabel(
  profile: GatewayProfile,
  wifiConnected: boolean,
): ProfileConnectionRoute {
  if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return 'USB';
  }
  if (isTailscaleGatewayUrl(profile.gatewayUrl)) {
    return 'Tailscale';
  }
  if (isPrivateLanGatewayUrl(profile.gatewayUrl)) {
    return wifiConnected ? 'Wi-Fi' : 'Needs tunnel';
  }
  return 'Tunnel';
}

/** Saved profile id matching USB loopback /health hostname, when active profile differs. */
export function resolveUsbMatchingProfileId(input: {
  activeProfile: GatewayProfile | null;
  gatewayUrl: string;
  healthHostname?: string | null;
  profiles: GatewayProfile[];
  macHttpOk?: boolean;
}): string | null {
  return detectUsbHostMismatch(input)?.matchingProfileId ?? null;
}

export function hasOnlyLoopbackProfiles(profiles: GatewayProfile[]): boolean {
  const valid = profilesForDevicePicker(profiles);
  return valid.length > 0 && valid.every((p) => isLoopbackGatewayUrl(p.gatewayUrl));
}

export function hasNonLoopbackSavedProfile(profiles: GatewayProfile[]): boolean {
  return profilesForDevicePicker(profiles).some((p) => !isLoopbackGatewayUrl(p.gatewayUrl));
}

/** True when saved URL is USB loopback but phone is on Wi‑Fi — prefer LAN search, not USB repair. */
export function shouldOfferUsbLinkRepair(input: {
  gatewayUrl: string;
  wifiConnected: boolean;
  macHttpOk: boolean;
  tailnetProbeHostCount?: number;
  tailscaleDiscoveryCount?: number;
  onlyLoopbackProfiles?: boolean;
}): boolean {
  if (!isLoopbackGatewayUrl(input.gatewayUrl) || input.macHttpOk) {
    return false;
  }
  if ((input.tailnetProbeHostCount ?? 0) > 0) {
    return false;
  }
  if ((input.tailscaleDiscoveryCount ?? 0) > 0) {
    return false;
  }
  if (input.onlyLoopbackProfiles) {
    return false;
  }
  return !input.wifiConnected;
}

export function profileMatchesDiscoveredGateway(
  profile: GatewayProfile,
  discovered: { gatewayUrl: string; hostname?: string; label?: string; localIp?: string },
): boolean {
  if (isLoopbackGatewayUrl(discovered.gatewayUrl)) {
    return false;
  }
  const hostNeedle = discovered.hostname?.trim();
  if (hostNeedle && profileMatchesHostname(profile, hostNeedle)) {
    return true;
  }
  const labelNeedle = discovered.label?.trim();
  if (labelNeedle && profileMatchesHostname(profile, labelNeedle)) {
    return true;
  }
  const discoveredIp =
    discovered.localIp?.trim() || extractLanIpFromGatewayUrl(discovered.gatewayUrl);
  const profileIp = profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
  return Boolean(discoveredIp && profileIp && discoveredIp === profileIp);
}

export function profileMatchesHostname(profile: GatewayProfile, hostname: string): boolean {
  const haystack = [
    profile.hostname,
    profile.label,
    profileDisplayName(profile),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\.local/gi, '');
  const needles = hostname
    .trim()
    .toLowerCase()
    .replace(/\.local$/i, '')
    .split(/[·•|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (needles.length === 0) {
    return false;
  }
  const ip = extractLanIpFromGatewayUrl(profile.gatewayUrl);
  return needles.some(
    (needle) =>
      haystack.includes(needle) ||
      (ip && needle === ip),
  );
}
