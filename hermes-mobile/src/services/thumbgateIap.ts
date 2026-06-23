import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  finishTransaction,
  hasActiveSubscriptions,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from 'expo-iap';

/** Play / App Store subscription id — must match Play Console + App Store Connect. */
export const THUMBGATE_LEASH_IAP_PRODUCT_ID = 'thumbgate_leash_monthly';

export type ThumbgateIapResult =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'not_configured'; message: string }
  | { status: 'error'; message: string };

let connectionReady = false;
let listenersReady = false;
let pendingPurchase:
  | {
      resolve: (result: ThumbgateIapResult) => void;
    }
  | null = null;

function isNativeMobileApp(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function isExpoGoClient(): boolean {
  return Constants.appOwnership === 'expo';
}

function storeUnavailableMessage(): string {
  if (!isNativeMobileApp()) {
    return 'In-app purchases are only available on iOS and Android.';
  }
  if (isExpoGoClient()) {
    return 'Install the Hermes Mobile dev client or store build — Expo Go cannot run Google Play / App Store billing.';
  }
  return 'Store billing is unavailable in this build.';
}

function isThumbgateLeashPurchase(purchase: Purchase): boolean {
  const productId = purchase.productId ?? purchase.id;
  return productId === THUMBGATE_LEASH_IAP_PRODUCT_ID;
}

async function ensureStoreConnection(): Promise<void> {
  if (connectionReady) {
    return;
  }
  await initConnection();
  connectionReady = true;
}

export function initializeThumbgateIapListeners(): void {
  if (listenersReady || !isNativeMobileApp()) {
    return;
  }
  listenersReady = true;

  purchaseUpdatedListener(async (purchase) => {
    if (!isThumbgateLeashPurchase(purchase)) {
      return;
    }
    try {
      await finishTransaction({ purchase, isConsumable: false });
      if (pendingPurchase) {
        pendingPurchase.resolve({ status: 'purchased' });
        pendingPurchase = null;
      }
    } catch (error) {
      if (pendingPurchase) {
        pendingPurchase.resolve({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not finish purchase.',
        });
        pendingPurchase = null;
      }
    }
  });

  purchaseErrorListener((error) => {
    if (!pendingPurchase) {
      return;
    }
    const code = String(error.code ?? '').toLowerCase();
    if (code.includes('cancel') || code.includes('user')) {
      pendingPurchase.resolve({ status: 'cancelled' });
    } else {
      pendingPurchase.resolve({
        status: 'error',
        message: error.message || 'Purchase failed.',
      });
    }
    pendingPurchase = null;
  });
}

/** Read active subscription from Google Play / App Store. */
export async function syncThumbgateLeashEntitlement(): Promise<boolean> {
  if (!isNativeMobileApp() || isExpoGoClient()) {
    return false;
  }
  initializeThumbgateIapListeners();
  try {
    await ensureStoreConnection();
    return await hasActiveSubscriptions([THUMBGATE_LEASH_IAP_PRODUCT_ID]);
  } catch {
    return false;
  }
}

export async function purchaseThumbgateLeash(): Promise<ThumbgateIapResult> {
  if (!isNativeMobileApp() || isExpoGoClient()) {
    return { status: 'not_configured', message: storeUnavailableMessage() };
  }

  initializeThumbgateIapListeners();

  try {
    await ensureStoreConnection();

    const alreadyActive = await hasActiveSubscriptions([THUMBGATE_LEASH_IAP_PRODUCT_ID]);
    if (alreadyActive) {
      return { status: 'purchased' };
    }

    return await new Promise<ThumbgateIapResult>((resolve) => {
      pendingPurchase = { resolve };

      requestPurchase({
        type: 'subs',
        request: {
          apple: { sku: THUMBGATE_LEASH_IAP_PRODUCT_ID },
          google: { skus: [THUMBGATE_LEASH_IAP_PRODUCT_ID] },
        },
      }).catch((error: unknown) => {
        pendingPurchase = null;
        resolve({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not open store checkout.',
        });
      });
    });
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Store connection failed.',
    };
  }
}

export async function restoreThumbgateLeashPurchases(): Promise<ThumbgateIapResult> {
  if (!isNativeMobileApp() || isExpoGoClient()) {
    return { status: 'not_configured', message: storeUnavailableMessage() };
  }

  initializeThumbgateIapListeners();

  try {
    await ensureStoreConnection();
    await restorePurchases();
    const active = await hasActiveSubscriptions([THUMBGATE_LEASH_IAP_PRODUCT_ID]);
    if (active) {
      return { status: 'purchased' };
    }
    return {
      status: 'error',
      message: 'No active ThumbGate Leash subscription found on this store account.',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Restore failed.',
    };
  }
}

export function thumbgateIapSubscribeLabel(): string {
  return Platform.OS === 'ios' ? 'Subscribe in App Store' : 'Subscribe in Google Play';
}
