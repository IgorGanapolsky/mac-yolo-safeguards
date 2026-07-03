import * as StoreReview from 'expo-store-review';
import { storage } from './storage';

export const STORE_REVIEW_THRESHOLD = 3;

/**
 * Requests an App Store / Google Play review if the user has approved
 * at least the threshold number of actions and hasn't been prompted yet.
 */
export async function requestStoreReviewIfThresholdReached(): Promise<boolean> {
  try {
    const hasRequested = await storage.hasRequestedReview();
    if (hasRequested) {
      return false;
    }

    const count = await storage.loadApprovalsCount();
    if (count >= STORE_REVIEW_THRESHOLD) {
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
        await storage.setRequestedReview(true);
        return true;
      }
    }
  } catch (error) {
    console.error('[hermes-mobile] requestStoreReviewIfThresholdReached failed:', error);
  }
  return false;
}
