import { storage } from './storage';

export const STORE_REVIEW_THRESHOLD = 3;

type StoreReviewModule = typeof import('expo-store-review');

function loadStoreReview(): StoreReviewModule | null {
  try {
    // Optional native module: some dev-client/simulator builds do not include it.
    // Load lazily so a missing module cannot red-screen the whole app at startup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-store-review') as StoreReviewModule;
  } catch {
    return null;
  }
}

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
      const StoreReview = loadStoreReview();
      if (!StoreReview) {
        return false;
      }
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
