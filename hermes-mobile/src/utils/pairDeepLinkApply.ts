import type { SetupDeepLinkParams } from './setupDeepLink';
import { isValidGatewayUrl } from './gatewayUrlPolicy';
import { CONNECTION_SELF_HEAL_INTERVAL_MS } from './connectionSelfHeal';
import {
  CONNECTION_HEAL_EXHAUSTED_AFTER,
  CONNECTION_HEAL_DURATION_MS,
} from './connectionErrorPolicy';

export const FOREGROUND_USB_HEAL_DURATION_MS = CONNECTION_HEAL_DURATION_MS;

/** Keep in sync with foreground silent heal budget (6 × 5s). */
export const FOREGROUND_USB_HEAL_ATTEMPTS = CONNECTION_HEAL_EXHAUSTED_AFTER;

/** Document interval used by the foreground heal loop. */
export const FOREGROUND_USB_HEAL_INTERVAL_MS = CONNECTION_SELF_HEAL_INTERVAL_MS;

export type PairDeepLinkApplyInput = {
  params: SetupDeepLinkParams;
  relayPairAttempted: boolean;
  relayPairSucceeded: boolean;
};

export type PairDeepLinkApplyDecision = {
  shouldPersistProfiles: boolean;
  shouldPersistSettings: boolean;
  connectionMode: 'gateway' | 'relay';
  userError?: string;
};

export function evaluatePairDeepLinkApply(input: PairDeepLinkApplyInput): PairDeepLinkApplyDecision {
  const { params, relayPairAttempted, relayPairSucceeded } = input;
  const gatewayUrl = params.gatewayUrl?.trim() ?? '';
  const hasValidUrl = Boolean(gatewayUrl && isValidGatewayUrl(gatewayUrl));
  const hasApiKey = Boolean(params.apiKey?.trim());
  const secretlessAttempted = Boolean(params.pairingCode?.trim() && params.pairServerUrl?.trim());

  if (secretlessAttempted && !hasValidUrl && !hasApiKey) {
    return {
      shouldPersistProfiles: false,
      shouldPersistSettings: false,
      connectionMode: 'gateway',
      userError:
        'Pairing code expired or invalid — your saved computers were kept. Try pairing again from your computer.',
    };
  }

  if (relayPairAttempted && !relayPairSucceeded && !hasValidUrl) {
    return {
      shouldPersistProfiles: false,
      shouldPersistSettings: false,
      connectionMode: 'gateway',
    };
  }

  const hasTailnetOrExtra =
    (params.tailnetProbeHosts?.length ?? 0) > 0 ||
    (params.extraComputers?.length ?? 0) > 0;

  if (!hasValidUrl) {
    if (hasTailnetOrExtra) {
      return {
        shouldPersistProfiles: (params.extraComputers?.length ?? 0) > 0,
        shouldPersistSettings: false,
        connectionMode: 'gateway',
      };
    }
    return {
      shouldPersistProfiles: false,
      shouldPersistSettings: false,
      connectionMode: 'gateway',
    };
  }

  if (relayPairAttempted && !relayPairSucceeded) {
    return {
      shouldPersistProfiles: true,
      shouldPersistSettings: true,
      connectionMode: 'gateway',
    };
  }

  return {
    shouldPersistProfiles: true,
    shouldPersistSettings: true,
    connectionMode: relayPairSucceeded ? 'relay' : 'gateway',
  };
}

export function shouldRunForegroundUsbHeal(input: {
  platform: string;
  demoMode: boolean;
  healthOk: boolean;
}): boolean {
  return input.platform !== 'web' && !input.demoMode && !input.healthOk;
}
