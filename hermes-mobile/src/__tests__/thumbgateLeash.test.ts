import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  __resetFreeLeashAllowanceForTests,
  consumeFreeLeashApproval,
  refreshFreeLeashWeeklyState,
} from '../utils/freeLeashAllowance';
import { FREE_LEASH_APPROVALS_PER_WEEK } from '../constants/monetization';
import {
  formatLeashFreeAllowanceLabel,
  hasThumbgateLeashPro,
  isThumbgateLeashUnlocked,
  syncLeashEntitlementSnapshot,
} from '../utils/thumbgateLeash';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockIsStorePaidDownloadEntitled = jest.fn(() => false);

jest.mock('../utils/playPaidEntitlement', () => ({
  isStorePaidDownloadEntitled: () => mockIsStorePaidDownloadEntitled(),
}));

describe('thumbgateLeash', () => {
  beforeEach(() => {
    __resetFreeLeashAllowanceForTests();
    mockIsStorePaidDownloadEntitled.mockReturnValue(false);
    syncLeashEntitlementSnapshot(DEFAULT_GATEWAY_SETTINGS);
  });

  it('unlocks Leash for Pro, dev backdoor, or free allowance remaining', () => {
    expect(isThumbgateLeashUnlocked(DEFAULT_GATEWAY_SETTINGS)).toBe(true);
    expect(
      isThumbgateLeashUnlocked({ ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true }),
    ).toBe(true);
    expect(
      isThumbgateLeashUnlocked({ ...DEFAULT_GATEWAY_SETTINGS, developerLeashUnlock: true }),
    ).toBe(true);
  });

  it('locks Leash when the weekly free allowance is exhausted', async () => {
    await refreshFreeLeashWeeklyState();
    for (let i = 0; i < FREE_LEASH_APPROVALS_PER_WEEK; i += 1) {
      await consumeFreeLeashApproval();
    }
    expect(isThumbgateLeashUnlocked(DEFAULT_GATEWAY_SETTINGS)).toBe(false);
  });

  it('formats the honest free-tier label', () => {
    expect(formatLeashFreeAllowanceLabel(DEFAULT_GATEWAY_SETTINGS)).toMatch(
      /10 of 10 free approvals left this week/,
    );
    expect(
      formatLeashFreeAllowanceLabel({ ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true }),
    ).toBe('Leash Pro — unlimited approvals');
  });

  it('detects paid entitlement separately from free allowance', () => {
    expect(hasThumbgateLeashPro(DEFAULT_GATEWAY_SETTINGS)).toBe(false);
    expect(
      hasThumbgateLeashPro({ ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true }),
    ).toBe(true);
  });

  it('unlocks Pro when the Android paid-download store SKU is installed', () => {
    mockIsStorePaidDownloadEntitled.mockReturnValue(true);
    expect(hasThumbgateLeashPro(DEFAULT_GATEWAY_SETTINGS)).toBe(true);
    expect(isThumbgateLeashUnlocked(DEFAULT_GATEWAY_SETTINGS)).toBe(true);
  });
});
