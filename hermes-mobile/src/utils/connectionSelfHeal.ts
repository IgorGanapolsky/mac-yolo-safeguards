import type { GatewayProfile } from '../types/gatewayProfile';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import {
  cellularTailscaleFallbackUrls,
  usbLoopbackFallbackUrls,
  wifiLanFallbackUrls,
} from './gatewayLoopbackFallback';
import { isLoopbackGatewayUrl, isValidGatewayUrl } from './gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import { profileMatchesDiscoveredGateway } from './gatewayProfilePicker';

export const CONNECTION_SELF_HEAL_INTERVAL_MS = 5_000;

export function savedProfileFallbackUrls(input: {
  primaryUrl: string;
  profiles: GatewayProfile[];
  preferTailscaleFirst?: boolean;
}): string[] {
  const primary = input.primaryUrl.trim();
  const seen = new Set<string>([primary]);
  const tailscale: string[] = [];
  const lan: string[] = [];
  const loopback: string[] = [];
  const other: string[] = [];

  for (const profile of input.profiles) {
    const url = profile.gatewayUrl.trim();
    if (!url || seen.has(url) || !isValidGatewayUrl(url)) {
      continue;
    }
    seen.add(url);
    if (isTailscaleGatewayUrl(url)) {
      tailscale.push(url);
    } else if (isLoopbackGatewayUrl(url)) {
      loopback.push(url);
    } else if (isPrivateLanGatewayUrl(url)) {
      lan.push(url);
    } else {
      other.push(url);
    }
  }

  const preferTailscale =
    input.preferTailscaleFirst ?? isPrivateLanGatewayUrl(primary);
  if (preferTailscale) {
    return [...tailscale, ...lan, ...other, ...loopback];
  }
  return [...lan, ...tailscale, ...other, ...loopback];
}

export function buildSelfHealProbeUrls(input: {
  primaryUrl: string;
  wifiConnected: boolean;
  lastLanIp?: string | null;
  profiles: GatewayProfile[];
  tailnetProbeHosts?: string[];
}): string[] {
  const primary = input.primaryUrl.trim();
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || trimmed === primary || seen.has(trimmed) || !isValidGatewayUrl(trimmed)) {
      return;
    }
    seen.add(trimmed);
    ordered.push(trimmed);
  };

  for (const url of savedProfileFallbackUrls({
    primaryUrl: primary,
    profiles: input.profiles,
    preferTailscaleFirst: true,
  })) {
    push(url);
  }

  for (const url of cellularTailscaleFallbackUrls({
    primaryUrl: primary,
    wifiConnected: input.wifiConnected,
    profileUrls: input.profiles.map((p) => p.gatewayUrl),
    tailnetProbeHosts: input.tailnetProbeHosts,
  })) {
    push(url);
  }

  for (const url of usbLoopbackFallbackUrls(primary)) {
    push(url);
  }

  for (const url of wifiLanFallbackUrls({
    primaryUrl: primary,
    wifiConnected: input.wifiConnected,
    lastLanIp: input.lastLanIp,
    profileLanIps: input.profiles.map(
      (profile) => profile.localIp?.trim() || undefined,
    ),
  })) {
    push(url);
  }

  return ordered;
}

/** When cellular blocks LAN, pick a reachable Tailscale URL for the active Mac (or any saved tailnet route). */
export function resolveCellularTailscaleFailoverUrl(input: {
  primaryUrl: string;
  profiles: GatewayProfile[];
  activeProfile: GatewayProfile | null;
  discoveries?: DiscoveredGateway[];
}): string | null {
  const primary = input.primaryUrl.trim();
  if (!primary || isTailscaleGatewayUrl(primary)) {
    return null;
  }
  if (!isPrivateLanGatewayUrl(primary) && !isLoopbackGatewayUrl(primary)) {
    return null;
  }

  const active = input.activeProfile;
  const discoveries = input.discoveries ?? [];

  if (active) {
    if (isTailscaleGatewayUrl(active.gatewayUrl) && active.gatewayUrl !== primary) {
      return active.gatewayUrl;
    }
    for (const discovery of discoveries) {
      if (
        isTailscaleGatewayUrl(discovery.gatewayUrl) &&
        profileMatchesDiscoveredGateway(active, discovery)
      ) {
        return discovery.gatewayUrl;
      }
    }
    for (const profile of input.profiles) {
      if (
        profile.id !== active.id &&
        isTailscaleGatewayUrl(profile.gatewayUrl) &&
        profileMatchesDiscoveredGateway(active, {
          gatewayUrl: profile.gatewayUrl,
          hostname: profile.hostname,
          label: profile.label,
          localIp: profile.localIp,
        })
      ) {
        return profile.gatewayUrl;
      }
    }
  }

  for (const profile of input.profiles) {
    const url = profile.gatewayUrl.trim();
    if (url && url !== primary && isTailscaleGatewayUrl(url)) {
      return url;
    }
  }
  for (const discovery of discoveries) {
    const url = discovery.gatewayUrl.trim();
    if (url && url !== primary && isTailscaleGatewayUrl(url)) {
      return url;
    }
  }
  return null;
}
