import type { DiscoveredGateway, GatewayProfile } from '../types/gatewayProfile';
import { normalizeGatewayUrl } from '../services/gatewayClient';
import { profileMatchesDiscoveredGateway } from './gatewayProfilePicker';

function normalizeBase(url: string): string {
  try {
    return normalizeGatewayUrl(url.trim()).httpBase;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

/** True when a saved profile matches a live Tailscale discovery (same machine). */
export function profileMatchesLiveTailscaleDiscovery(
  profile: GatewayProfile,
  discoveries: DiscoveredGateway[],
): boolean {
  if (!discoveries.length) {
    return false;
  }
  const profileBase = normalizeBase(profile.gatewayUrl);
  for (const discovery of discoveries) {
    if (normalizeBase(discovery.gatewayUrl) === profileBase) {
      return true;
    }
    if (profileMatchesDiscoveredGateway(profile, discovery)) {
      return true;
    }
  }
  return false;
}

export function profileIdsOnLiveTailscale(
  profiles: GatewayProfile[],
  discoveries: DiscoveredGateway[],
): Set<string> {
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (profileMatchesLiveTailscaleDiscovery(profile, discoveries)) {
      ids.add(profile.id);
    }
  }
  return ids;
}
