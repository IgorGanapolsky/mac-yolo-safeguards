import { isDevLeashUnlockDeepLink, withDeveloperLeashUnlocked } from '../utils/developerLeashUnlock';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

describe('developerLeashUnlock', () => {
  it('recognizes dev unlock deep links', () => {
    expect(isDevLeashUnlockDeepLink('hermes://dev/leash-unlock')).toBe(true);
    expect(isDevLeashUnlockDeepLink('hermes://dev-leash-unlock')).toBe(true);
    expect(isDevLeashUnlockDeepLink('hermes://chat')).toBe(false);
  });

  it('persists developer unlock flag in settings', () => {
    expect(withDeveloperLeashUnlocked(DEFAULT_GATEWAY_SETTINGS).developerLeashUnlock).toBe(true);
  });
});
