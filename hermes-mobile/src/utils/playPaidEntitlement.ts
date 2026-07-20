import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  HERMES_MOBILE_ANDROID_PACKAGE,
  HERMES_MOBILE_ANDROID_PAID_PACKAGE,
} from '../constants/appIdentity';

type ExpoExtra = {
  androidStoreSku?: 'free' | 'paid';
  androidPackage?: string;
};

function readExtra(): ExpoExtra {
  const expoConfig = Constants.expoConfig as { extra?: ExpoExtra } | null;
  return expoConfig?.extra ?? {};
}

/** True when this Android binary is the paid-download Play package. */
export function isAndroidPaidDownloadBuild(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }
  const extra = readExtra();
  if (extra.androidStoreSku === 'paid') {
    return true;
  }
  const pkg =
    extra.androidPackage ||
    (Constants.expoConfig as { android?: { package?: string } } | null)?.android?.package ||
    '';
  return pkg === HERMES_MOBILE_ANDROID_PAID_PACKAGE;
}

/** Package id for the current Android store SKU (free listing vs paid download). */
export function currentAndroidStorePackage(): string {
  if (isAndroidPaidDownloadBuild()) {
    return HERMES_MOBILE_ANDROID_PAID_PACKAGE;
  }
  return HERMES_MOBILE_ANDROID_PACKAGE;
}

/**
 * Paid-download builds already paid at install — treat Pro as unlocked without IAP.
 * Free listing builds still use hermes_pro_lifetime ($4.99 once).
 */
export function isStorePaidDownloadEntitled(): boolean {
  return isAndroidPaidDownloadBuild();
}
