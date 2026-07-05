import * as StoreReview from 'expo-store-review';
import { storage } from '../services/storage';
import {
  requestStoreReviewIfThresholdReached,
  STORE_REVIEW_THRESHOLD,
} from '../services/storeReview';

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  storage: {
    hasRequestedReview: jest.fn(),
    setRequestedReview: jest.fn(),
    loadApprovalsCount: jest.fn(),
  },
}));

describe('storeReview service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not request review if already requested', async () => {
    (storage.hasRequestedReview as jest.Mock).mockResolvedValue(true);
    
    const result = await requestStoreReviewIfThresholdReached();
    
    expect(result).toBe(false);
    expect(storage.hasRequestedReview).toHaveBeenCalledTimes(1);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it('should not request review if approvals count is below threshold', async () => {
    (storage.hasRequestedReview as jest.Mock).mockResolvedValue(false);
    (storage.loadApprovalsCount as jest.Mock).mockResolvedValue(STORE_REVIEW_THRESHOLD - 1);
    (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true);

    const result = await requestStoreReviewIfThresholdReached();

    expect(result).toBe(false);
    expect(storage.loadApprovalsCount).toHaveBeenCalledTimes(1);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it('should request review if threshold reached and available, then set requested flag', async () => {
    (storage.hasRequestedReview as jest.Mock).mockResolvedValue(false);
    (storage.loadApprovalsCount as jest.Mock).mockResolvedValue(STORE_REVIEW_THRESHOLD);
    (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true);

    const result = await requestStoreReviewIfThresholdReached();

    expect(result).toBe(true);
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    expect(storage.setRequestedReview).toHaveBeenCalledWith(true);
  });

  it('should not request review if StoreReview is not available', async () => {
    (storage.hasRequestedReview as jest.Mock).mockResolvedValue(false);
    (storage.loadApprovalsCount as jest.Mock).mockResolvedValue(STORE_REVIEW_THRESHOLD);
    (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    const result = await requestStoreReviewIfThresholdReached();

    expect(result).toBe(false);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect(storage.setRequestedReview).not.toHaveBeenCalled();
  });

  it('should fail closed if the native StoreReview module is missing', async () => {
    jest.resetModules();
    jest.doMock('expo-store-review', () => {
      throw new Error("Cannot find native module 'ExpoStoreReview'");
    });
    jest.doMock('../services/storage', () => ({
      storage: {
        hasRequestedReview: jest.fn().mockResolvedValue(false),
        loadApprovalsCount: jest.fn().mockResolvedValue(STORE_REVIEW_THRESHOLD),
        setRequestedReview: jest.fn(),
      },
    }));

    const service = require('../services/storeReview') as typeof import('../services/storeReview');
    await expect(service.requestStoreReviewIfThresholdReached()).resolves.toBe(false);
  });
});
