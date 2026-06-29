import type { GatewayProfile } from '../types/gatewayProfile';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import { hasValidSavedComputer } from './freshUserOnboarding';
import { CONNECTION_SELF_HEAL_INTERVAL_MS } from './connectionSelfHeal';

/** Silent heal attempts before surfacing loud connection UI (~30s at 5s interval). */
export const CONNECTION_HEAL_EXHAUSTED_AFTER = 6;

/** Wall-clock budget for silent auto-heal before human onboarding copy. */
export const CONNECTION_HEAL_DURATION_MS =
  CONNECTION_SELF_HEAL_INTERVAL_MS * CONNECTION_HEAL_EXHAUSTED_AFTER;

/** Minimum ms between counting duplicate user-visible error surfaces. */
export const CONNECTION_ERROR_DEBOUNCE_MS = 12_000;

export type ConnectionHealSnapshot = {
  attempt: number;
  inFlight: boolean;
  exhausted: boolean;
};

export function connectionHealSnapshot(attempt: number, inFlight: boolean): ConnectionHealSnapshot {
  return {
    attempt,
    inFlight,
    exhausted: attempt >= CONNECTION_HEAL_EXHAUSTED_AFTER,
  };
}

export function hasAlternateHealRoutes(input: {
  gatewayUrl: string;
  profiles: GatewayProfile[];
  tailnetProbeHosts?: string[];
  tailscaleDiscoveries?: DiscoveredGateway[];
}): boolean {
  const primary = input.gatewayUrl.trim();
  for (const profile of input.profiles) {
    const url = profile.gatewayUrl.trim();
    if (url && url !== primary) {
      return true;
    }
  }
  if ((input.tailnetProbeHosts?.length ?? 0) > 0) {
    return true;
  }
  if ((input.tailscaleDiscoveries?.length ?? 0) > 0) {
    return true;
  }
  if (isPrivateLanGatewayUrl(primary)) {
    return input.profiles.some((p) => isTailscaleGatewayUrl(p.gatewayUrl));
  }
  return false;
}

export function shouldShowMacConnectionHelp(input: {
  isDemo: boolean;
  macChatLive: boolean;
  healthProbePending: boolean;
  healthLevel?: string;
  heal: ConnectionHealSnapshot;
  userSendFailed?: boolean;
  profiles?: GatewayProfile[];
}): boolean {
  if (input.isDemo || input.macChatLive || input.healthProbePending) {
    return false;
  }
  const freshUser = !hasValidSavedComputer(input.profiles ?? []);
  if (freshUser) {
    return input.healthLevel === 'red' || input.healthLevel === undefined;
  }
  if (input.healthLevel !== 'red') {
    return false;
  }
  if (input.heal.inFlight && !input.heal.exhausted) {
    return false;
  }
  if (!input.heal.exhausted && !input.userSendFailed) {
    return false;
  }
  return true;
}

export function shouldShowMacRetryBanner(input: {
  isDemo: boolean;
  macChatLive: boolean;
  healthProbePending: boolean;
  runProgressFailed?: boolean;
  heal: ConnectionHealSnapshot;
  userSendFailed?: boolean;
}): boolean {
  if (input.isDemo || input.macChatLive || input.healthProbePending) {
    return false;
  }
  if (input.runProgressFailed) {
    return false;
  }
  if (input.heal.inFlight && !input.heal.exhausted) {
    return false;
  }
  if (!input.heal.exhausted && !input.userSendFailed) {
    return false;
  }
  return true;
}

/** Hide scary connectivity run banner while silent heal still has Tailscale/LAN routes to try. */
export function shouldShowConnectivityRunBanner(input: {
  isDemo: boolean;
  connectivityFailure: boolean;
  heal: ConnectionHealSnapshot;
  hasAlternateRoutes: boolean;
}): boolean {
  if (input.isDemo || !input.connectivityFailure) {
    return true;
  }
  if (input.hasAlternateRoutes && input.heal.inFlight && !input.heal.exhausted) {
    return false;
  }
  if (!input.heal.exhausted && input.hasAlternateRoutes) {
    return false;
  }
  return true;
}

export function shouldShowPairRelayRouteStatus(input: {
  isPaired: boolean;
  wifiConnected: boolean;
  gatewayUrl: string;
  hasAlternateRoutes: boolean;
  heal: ConnectionHealSnapshot;
  macHttpOk: boolean;
}): boolean {
  if (input.isPaired || input.macHttpOk) {
    return false;
  }
  if (input.heal.inFlight && !input.heal.exhausted) {
    return false;
  }
  if (input.hasAlternateRoutes && !input.heal.exhausted) {
    return false;
  }
  if (input.wifiConnected && isPrivateLanGatewayUrl(input.gatewayUrl)) {
    return false;
  }
  if (!input.wifiConnected) {
    if (isTailscaleGatewayUrl(input.gatewayUrl)) {
      return false;
    }
    if (isPrivateLanGatewayUrl(input.gatewayUrl) && input.heal.exhausted) {
      return true;
    }
    if (!isLoopbackGatewayUrl(input.gatewayUrl) && !isPrivateLanGatewayUrl(input.gatewayUrl)) {
      return false;
    }
  }
  return input.heal.exhausted;
}

export function shouldDebounceConnectionError(
  lastShownAtMs: number | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastShownAtMs) {
    return false;
  }
  return nowMs - lastShownAtMs < CONNECTION_ERROR_DEBOUNCE_MS;
}
