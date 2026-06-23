import { Platform } from 'react-native';

/** Play / App Store product id — create in console before enabling purchases. */
export const THUMBGATE_LEASH_IAP_PRODUCT_ID = 'thumbgate_leash_monthly';

export type ThumbgateIapResult =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'not_configured'; message: string }
  | { status: 'error'; message: string };

/**
 * Native in-app purchase for ThumbGate Leash.
 * Wire react-native-iap / RevenueCat here when store products are live.
 */
export async function purchaseThumbgateLeash(): Promise<ThumbgateIapResult> {
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  return {
    status: 'not_configured',
    message: `${store} billing for ThumbGate Leash is not connected in this build yet.`,
  };
}

export async function restoreThumbgateLeashPurchases(): Promise<ThumbgateIapResult> {
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  return {
    status: 'not_configured',
    message: `Restore purchases via ${store} will work once billing is connected.`,
  };
}

export function thumbgateIapSubscribeLabel(): string {
  return Platform.OS === 'ios'
    ? 'Subscribe in App Store'
    : 'Subscribe in Google Play';
}
