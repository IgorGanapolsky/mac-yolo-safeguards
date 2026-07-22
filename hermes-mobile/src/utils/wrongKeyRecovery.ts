import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';

/** Fresh-user primary CTA when auth mismatches — not Settings paste. */
export const WRONG_KEY_PRIMARY_CTA = 'Re-pair this Mac';

/** Consumer-facing banner — never say "API key". */
export const WRONG_KEY_REPAIR_HINT = 'Need to reconnect — tap to refresh';

export type WrongKeyRecoveryPlan = {
  clearStaleProfileKey: boolean;
  clearActiveProfile: boolean;
  /** Stop silent "Trying to reach…" heal — surface Re-pair CTA immediately. */
  stopSilentHeal: boolean;
  /**
   * Host is reachable (discovery/`/health`) but chat auth failed —
   * fetch a fresh credential from the Mac pair server before giving up.
   */
  attemptPairServerRefresh: boolean;
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
    lower.includes('wrong key') ||
    lower.includes('outdated connection')
  );
}

/**
 * Real-user recovery when /health is green but chat returns 401 (stale /
 * mismatched Mac credential). Clear poisoned key, try pair-server refresh,
 * and surface Re-pair this Mac — never leave a Settings-paste dead end.
 */
export function planWrongKeyRecovery(input: {
  authMismatch?: boolean;
  errorMessage?: string | null;
  hasSavedProfile?: boolean;
  status?: number | null;
  /** Host answered /health or was discovered — safe to hit :8765 pair.json. */
  hostReachable?: boolean;
}): WrongKeyRecoveryPlan {
  // Greptile P1 (#449): 403 Forbidden ≠ wrong key. Only 401 / explicit wrong-key
  // signals clear a stored credential. Bare 403 can be RBAC/rate-limit and must
  // not wipe a working real-user pairing.
  const mismatch =
    input.authMismatch === true ||
    input.status === 401 ||
    messageLooksLikeWrongKey(input.errorMessage);
  if (!mismatch) {
    return {
      clearStaleProfileKey: false,
      clearActiveProfile: false,
      stopSilentHeal: false,
      attemptPairServerRefresh: false,
      primaryCta: WRONG_KEY_PRIMARY_CTA,
      banner: '',
      reason: 'none',
    };
  }
  return {
    clearStaleProfileKey: true,
    clearActiveProfile: Boolean(input.hasSavedProfile),
    stopSilentHeal: true,
    attemptPairServerRefresh: input.hostReachable !== false,
    primaryCta: WRONG_KEY_PRIMARY_CTA,
    banner: WRONG_KEY_REPAIR_HINT,
    reason: 'auth_mismatch',
  };
}

export function isWrongKeyFailure(detail?: string | null): boolean {
  return messageLooksLikeWrongKey(detail);
}
