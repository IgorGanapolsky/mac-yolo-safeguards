import type { GatewayProfile, GatewayProfileState } from '../types/gatewayProfile';
import {
  findProfileForGatewayUrl,
  profileMachineKey,
} from '../services/gatewayProfiles';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';

/**
 * Resolve which saved profile a picker tap should activate after ensureProfile upsert.
 *
 * PRODUCT LAW: never fall back to an unrelated USB/loopback row when the user tapped
 * a Tailscale/LAN computer (Mac mini). That silent fallback made mini taps land on
 * MacBook Pro USB (2026-07-21 rage: "never able to switch to mac mini").
 */
export function resolveProfileAfterEnsureUpsert(input: {
  state: GatewayProfileState;
  requestedProfileId: string;
  ensure: GatewayProfile;
}): GatewayProfile | undefined {
  const { state, requestedProfileId, ensure } = input;

  const byRequestedId = state.profiles.find((p) => p.id === requestedProfileId);
  if (byRequestedId) {
    return byRequestedId;
  }

  if (ensure.id) {
    const byEnsureId = state.profiles.find((p) => p.id === ensure.id);
    if (byEnsureId) {
      return byEnsureId;
    }
  }

  const byUrl = findProfileForGatewayUrl(state.profiles, ensure.gatewayUrl);
  if (byUrl) {
    return byUrl;
  }

  const ensureKey = profileMachineKey(ensure);
  if (ensureKey) {
    const byMachine = state.profiles.find((p) => profileMachineKey(p) === ensureKey);
    if (byMachine) {
      return byMachine;
    }
  }

  // USB rows only: allow loopback merge when the tap itself was USB.
  if (isLoopbackGatewayUrl(ensure.gatewayUrl)) {
    const hostnameMatch = state.profiles.find(
      (p) =>
        isLoopbackGatewayUrl(p.gatewayUrl) &&
        (!ensure.hostname ||
          !p.hostname ||
          p.hostname.replace(/\.local$/i, '').toLowerCase() ===
            ensure.hostname.replace(/\.local$/i, '').toLowerCase()),
    );
    if (hostnameMatch) {
      return hostnameMatch;
    }
    return state.profiles.find((p) => isLoopbackGatewayUrl(p.gatewayUrl));
  }

  return undefined;
}
