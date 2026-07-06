import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  isLeashProEnabled,
  persistLeashProEntitlement,
  readLeashProEntitlementFromStorage,
  withLeashProDisabled,
  withLeashProEnabled,
} from '../utils/leashPro';

jest.mock('../services/storage', () => ({
  storage: {
    loadGatewaySettings: jest.fn(),
    saveGatewaySettings: jest.fn(),
  },
}));

const { storage } = jest.requireMock('../services/storage');

describe('leashPro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.loadGatewaySettings.mockResolvedValue({ ...DEFAULT_GATEWAY_SETTINGS });
    storage.saveGatewaySettings.mockResolvedValue(undefined);
  });

  it('is disabled by default', () => {
    expect(isLeashProEnabled(DEFAULT_GATEWAY_SETTINGS)).toBe(false);
  });

  it('enables when store entitlement is active', () => {
    expect(
      isLeashProEnabled({ ...DEFAULT_GATEWAY_SETTINGS, thumbgateProActive: true }),
    ).toBe(true);
  });

  it('enables with developer backdoor', () => {
    expect(
      isLeashProEnabled({ ...DEFAULT_GATEWAY_SETTINGS, developerLeashUnlock: true }),
    ).toBe(true);
  });

  it('withLeashProEnabled sets thumbgateProActive', () => {
    expect(withLeashProEnabled(DEFAULT_GATEWAY_SETTINGS).thumbgateProActive).toBe(true);
  });

  it('withLeashProDisabled clears store and dev unlock flags', () => {
    expect(
      withLeashProDisabled({
        ...DEFAULT_GATEWAY_SETTINGS,
        thumbgateProActive: true,
        developerLeashUnlock: true,
      }),
    ).toEqual(
      expect.objectContaining({ thumbgateProActive: false, developerLeashUnlock: false }),
    );
  });

  it('reads entitlement from AsyncStorage-backed gateway settings', async () => {
    storage.loadGatewaySettings.mockResolvedValue({
      ...DEFAULT_GATEWAY_SETTINGS,
      thumbgateProActive: true,
    });
    await expect(readLeashProEntitlementFromStorage()).resolves.toBe(true);
  });

  it('persists enabled entitlement to AsyncStorage', async () => {
    const next = await persistLeashProEntitlement(true);
    expect(next.thumbgateProActive).toBe(true);
    expect(storage.saveGatewaySettings).toHaveBeenCalledWith(
      expect.objectContaining({ thumbgateProActive: true }),
    );
  });

  it('persists disabled entitlement to AsyncStorage', async () => {
    storage.loadGatewaySettings.mockResolvedValue({
      ...DEFAULT_GATEWAY_SETTINGS,
      thumbgateProActive: true,
      developerLeashUnlock: true,
    });
    const next = await persistLeashProEntitlement(false);
    expect(next.thumbgateProActive).toBe(false);
    expect(next.developerLeashUnlock).toBe(false);
    expect(storage.saveGatewaySettings).toHaveBeenCalledWith(next);
  });
});
