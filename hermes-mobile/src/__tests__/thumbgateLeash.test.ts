import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import { isThumbgateLeashUnlocked } from '../utils/thumbgateLeash';

describe('thumbgateLeash', () => {
  it('is locked until thumbgateProActive is set', () => {
    expect(isThumbgateLeashUnlocked(DEFAULT_GATEWAY_SETTINGS)).toBe(false);
    expect(
      isThumbgateLeashUnlocked({ ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true }),
    ).toBe(true);
  });
});
