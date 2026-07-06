import {
  canUseDeveloperLeashBackdoor,
  isDevLeashUnlockDeepLink,
  LEASH_TITLE_DEV_UNLOCK_LONG_PRESS_MS,
  withDeveloperLeashUnlocked,
} from '../utils/developerLeashUnlock';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

jest.mock('../utils/demoModePolicy', () => {
  const actual = jest.requireActual('../utils/demoModePolicy');
  return {
    ...actual,
    isDeveloperLeashUnlockAllowed: jest.fn(() => true),
  };
});

const { isDeveloperLeashUnlockAllowed } = jest.requireMock('../utils/demoModePolicy');

describe('developerLeashUnlock', () => {
  beforeEach(() => {
    isDeveloperLeashUnlockAllowed.mockReturnValue(true);
  });

  it('recognizes dev unlock deep links', () => {
    expect(isDevLeashUnlockDeepLink('hermes://dev/leash-unlock')).toBe(true);
    expect(isDevLeashUnlockDeepLink('hermes://dev-leash-unlock')).toBe(true);
    expect(isDevLeashUnlockDeepLink('hermes://chat')).toBe(false);
  });

  it('persists developer unlock flag in settings', () => {
    expect(withDeveloperLeashUnlocked(DEFAULT_GATEWAY_SETTINGS).developerLeashUnlock).toBe(true);
  });

  it('uses an 8 second title long-press for developer unlock', () => {
    expect(LEASH_TITLE_DEV_UNLOCK_LONG_PRESS_MS).toBe(8000);
  });

  it('canUseDeveloperLeashBackdoor mirrors demoModePolicy', () => {
    isDeveloperLeashUnlockAllowed.mockReturnValue(false);
    expect(canUseDeveloperLeashBackdoor()).toBe(false);
    isDeveloperLeashUnlockAllowed.mockReturnValue(true);
    expect(canUseDeveloperLeashBackdoor()).toBe(true);
  });
});
