import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';

/** Fresh-user primary CTA when auth mismatches — not "open Settings". */
export const WRONG_KEY_PRIMARY_CTA = 'Find computers';

export const WRONG_KEY_REPAIR_HINT =
  'Wrong key for this computer. Tap Find computers to re-pair with the matching Mac.';

export type WrongKeyRecoveryPlan = {
  clearStaleProfileKey: boolean;
  clearActiveProfile: boolean;
  primaryCta: typeof WRONG_KEY_PRIMARY_CTA;
  banner: string;
  reason: 'auth_mismatch' | 'none';
};

/**
 * Real-user recovery when /health is green but chat returns 401 (Wrong key).
 * Agents/dogfood: clear poisoned key + push Find computers — never leave Settings-only dead end.
 */
export function planWrongKeyRecovery(input: {
  authMismatch?: boolean;
  errorMessage?: string | null;
  hasSavedProfile?: boolean;
}): WrongKeyRecoveryPlan {
  const mismatch =
    input.authMismatch === true ||
    (typeof input.errorMessage === 'string' &&
      input.errorMessage.includes(GATEWAY_WRONG_KEY_MESSAGE));
  if (!mismatch) {
    return {
      clearStaleProfileKey: false,
      clearActiveProfile: false,
      primaryCta: WRONG_KEY_PRIMARY_CTA,
      banner: '',
      reason: 'none',
    };
  }
  return {
    clearStaleProfileKey: true,
    clearActiveProfile: Boolean(input.hasSavedProfile),
    primaryCta: WRONG_KEY_PRIMARY_CTA,
    banner: WRONG_KEY_REPAIR_HINT,
    reason: 'auth_mismatch',
  };
}

export function isWrongKeyFailure(detail?: string | null): boolean {
  if (!detail) {
    return false;
  }
  return detail.includes(GATEWAY_WRONG_KEY_MESSAGE);
}
