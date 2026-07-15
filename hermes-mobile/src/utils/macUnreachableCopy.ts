import type { GatewayProfile } from '../types/gatewayProfile';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import { profileMatchesDiscoveredGateway } from './gatewayProfilePicker';
import { isTailscaleGatewayUrl } from './tailscaleHosts';

/** Header / banner title when the saved computer cannot be reached. */
export function savedMacUnreachableTitle(macLabel?: string): string {
  const label = macLabel?.trim() || 'Your computer';
  if (label === 'Your computer' || label === 'computer') {
    return "Your computer isn't reachable right now";
  }
  return `${label} isn't reachable right now`;
}

/** Short status under the machine name in the header strip. */
export function savedMacUnreachableStatus(macLabel?: string): string {
  const label = macLabel?.trim() || 'Computer';
  if (label === 'Computer' || label === 'computer') {
    return 'Computer unreachable';
  }
  return `${label} unreachable`;
}

/** True while silent heal or an explicit retry is still in progress — not after heal budget is spent. */
export function shouldShowActiveReconnectingCopy(input: {
  macRetryBusy: boolean;
  healInFlight: boolean;
  healExhausted: boolean;
  /** Never-connected / fresh install must not say "Reconnecting…". */
  hasPriorSuccessfulConnection?: boolean;
}): boolean {
  // Brand-new users never "reconnect" — reserve that word for returning Macs.
  if (input.hasPriorSuccessfulConnection === false) {
    return false;
  }
  if (input.macRetryBusy) {
    return true;
  }
  if (input.healExhausted) {
    return false;
  }
  return input.healInFlight;
}

/** First-connect copy while looking for a Mac the user has never reached before. */
export function connectingToMacCopy(macLabel?: string): string {
  const label = macLabel?.trim() || 'your computer';
  if (
    label === 'your computer' ||
    label === 'Computer' ||
    label === 'computer' ||
    label === 'Computer via USB'
  ) {
    return 'Looking for your Mac…';
  }
  return `Connecting to ${label}…`;
}

export function reconnectingToMacCopy(macLabel?: string): string {
  const label = macLabel?.trim() || 'your computer';
  return label === 'your computer' || label === 'Computer' || label === 'computer'
    ? 'Reconnecting to your computer…'
    : `Reconnecting to ${label}…`;
}

/** Saved computers the user can switch to when the active profile is down. */
export function alternateSwitchComputerProfiles(
  profiles: GatewayProfile[],
  activeProfileId?: string | null,
): GatewayProfile[] {
  const activeId = activeProfileId?.trim();
  if (!activeId) {
    return profiles;
  }
  return profiles.filter((profile) => profile.id !== activeId);
}

/** Tailnet discoveries for other machines when the active saved Mac is unreachable. */
export function alternateTailscaleDiscoveries(input: {
  profiles: GatewayProfile[];
  activeProfile?: GatewayProfile | null;
  discoveries: DiscoveredGateway[];
}): DiscoveredGateway[] {
  const active = input.activeProfile;
  if (!active) {
    return input.discoveries;
  }
  return input.discoveries.filter((discovery) => {
    if (profileMatchesDiscoveredGateway(active, discovery)) {
      return false;
    }
    return !input.profiles.some(
      (profile) =>
        profile.id === active.id && profileMatchesDiscoveredGateway(profile, discovery),
    );
  });
}

export function shouldOfferSwitchComputer(input: {
  healExhausted: boolean;
  activeProfileReachable: boolean;
  profiles: GatewayProfile[];
  activeProfileId?: string | null;
  tailscaleDiscoveries?: DiscoveredGateway[];
}): boolean {
  if (!input.healExhausted || input.activeProfileReachable) {
    return false;
  }
  const alternates = alternateSwitchComputerProfiles(input.profiles, input.activeProfileId);
  if (alternates.length > 0) {
    return true;
  }
  return (input.tailscaleDiscoveries?.length ?? 0) > 0;
}

export function switchComputerHintBody(input: {
  macLabel?: string;
  alternateProfileCount: number;
  tailscaleDiscoveryCount: number;
}): string {
  const label = input.macLabel?.trim() || 'Your computer';
  const parts: string[] = [];
  if (label !== 'Your computer' && label !== 'computer') {
    parts.push(`${label} is off or not on Tailscale.`);
  } else {
    parts.push('Your saved computer is off or not on Tailscale.');
  }
  if (input.tailscaleDiscoveryCount > 0) {
    parts.push('Tap Switch below to use another computer on your tailnet.');
  } else if (input.alternateProfileCount > 0) {
    parts.push('Tap Switch computer below and pick another saved Mac.');
  } else {
    parts.push('Tap Switch computer below or turn the Mac on with Tailscale running.');
  }
  return parts.join(' ');
}

export function isUnreachableTailscaleActiveProfile(
  activeProfile: GatewayProfile | null | undefined,
  activeProfileReachable: boolean,
  healExhausted: boolean,
): boolean {
  if (!activeProfile || activeProfileReachable || !healExhausted) {
    return false;
  }
  return isTailscaleGatewayUrl(activeProfile.gatewayUrl);
}

export function formatSavedMacUnreachableBanner(input: {
  macLabel?: string;
  machineEndpoint?: string;
}): string {
  const label = input.macLabel?.trim() || 'your computer';
  const endpoint = input.machineEndpoint?.trim();
  const name =
    label === 'your computer' || label === 'Computer' || label === 'computer'
      ? 'your computer'
      : label;
  if (endpoint) {
    return `Can't reach ${name} (${endpoint}) — switch computer above`;
  }
  return `Can't reach ${name} — switch computer above`;
}

/** Hide scary empty-state copy while bootstrap or silent heal is still running. */
export function shouldSuppressEmptyGreetingUnreachable(input: {
  healthProbePending: boolean;
  healInFlight: boolean;
  healExhausted: boolean;
  hasSavedComputer: boolean;
}): boolean {
  if (input.healthProbePending) {
    return true;
  }
  if (input.hasSavedComputer && input.healInFlight && !input.healExhausted) {
    return true;
  }
  return false;
}

export function emptyGreetingSubtitleDuringHeal(macLabel?: string): string {
  const route = macLabel?.trim();
  const isGeneric = route
    ? /^(mac|computer|your mac|your computer|my mac|mac via usb|computer via usb|mac via network|http|https)$/i.test(
        route,
      )
    : false;
  if (route && !isGeneric) {
    return `Trying to reach ${route} automatically…`;
  }
  return 'Trying to reach your computer automatically…';
}
