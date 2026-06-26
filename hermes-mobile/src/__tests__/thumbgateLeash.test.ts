import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import { isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';

describe('thumbgateLeash', () => {
  it('is locked until Pro or explicit developer backdoor', () => {
    expect(isThumbgateLeashUnlocked(DEFAULT_GATEWAY_SETTINGS)).toBe(false);
    expect(
      isThumbgateLeashUnlocked({ ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true }),
    ).toBe(true);
    expect(
      isThumbgateLeashUnlocked({ ...DEFAULT_GATEWAY_SETTINGS, developerLeashUnlock: true }),
    ).toBe(true);
    expect(
      isThumbgateLeashUnlocked({
        ...DEFAULT_GATEWAY_SETTINGS,
        gatewayUrl: 'http://10.2.29.103:8642',
      }),
    ).toBe(false);
  });
});
