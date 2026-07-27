/** Saved Hermes gateway on a Mac (Mac Pro, Mac Mini, etc.). */

import type { SetupDeepLinkParams } from '../utils/setupDeepLink';

export interface GatewayProfile {
  id: string;
  label: string;
  gatewayUrl: string;
  hostname?: string;
  localIp?: string;
  lastConnectedAt?: string;
  addedAt: string;
}

export interface GatewayProfileState {
  profiles: GatewayProfile[];
  activeProfileId: string | null;
}

export const EMPTY_GATEWAY_PROFILE_STATE: GatewayProfileState = {
  profiles: [],
  activeProfileId: null,
};

export type DiscoveredGateway = {
  gatewayUrl: string;
  hostname?: string;
  localIp?: string;
  label?: string;
  /**
   * Ephemeral pairing material returned by pair.json. Discovery keeps this in
   * memory only; upsertDiscoveredProfile deliberately does not persist it.
   */
  pairingSetup?: SetupDeepLinkParams;
};
