import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
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

function updateFingerprint(isPending: boolean, isAvailable: boolean): string {
  const updateId =
    typeof Updates.updateId === 'string' && Updates.updateId.length > 0
      ? Updates.updateId
      : 'none';
  return `${updateId}:${isPending ? 'pending' : isAvailable ? 'available' : 'idle'}`;
}

/**
 * Encapsulates OTA update detection + banner state.
 * Returns `idle` in dev builds (Updates.isEnabled === false) and during the
 * Expo billing freeze (never fetch/reload — prevents CDN OTA wiping local APK).
 */
export function useOtaUpdateBanner({
  isFirstSession = false,
  isOnboardingResolved = true,
}: {
  isFirstSession?: boolean;
  isOnboardingResolved?: boolean;
} = {}): OtaBannerResult {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const alertShownRef = useRef(false);
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
    const fingerprint = updateFingerprint(isUpdatePending, isUpdateAvailable);
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
  }, [isUpdateAvailable, isUpdatePending, suppressPrompts]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    const fingerprint = updateFingerprint(isUpdatePending, isUpdateAvailable);
    void AsyncStorage.setItem(DISMISS_STORAGE_KEY, fingerprint).catch(() => {});
  }, [isUpdateAvailable, isUpdatePending]);

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

  useEffect(() => {
    if (
      !Updates.isEnabled ||
      !isOnboardingResolved ||
      isFirstSession ||
      dismissed ||
      suppressPrompts ||
      alertShownRef.current
    ) {
      return;
    }
    if (!isUpdatePending && !isUpdateAvailable) return;

    alertShownRef.current = true;
    const isPending = isUpdatePending;
    const message = isPending
      ? 'A new version of Hermes is downloaded and ready.'
      : 'A new version of Hermes is available.';

    Alert.alert('Update available', message, [
      { text: 'Later', style: 'cancel', onPress: dismiss },
      {
        text: isPending ? 'Restart' : 'Download & restart',
        onPress: () => {
          void applyNow();
        },
      },
    ]);
  }, [
    isUpdateAvailable,
    isUpdatePending,
    dismissed,
    dismiss,
    applyNow,
    isFirstSession,
    isOnboardingResolved,
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
