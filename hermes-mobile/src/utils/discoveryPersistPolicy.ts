import type { DiscoveredGateway, GatewayProfile } from '../types/gatewayProfile';
import { isDiscoveredComputerAlreadySaved } from '../services/tailscaleDiscovery';
import { hasValidSavedComputer, isFreshUserUnpaired } from './freshUserOnboarding';
import { profileMatchesDiscoveredGateway } from './gatewayProfilePicker';

/**
 * Fresh-user privacy contract: silent Tailscale/USB discovery must NOT invent
 * "saved computers" (and then show Outdated connection / Re-pair) before the
 * user pairs or taps Find computers / Add.
 *
 * Returning users may auto-persist discoveries that match an already-saved Mac
 * (route heal). Brand-new discoveries stay ephemeral until explicit user action.
 */

export function shouldAutoScanOnBootstrap(profiles: GatewayProfile[]): boolean {
  return hasValidSavedComputer(profiles);
}

export function partitionSilentDiscoveries(
  profiles: GatewayProfile[],
  discovered: DiscoveredGateway[],
): {
  /** Safe to upsert + AsyncStorage-save without user tap. */
  toPersist: DiscoveredGateway[];
  /** Show as Add chips only — never silent-save for a stranger. */
  ephemeral: DiscoveredGateway[];
} {
  if (discovered.length === 0) {
    return { toPersist: [], ephemeral: [] };
  }

  if (isFreshUserUnpaired(profiles)) {
    return { toPersist: [], ephemeral: [...discovered] };
  }

  const toPersist: DiscoveredGateway[] = [];
  const ephemeral: DiscoveredGateway[] = [];
  for (const item of discovered) {
    const matchesSaved = profiles.some((profile) =>
      profileMatchesDiscoveredGateway(profile, item),
    );
    if (matchesSaved || isDiscoveredComputerAlreadySaved(profiles, item)) {
      toPersist.push(item);
    } else {
      ephemeral.push(item);
    }
  }
  return { toPersist, ephemeral };
}
