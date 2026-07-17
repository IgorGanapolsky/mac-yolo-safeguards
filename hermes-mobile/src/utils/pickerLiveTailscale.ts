import type { DiscoveredGateway, GatewayProfile } from '../types/gatewayProfile';
import { normalizeGatewayUrl } from '../services/gatewayClient';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import { profileMatchesDiscoveredGateway } from './gatewayProfilePicker';

function normalizeBase(url: string): string {
  try {
    return normalizeGatewayUrl(url.trim()).httpBase;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

/**
 * True when a saved profile is answering on a live Tailscale probe hit.
 * Requires the saved row itself to be a Tailscale URL (or exact URL match) so a
 * USB/LAN-only card is never labeled "On Tailscale" while Add chips cover the
 * alternate Tailscale route.
 */
export function profileMatchesLiveTailscaleDiscovery(
  profile: GatewayProfile,
  discoveries: DiscoveredGateway[],
): boolean {
  if (!discoveries.length) {
    return false;
  }
  const profileBase = normalizeBase(profile.gatewayUrl);
  const profileIsTailscale = isTailscaleGatewayUrl(profile.gatewayUrl);
  for (const discovery of discoveries) {
    if (normalizeBase(discovery.gatewayUrl) === profileBase) {
      return true;
    }
    if (profileIsTailscale && profileMatchesDiscoveredGateway(profile, discovery)) {
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
