import { Platform } from 'react-native';
import type { GatewayProfile } from '../types/gatewayProfile';
import { profileIdFromGatewayUrl } from '../services/gatewayProfiles';
import {
  extractLanIpFromGatewayUrl,
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
  isLoopbackHost,
  resolveDisplayLanIp,
} from './gatewayUrlPolicy';
import { USB_LOOPBACK_GATEWAY_URL } from './gatewayLoopbackFallback';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import {
  isGenericMachineLabel,
  isInvalidGatewayProfile,
  profileDisplayName,
} from '../services/gatewayProfiles';
import { isTailscaleGatewayUrl, isTailscaleIpv4 } from './tailscaleHosts';

export type ProfilePickerLines = {
  title: string;
  detail?: string;
};

function profilePickerEndpoint(profile: GatewayProfile): string | undefined {
  if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return undefined;
  }
  if (isTailscaleGatewayUrl(profile.gatewayUrl)) {
    const host = gatewayUrlHostname(profile.gatewayUrl);
    if (!host) {
      return undefined;
    }
    return host.includes(':') ? host : `${host}:8642`;
  }
  const ip = resolveDisplayLanIp(profile.localIp, profile.gatewayUrl);
  if (ip) {
    return `${ip}:8642`;
  }
  const host = gatewayUrlHostname(profile.gatewayUrl);
  if (host && !isLoopbackHost(host)) {
    return host.includes(':') ? host : `${host}:8642`;
  }
  return undefined;
}

export function profilePickerLines(profile: GatewayProfile): ProfilePickerLines {
  const title = profileDisplayName(profile);
  const endpoint = profilePickerEndpoint(profile);
  if (endpoint && !title.toLowerCase().includes(endpoint.split(':')[0].toLowerCase())) {
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
    (isLoopbackGatewayUrl(profile.gatewayUrl) && isGenericMachineLabel(profile.label) && !profile.hostname?.trim())
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
            !isGenericMachineLabel(p.label)),
      ),
  );
}

export type SwitchComputerPickerOptions = {
  activeProfileId?: string | null;
  /** Live adb-reverse probe — when reachable, show the plugged-in Mac as a USB row. */
  liveUsb?: LiveUsbPickerInput | null;
};

export type LiveUsbPickerInput = {
  reachable: boolean;
  hostname?: string | null;
};

/** Loopback/USB rows stay hidden unless adb reverse is live (phone probes 127.0.0.1:8642). */
export function shouldShowProfileInUserPicker(
  profile: GatewayProfile,
  options: Partial<Pick<LiveUsbPickerInput, 'reachable' | 'hostname'>> = {},
): boolean {
  if (isInvalidGatewayProfile(profile)) {
    return false;
  }
  if (!isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return true;
  }
  if (!options.reachable) {
    return false;
  }
  const liveHost = options.hostname?.trim();
  if (!liveHost) {
    return !isGenericUsbLoopbackProfile(profile);
  }
  return profileMatchesHostname(profile, liveHost);
}

function isLikelyMobileTailscaleProfile(profile: GatewayProfile): boolean {
  if (!isTailscaleGatewayUrl(profile.gatewayUrl)) {
    return false;
  }
  const haystack = [
    profile.label,
    profile.hostname,
    gatewayUrlHostname(profile.gatewayUrl),
    profileDisplayName(profile),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(android|iphone|ipad|pixel|galaxy|s2[0-9]|s25)\b/.test(haystack);
}

function isUnnamedInactiveTailscaleIpProfile(
  profile: GatewayProfile,
  activeProfileId?: string | null,
): boolean {
  if (profile.id === activeProfileId || !isTailscaleGatewayUrl(profile.gatewayUrl)) {
    return false;
  }
  const ip = profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
  if (!ip || !isTailscaleIpv4(ip)) {
    return false;
  }
  if (profile.hostname?.trim()) {
    return false;
  }
  if (profile.lastConnectedAt?.trim()) {
    return false;
  }
  return isGenericMachineLabel(profile.label);
}

function switchPickerRowKey(profile: GatewayProfile): string {
  if (isGenericUsbLoopbackProfile(profile)) {
    return 'usb:generic';
  }
  const route = isLoopbackGatewayUrl(profile.gatewayUrl)
    ? 'usb'
    : isTailscaleGatewayUrl(profile.gatewayUrl)
      ? 'tailscale'
      : 'lan';
  const name = profileDisplayName(profile).toLowerCase();
  if (!isGenericMachineLabel(name)) {
    return `${route}:name:${name}`;
  }
  const ip = profile.localIp?.trim() || extractLanIpFromGatewayUrl(profile.gatewayUrl);
  if (ip) {
    return `ip:${ip}`;
  }
  return `url:${profile.gatewayUrl.trim().toLowerCase()}`;
}

function dedupeSwitchPickerRows(profiles: GatewayProfile[]): GatewayProfile[] {
  const seen = new Set<string>();
  const rows: GatewayProfile[] = [];
  for (const profile of profiles) {
    const key = switchPickerRowKey(profile);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push(profile);
  }
  return rows;
}

function synthesizeLiveUsbProfile(hostname: string): GatewayProfile {
  const cleanHost = hostname.replace(/\.local$/i, '').trim();
  const now = new Date().toISOString();
  return {
    id: profileIdFromGatewayUrl(USB_LOOPBACK_GATEWAY_URL, cleanHost),
    label: cleanHost,
    gatewayUrl: USB_LOOPBACK_GATEWAY_URL,
    hostname: hostname.includes('.local') ? hostname : `${cleanHost}.local`,
    addedAt: now,
    lastConnectedAt: now,
  };
}

function sortUsbProfilesFirst(profiles: GatewayProfile[]): GatewayProfile[] {
  return [...profiles].sort((a, b) => {
    const aUsb = isLoopbackGatewayUrl(a.gatewayUrl);
    const bUsb = isLoopbackGatewayUrl(b.gatewayUrl);
    if (aUsb && !bUsb) {
      return -1;
    }
    if (!aUsb && bUsb) {
      return 1;
    }
    return 0;
  });
}

/** Switch-computer list: valid profiles minus phone/self, hidden loopback unless live USB, deduped. */
export function profilesForSwitchComputerPicker(
  profiles: GatewayProfile[],
  options: SwitchComputerPickerOptions = {},
): GatewayProfile[] {
  const liveUsb = options.liveUsb;
  const liveUsbReachable = liveUsb?.reachable === true;
  const liveUsbHostname = liveUsb?.hostname ?? null;
  let valid = dedupeSwitchPickerRows(
    profilesForDevicePicker(profiles).filter(
      (profile) =>
        shouldShowProfileInUserPicker(profile, {
          reachable: liveUsbReachable,
          hostname: liveUsbHostname,
        }) &&
        !isLikelyMobileTailscaleProfile(profile) &&
        !isUnnamedInactiveTailscaleIpProfile(profile, options.activeProfileId),
    ),
  );
  if (liveUsbReachable && liveUsbHostname?.trim()) {
    const hasMatchingUsb = valid.some(
      (profile) =>
        isLoopbackGatewayUrl(profile.gatewayUrl) &&
        profileMatchesHostname(profile, liveUsbHostname),
    );
    if (!hasMatchingUsb) {
      valid = [synthesizeLiveUsbProfile(liveUsbHostname), ...valid];
    }
  }
  if (hasNamedUsbLoopbackProfile(valid)) {
    valid = valid.filter((p) => !isGenericUsbLoopbackProfile(p));
  }
  if (liveUsbReachable) {
    valid = sortUsbProfilesFirst(valid);
  }
  return valid;
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
