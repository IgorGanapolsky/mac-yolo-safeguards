import type { GatewayProfileState } from '../types/gatewayProfile';
import {
  activeProfile,
  findProfileForGatewayUrl,
  profilesShareMachine,
  selectProfile,
} from '../services/gatewayProfiles';

/**
 * After a setup deep link upserts the primary computer + optional extras, force the
 * paired primary to remain active. Extras are catalog-only and must never leave the
 * previous sticky Mac (e.g. mini Tailscale) selected when the user just paired MacBook USB.
 */
export function stickActiveProfileToSetupPrimary(
  state: GatewayProfileState,
  primaryGatewayUrl: string,
  macName?: string | null,
): GatewayProfileState {
  const primaryUrl = primaryGatewayUrl.trim();
  if (!primaryUrl) {
    return state;
  }

  const matched = findProfileForGatewayUrl(state.profiles, primaryUrl);
  if (matched) {
    if (state.activeProfileId === matched.id) {
      return state;
    }
    return selectProfile(state, matched.id);
  }

  const name = macName?.trim();
  if (name) {
    const needle = name.replace(/\.local$/i, '').toLowerCase();
    const byName = state.profiles.find((profile) => {
      const label = (profile.label || '').toLowerCase();
      const host = (profile.hostname || '').toLowerCase();
      return label.includes(needle) || host.includes(needle);
    });
    if (byName) {
      return selectProfile(state, byName.id);
    }
  }

  return state;
}

/** True when active profile still matches the setup primary URL or same-machine identity. */
export function setupPrimaryStillActive(
  state: GatewayProfileState,
  primaryGatewayUrl: string,
): boolean {
  const active = activeProfile(state);
  if (!active) {
    return false;
  }
  const primaryUrl = primaryGatewayUrl.trim();
  if (!primaryUrl) {
    return false;
  }
  const matched = findProfileForGatewayUrl(state.profiles, primaryUrl);
  if (!matched) {
    return false;
  }
  return matched.id === active.id || profilesShareMachine(active, matched);
}
