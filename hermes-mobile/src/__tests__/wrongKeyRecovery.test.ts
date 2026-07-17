import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';
import {
  WRONG_KEY_PRIMARY_CTA,
  WRONG_KEY_REPAIR_HINT,
  isWrongKeyFailure,
  planWrongKeyRecovery,
} from '../utils/wrongKeyRecovery';

describe('wrongKeyRecovery', () => {
  it('plans clear + Re-pair this Mac on authMismatch', () => {
    const plan = planWrongKeyRecovery({
      authMismatch: true,
      hasSavedProfile: true,
      hostReachable: true,
    });
    expect(plan.reason).toBe('auth_mismatch');
    expect(plan.clearStaleProfileKey).toBe(true);
    expect(plan.clearActiveProfile).toBe(true);
    expect(plan.stopSilentHeal).toBe(true);
    expect(plan.attemptPairServerRefresh).toBe(true);
    expect(plan.primaryCta).toBe(WRONG_KEY_PRIMARY_CTA);
    expect(plan.primaryCta).toBe('Re-pair this Mac');
    expect(plan.banner).toBe(WRONG_KEY_REPAIR_HINT);
    expect(plan.banner.toLowerCase()).toContain('outdated connection');
    expect(plan.banner.toLowerCase()).not.toContain('api key');
    expect(plan.banner.toLowerCase()).not.toContain('settings');
  });

  it('detects invalid_api_key gateway code in error strings', () => {
    expect(
      planWrongKeyRecovery({
        errorMessage: JSON.stringify({ error: { code: 'invalid_api_key' } }),
        hasSavedProfile: true,
      }).reason,
    ).toBe('auth_mismatch');
    expect(isWrongKeyFailure('invalid_api_key')).toBe(true);
    expect(isWrongKeyFailure('Invalid API key')).toBe(true);
  });

  it('treats HTTP 401 as auth mismatch; bare 403 does not wipe key (Greptile P1)', () => {
    expect(planWrongKeyRecovery({ status: 401 }).stopSilentHeal).toBe(true);
    expect(planWrongKeyRecovery({ status: 401 }).clearStaleProfileKey).toBe(true);
    // 403 alone must not clear a valid key (permission/rate-limit)
    expect(planWrongKeyRecovery({ status: 403 }).reason).toBe('none');
    expect(planWrongKeyRecovery({ status: 403 }).clearStaleProfileKey).toBe(false);
    // Explicit wrong-key copy still wins even if status is 403
    expect(
      planWrongKeyRecovery({ status: 403, errorMessage: 'invalid_api_key' }).clearStaleProfileKey,
    ).toBe(true);
  });

  it('detects legacy Wrong key and new outdated-connection copy', () => {
    expect(isWrongKeyFailure(GATEWAY_WRONG_KEY_MESSAGE)).toBe(true);
    expect(isWrongKeyFailure(`⚠ ${GATEWAY_WRONG_KEY_MESSAGE}`)).toBe(true);
    expect(isWrongKeyFailure('Wrong key for this computer')).toBe(true);
    expect(isWrongKeyFailure('Outdated connection — tap to reconnect')).toBe(true);
    expect(isWrongKeyFailure('Network timeout')).toBe(false);
  });

  it('skips pair-server refresh when host is known unreachable', () => {
    const plan = planWrongKeyRecovery({
      authMismatch: true,
      hostReachable: false,
    });
    expect(plan.attemptPairServerRefresh).toBe(false);
    expect(plan.stopSilentHeal).toBe(true);
  });

  it('is a no-op when auth is fine', () => {
    const plan = planWrongKeyRecovery({ authMismatch: false });
    expect(plan.reason).toBe('none');
    expect(plan.clearStaleProfileKey).toBe(false);
    expect(plan.clearActiveProfile).toBe(false);
    expect(plan.stopSilentHeal).toBe(false);
    expect(plan.attemptPairServerRefresh).toBe(false);
  });
});
