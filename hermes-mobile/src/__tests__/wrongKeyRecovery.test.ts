import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';
import {
  WRONG_KEY_PRIMARY_CTA,
  WRONG_KEY_REPAIR_HINT,
  isWrongKeyFailure,
  planWrongKeyRecovery,
} from '../utils/wrongKeyRecovery';

describe('wrongKeyRecovery', () => {
  it('plans clear + Find computers on authMismatch', () => {
    const plan = planWrongKeyRecovery({
      authMismatch: true,
      hasSavedProfile: true,
    });
    expect(plan.reason).toBe('auth_mismatch');
    expect(plan.clearStaleProfileKey).toBe(true);
    expect(plan.clearActiveProfile).toBe(true);
    expect(plan.primaryCta).toBe(WRONG_KEY_PRIMARY_CTA);
    expect(plan.primaryCta).toBe('Find computers');
    expect(plan.banner).toBe(WRONG_KEY_REPAIR_HINT);
    expect(plan.banner.toLowerCase()).not.toContain('settings');
  });

  it('detects wrong-key copy in error strings', () => {
    expect(isWrongKeyFailure(GATEWAY_WRONG_KEY_MESSAGE)).toBe(true);
    expect(isWrongKeyFailure(`⚠ ${GATEWAY_WRONG_KEY_MESSAGE}`)).toBe(true);
    expect(isWrongKeyFailure('Network timeout')).toBe(false);
  });

  it('is a no-op when auth is fine', () => {
    const plan = planWrongKeyRecovery({ authMismatch: false });
    expect(plan.reason).toBe('none');
    expect(plan.clearStaleProfileKey).toBe(false);
    expect(plan.clearActiveProfile).toBe(false);
  });
});
