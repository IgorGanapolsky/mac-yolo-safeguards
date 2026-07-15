import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';

/** Fresh-user primary CTA when auth mismatches — not "open Settings". */
export const WRONG_KEY_PRIMARY_CTA = 'Find computers';

export const WRONG_KEY_REPAIR_HINT =
  'Wrong key for this computer. Tap Find computers to re-pair with the matching Mac.';

export type WrongKeyRecoveryPlan = {
  clearStaleProfileKey: boolean;
  clearActiveProfile: boolean;
  /** Stop silent "Trying to reach…" heal — surface Find computers immediately. */
  stopSilentHeal: boolean;
  primaryCta: typeof WRONG_KEY_PRIMARY_CTA;
  banner: string;
  reason: 'auth_mismatch' | 'none';
};

function messageLooksLikeWrongKey(detail?: string | null): boolean {
  if (!detail) {
    return false;
  }
  const lower = detail.toLowerCase();
  return (
    detail.includes(GATEWAY_WRONG_KEY_MESSAGE) ||
    lower.includes('invalid_api_key') ||
    lower.includes('invalid api key') ||
    lower.includes('wrong key')
  );
}

/**
 * Real-user recovery when /health is green but chat returns 401 (Wrong key /
 * invalid_api_key). Agents/dogfood: clear poisoned key + push Find computers —
 * never leave Settings-only dead end or infinite silent heal.
 */
export function planWrongKeyRecovery(input: {
  authMismatch?: boolean;
  errorMessage?: string | null;
  hasSavedProfile?: boolean;
  status?: number | null;
}): WrongKeyRecoveryPlan {
  const mismatch =
    input.authMismatch === true ||
    input.status === 401 ||
    input.status === 403 ||
    messageLooksLikeWrongKey(input.errorMessage);
  if (!mismatch) {
    return {
      clearStaleProfileKey: false,
      clearActiveProfile: false,
      stopSilentHeal: false,
      primaryCta: WRONG_KEY_PRIMARY_CTA,
      banner: '',
      reason: 'none',
    };
  }
  return {
    clearStaleProfileKey: true,
    clearActiveProfile: Boolean(input.hasSavedProfile),
    stopSilentHeal: true,
    primaryCta: WRONG_KEY_PRIMARY_CTA,
    banner: WRONG_KEY_REPAIR_HINT,
    reason: 'auth_mismatch',
  };
}

export function isWrongKeyFailure(detail?: string | null): boolean {
  return messageLooksLikeWrongKey(detail);
}
