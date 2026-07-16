import { useCallback, useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

export type OtaBannerState = 'idle' | 'available' | 'pending' | 'reloading';

export interface OtaBannerResult {
  state: OtaBannerState;
  message: string;
  dismiss: () => void;
  applyNow: () => Promise<void>;
}

/**
 * Encapsulates OTA update detection + banner state.
 * Returns `idle` in dev builds (Updates.isEnabled === false).
 */
export function useOtaUpdateBanner(): OtaBannerResult {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // Manual fallback check on mount (covers cases where ON_LOAD event missed)
  useEffect(() => {
    if (!Updates.isEnabled) return;
    Updates.checkForUpdateAsync().catch(() => {});
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  const applyNow = useCallback(async () => {
    setIsReloading(true);
    try {
      if (!isUpdatePending) {
        await Updates.fetchUpdateAsync();
      }
      await Updates.reloadAsync();
    } catch {
      setIsReloading(false);
    }
  }, [isUpdatePending]);

  if (!Updates.isEnabled || dismissed) {
    return { state: 'idle', message: '', dismiss, applyNow };
  }

  if (isReloading) {
    return {
      state: 'reloading',
      message: 'Applying update…',
      dismiss,
      applyNow,
    };
  }

  if (isUpdatePending) {
    return {
      state: 'pending',
      message: 'A new version of Hermes is downloaded and ready.',
      dismiss,
      applyNow,
    };
  }

  if (isUpdateAvailable) {
    return {
      state: 'available',
      message: 'A new version of Hermes is available.',
      dismiss,
      applyNow,
    };
  }

  return { state: 'idle', message: '', dismiss, applyNow };
}
