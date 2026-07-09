import { Platform } from 'react-native';
import type { GatewayProfile } from '../types/gatewayProfile';
import { profilesForActiveMachine } from '../services/gatewayProfiles';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import { buildGatewayUrlFromLanIp, isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { buildTailscaleGatewayUrl, isTailscaleGatewayUrl } from './tailscaleHosts';

export const USB_LOOPBACK_GATEWAY_URL = 'http://127.0.0.1:8642';

/** Skip probing a LAN URL when the phone is off Wi‑Fi — try USB loopback instead. */
export function shouldSkipLanGatewayProbe(gatewayUrl: string, wifiConnected: boolean): boolean {
  if (wifiConnected || Platform.OS === 'web') {
    return false;
  }
  return isPrivateLanGatewayUrl(gatewayUrl) && !isLoopbackGatewayUrl(gatewayUrl);
}

/** Ordered fallback URLs after the active URL fails (native USB adb reverse). */
export function usbLoopbackFallbackUrls(primaryUrl: string): string[] {
  if (Platform.OS === 'web' || isLoopbackGatewayUrl(primaryUrl)) {
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
  const scopedProfiles = input.profiles?.length
    ? profilesForActiveMachine(input.profiles, input.activeProfileId)
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
