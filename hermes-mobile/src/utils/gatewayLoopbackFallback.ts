import { Platform } from 'react-native';
import type { GatewayProfile } from '../types/gatewayProfile';
import { profileMachineKey, profilesForActiveMachine } from '../services/gatewayProfiles';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import { buildGatewayUrlFromLanIp, isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { buildTailscaleGatewayUrl, isTailscaleGatewayUrl } from './tailscaleHosts';

export const USB_LOOPBACK_GATEWAY_URL = 'http://127.0.0.1:8642';

/** Localhost candidates are valid for web and Android adb/emulator transports, never iOS. */
export function localGatewayProbeCandidates(platformOS: string): string[] {
  if (platformOS === 'web') {
    return [USB_LOOPBACK_GATEWAY_URL];
  }
  if (platformOS === 'android') {
    return [USB_LOOPBACK_GATEWAY_URL, 'http://10.0.2.2:8642'];
  }
  return [];
}

/** Skip probing a LAN URL when the phone is off Wi‑Fi — try USB loopback instead. */
export function shouldSkipLanGatewayProbe(gatewayUrl: string, wifiConnected: boolean): boolean {
  if (wifiConnected || Platform.OS === 'web') {
    return false;
  }
  return isPrivateLanGatewayUrl(gatewayUrl) && !isLoopbackGatewayUrl(gatewayUrl);
}

/**
 * Ordered fallback URLs after the active URL fails (Android USB adb reverse only).
 * iPad/iPhone never get adb reverse — probing 127.0.0.1 leaves them stuck on
 * "unreachable · USB" forever (2026-07-25 iPad dogfood).
 */
export function usbLoopbackFallbackUrls(primaryUrl: string): string[] {
  if (Platform.OS !== 'android' || isLoopbackGatewayUrl(primaryUrl)) {
    return [];
  }
  return [USB_LOOPBACK_GATEWAY_URL];
}

/** When USB adb reverse is down but phone is on Wi‑Fi, try saved LAN addresses. */
export function wifiLanFallbackUrls(input: {
  primaryUrl: string;
  wifiConnected: boolean;
  lastLanIp?: string | null;
  profileLanIps?: Array<string | null | undefined>;
  activeProfileId?: string | null;
  profiles?: GatewayProfile[];
}): string[] {
  if (Platform.OS === 'web' || !input.wifiConnected || !isLoopbackGatewayUrl(input.primaryUrl)) {
    return [];
  }
  const scopedProfiles = input.profiles?.length
    ? profilesForActiveMachine(input.profiles, input.activeProfileId)
    : undefined;
  const profileLanIps =
    scopedProfiles?.map((profile) => profile.localIp?.trim() || undefined) ??
    input.profileLanIps ??
    [];
  const seen = new Set<string>([input.primaryUrl.trim()]);
  const urls: string[] = [];
  for (const rawIp of [input.lastLanIp, ...profileLanIps]) {
    const ip = rawIp?.trim();
    if (!ip) {
      continue;
    }
    const url = buildGatewayUrlFromLanIp(ip);
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/** Try saved or probed Tailscale gateway URLs when LAN/USB paths fail (Wi‑Fi or cellular). */
export function cellularTailscaleFallbackUrls(input: {
  primaryUrl: string;
  wifiConnected: boolean;
  profileUrls?: string[];
  tailnetProbeHosts?: string[];
  activeProfileId?: string | null;
  profiles?: GatewayProfile[];
}): string[] {
  if (Platform.OS === 'web') {
    return [];
  }
  // Off-Wi‑Fi anonymous USB only: unscope so heal can catalog Tailscale peers.
  // Named USB (MacBook Pro) stays scoped — never probe/activate mini behind the user's back.
  const active =
    input.profiles?.find((profile) => profile.id === input.activeProfileId) ?? null;
  const anonymousUsbStuckOffWifi =
    !input.wifiConnected &&
    isLoopbackGatewayUrl(input.primaryUrl) &&
    active != null &&
    !profileMachineKey(active);
  const scopedProfiles = input.profiles?.length
    ? anonymousUsbStuckOffWifi
      ? input.profiles
      : profilesForActiveMachine(input.profiles, input.activeProfileId)
    : undefined;
  const profileUrls =
    scopedProfiles?.map((profile) => profile.gatewayUrl) ?? input.profileUrls ?? [];
  const seen = new Set<string>([input.primaryUrl.trim()]);
  const urls: string[] = [];
  for (const url of profileUrls) {
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed) || !isTailscaleGatewayUrl(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    urls.push(trimmed);
  }
  for (const host of input.tailnetProbeHosts ?? []) {
    const url = buildTailscaleGatewayUrl(host);
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}
