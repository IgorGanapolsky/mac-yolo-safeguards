import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { shouldSuppressOtaClientPrompts } from '../utils/otaClientPromptPolicy';

export type OtaBannerState = 'idle' | 'available' | 'pending' | 'reloading';

export interface OtaBannerResult {
  state: OtaBannerState;
  message: string;
  dismiss: () => void;
  applyNow: () => Promise<void>;
}

const DISMISS_STORAGE_KEY = 'hermes.otaUpdateBanner.dismissedFingerprint';

// Fingerprint must key off the OFFERED update's id (availableUpdate /
// downloadedUpdate from useUpdates()), not `Updates.updateId` — that constant is
// the CURRENTLY RUNNING bundle's id and does not change while a newer update is
// offered. Keying off it collides a dismissal of update B with a later update C
// published while the device is still running the same embedded bundle, hiding
// the banner for updates the user never actually dismissed.
function updateFingerprint(
  isPending: boolean,
  isAvailable: boolean,
  offeredUpdateId?: string
): string {
  const updateId = offeredUpdateId && offeredUpdateId.length > 0 ? offeredUpdateId : 'none';
  return `${updateId}:${isPending ? 'pending' : isAvailable ? 'available' : 'idle'}`;
}

/**
 * Encapsulates OTA update detection + banner state.
 * Returns `idle` in dev builds (Updates.isEnabled === false) and during the
 * Expo billing freeze (never fetch/reload — prevents CDN OTA wiping local APK).
 *
 * ONE UI only: the in-app `OtaUpdateBanner`. Never also fire `Alert.alert`
 * (dual "Update available" modal + banner under the status bar).
 */
export function useOtaUpdateBanner({
  isFirstSession = false,
  isOnboardingResolved = true,
}: {
  isFirstSession?: boolean;
  isOnboardingResolved?: boolean;
} = {}): OtaBannerResult {
  const { isUpdateAvailable, isUpdatePending, availableUpdate, downloadedUpdate } =
    Updates.useUpdates();
  const offeredUpdateId = downloadedUpdate?.updateId ?? availableUpdate?.updateId;
  const [dismissed, setDismissed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const firstSessionFetchStartedRef = useRef(false);
  const firstSessionReloadStartedRef = useRef(false);
  const suppressPrompts = shouldSuppressOtaClientPrompts();

  useEffect(() => {
    if (!Updates.isEnabled || suppressPrompts) return;
    Updates.checkForUpdateAsync().catch(() => {});
  }, [suppressPrompts]);

  useEffect(() => {
    if (!Updates.isEnabled || suppressPrompts) return;
    let cancelled = false;
    const fingerprint = updateFingerprint(isUpdatePending, isUpdateAvailable, offeredUpdateId);
    if (!isUpdatePending && !isUpdateAvailable) return;

    void AsyncStorage.getItem(DISMISS_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored === fingerprint) {
          setDismissed(true);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isUpdateAvailable, isUpdatePending, offeredUpdateId, suppressPrompts]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    const fingerprint = updateFingerprint(isUpdatePending, isUpdateAvailable, offeredUpdateId);
    void AsyncStorage.setItem(DISMISS_STORAGE_KEY, fingerprint).catch(() => {});
  }, [isUpdateAvailable, isUpdatePending, offeredUpdateId]);

  const applyNow = useCallback(async () => {
    // Hard stop during billing freeze — never reloadAsync (CDN OTA wipe).
    if (shouldSuppressOtaClientPrompts()) {
      setIsReloading(false);
      return;
    }
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

  useEffect(() => {
    if (!Updates.isEnabled || !isOnboardingResolved || !isFirstSession || suppressPrompts) {
      return;
    }

    if (isUpdatePending) {
      if (!firstSessionFetchStartedRef.current && !firstSessionReloadStartedRef.current) {
        firstSessionReloadStartedRef.current = true;
        void applyNow();
      }
      return;
    }

    if (isUpdateAvailable && !firstSessionFetchStartedRef.current) {
      firstSessionFetchStartedRef.current = true;
      void applyNow();
    }
  }, [
    applyNow,
    isFirstSession,
    isOnboardingResolved,
    isUpdateAvailable,
    isUpdatePending,
    suppressPrompts,
  ]);

  // Freeze / dismiss / first-session: never surface "Applying update…"
  if (
    !Updates.isEnabled ||
    !isOnboardingResolved ||
    isFirstSession ||
    dismissed ||
    suppressPrompts
  ) {
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
