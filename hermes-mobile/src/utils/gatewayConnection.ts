import type { GatewayHealthSnapshot } from '../types/gateway';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';

export type GatewayBootstrapPhase = 'booting' | 'searching' | 'connected' | 'needs_setup';

export function isGatewayHealthOk(health: GatewayHealthSnapshot | null | undefined): boolean {
  return health?.level === 'green' || health?.level === 'amber';
}

/** True before the first health probe completes — avoid showing "link computer" during startup. */
export function isGatewayHealthPending(health: GatewayHealthSnapshot | null | undefined): boolean {
  return !health?.checkedAt;
}

/** Phone can use Chat/Leash against the Mac gateway (demo mode always passes). */
export function isGatewayReachable(input: {
  demoMode: boolean;
  health: GatewayHealthSnapshot | null | undefined;
  gatewayUrl: string;
}): boolean {
  if (input.demoMode) {
    return true;
  }
  if (!isGatewayHealthOk(input.health)) {
    return false;
  }
  if (isLoopbackGatewayUrl(input.gatewayUrl) && input.health?.level === 'red') {
    return false;
  }
  return true;
}

export function describeBootstrapPhase(phase: GatewayBootstrapPhase): string {
  switch (phase) {
    case 'booting':
      return 'Starting Hermes Mobile…';
    case 'searching':
      return 'Checking cloud relay and nearby computers…';
    case 'connected':
      return 'Connected to your computer';
    case 'needs_setup':
      return 'Computer not found yet';
    default:
      return '';
  }
}
