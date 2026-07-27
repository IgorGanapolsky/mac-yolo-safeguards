import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  formatLeashFreeAllowanceLabel,
  hasThumbgateLeashPro,
  isLeashFreeAllowanceExhausted,
  isThumbgateLeashUnlocked,
  syncLeashEntitlementSnapshot,
  isProEntitledFromSnapshot,
} from '../utils/thumbgateLeash';

describe('thumbgateLeash paid-app contract', () => {
  beforeEach(() => {
    syncLeashEntitlementSnapshot(DEFAULT_GATEWAY_SETTINGS);
  });

  it('includes Leash regardless of retired entitlement flags', () => {
    expect(
      hasThumbgateLeashPro({
        ...DEFAULT_GATEWAY_SETTINGS,
        thumbgateProActive: false,
        developerLeashUnlock: false,
      }),
    ).toBe(true);
    expect(isThumbgateLeashUnlocked(DEFAULT_GATEWAY_SETTINGS)).toBe(true);
    expect(isProEntitledFromSnapshot()).toBe(true);
  });

  it('never meters approvals in the paid app', () => {
    expect(formatLeashFreeAllowanceLabel(DEFAULT_GATEWAY_SETTINGS)).toBe(
      'Leash included — unlimited approvals',
    );
    expect(isLeashFreeAllowanceExhausted(DEFAULT_GATEWAY_SETTINGS)).toBe(false);
  });
});
