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
import { isInvalidGatewayProfile, profileDisplayName } from '../services/gatewayProfiles';

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

export function profilesForDevicePicker(profiles: GatewayProfile[]): GatewayProfile[] {
  return profiles.filter((p) => !isInvalidGatewayProfile(p));
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
  return `USB is connected to ${mismatch.usbHostLabel}, not ${mismatch.selectedProfileLabel}. Switch saved computers or unplug from the other Mac.`;
}

export type ProfileConnectionRoute = 'USB' | 'Wi-Fi' | 'Tunnel' | 'Needs tunnel';

/** Reachability route label for multi-Mac switcher rows. */
export function profileConnectionRouteLabel(
  profile: GatewayProfile,
  wifiConnected: boolean,
): ProfileConnectionRoute {
  if (isLoopbackGatewayUrl(profile.gatewayUrl)) {
    return 'USB';
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
