import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Legacy App Store subscription product id.
 * Kept only so existing subscribers can restore entitlement.
 * Product lock (2026-07-20): Hermes Mobile must never requestPurchase this SKU.
 */
export const THUMBGATE_LEASH_IAP_PRODUCT_ID = 'thumbgate_leash_monthly';
/** Active Google Play non-consumable that unlocks all Pro features once. */
export const HERMES_PRO_LIFETIME_IAP_PRODUCT_ID = 'hermes_pro_lifetime';

/** Hard off: no StoreKit / Play subscription purchase path in the app. */
export const IN_APP_SUBSCRIPTION_PURCHASES_ENABLED = false;

export type ThumbgateIapResult =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'not_configured'; message: string }
  | { status: 'error'; message: string };

type ExpoIapModule = typeof import('expo-iap');
type Purchase = import('expo-iap').Purchase;

const IAP_INIT_TIMEOUT_MS = 8_000;

let iapModulePromise: Promise<ExpoIapModule | null> | null = null;
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

/** Android paid-once Play unlock is the only in-app purchase path. */
export function supportsInAppPaidUnlock(): boolean {
  return Platform.OS === 'android';
}

async function loadExpoIapModule(): Promise<ExpoIapModule | null> {
  if (!isNativeMobileApp() || isExpoGoClient()) {
    return null;
  }
  if (!iapModulePromise) {
    iapModulePromise = (async () => {
      try {
        // Jest resolves static mocks via require; dynamic import can miss the mock.
        if (process.env.NODE_ENV === 'test') {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require('expo-iap') as ExpoIapModule;
        }
        return await import('expo-iap');
      } catch {
        return null;
      }
    })();
  }
  return iapModulePromise;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Store billing timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isAndroidLifetimeUnlock(): boolean {
  return Platform.OS === 'android';
}

function isActiveLifetimePurchase(purchase: Purchase): boolean {
  const productId = purchase.productId ?? purchase.id;
  return productId === HERMES_PRO_LIFETIME_IAP_PRODUCT_ID;
}

async function hasStoreEntitlement(iap: ExpoIapModule): Promise<boolean> {
  if (isAndroidLifetimeUnlock()) {
    const purchases = await iap.getAvailablePurchases();
    return purchases.some(isActiveLifetimePurchase);
  }
  // iOS: restore-only for legacy monthly subscribers — never grant via new purchase.
  return iap.hasActiveSubscriptions([THUMBGATE_LEASH_IAP_PRODUCT_ID]);
}

async function ensureStoreConnection(iap: ExpoIapModule): Promise<void> {
  if (connectionReady) {
    return;
  }
  await withTimeout(iap.initConnection(), IAP_INIT_TIMEOUT_MS);
  connectionReady = true;
}

export function initializeThumbgateIapListeners(): void {
  if (listenersReady || !isNativeMobileApp() || isExpoGoClient()) {
    return;
  }
  listenersReady = true;

  void (async () => {
    const iap = await loadExpoIapModule();
    if (!iap) {
      listenersReady = false;
      return;
    }

    iap.purchaseUpdatedListener(async (purchase) => {
      // Only finish lifetime Android unlocks — never treat subscription SKUs as new purchases.
      if (!isAndroidLifetimeUnlock() || !isActiveLifetimePurchase(purchase)) {
        return;
      }
      try {
        await iap.finishTransaction({ purchase, isConsumable: false });
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

    iap.purchaseErrorListener((error) => {
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
  })();
}

/** Read Android lifetime or legacy iOS subscription entitlement. Never blocks startup. */
export async function syncThumbgateLeashEntitlement(): Promise<boolean> {
  if (!isNativeMobileApp() || isExpoGoClient()) {
    return false;
  }
  initializeThumbgateIapListeners();
  try {
    const iap = await loadExpoIapModule();
    if (!iap) {
      return false;
    }
    await ensureStoreConnection(iap);
    return await withTimeout(hasStoreEntitlement(iap), IAP_INIT_TIMEOUT_MS);
  } catch {
    return false;
  }
}

/**
 * Purchase paid unlock. Android: hermes_pro_lifetime one-time IAP.
 * iOS: disabled — paid download is the app gate; subscriptions are web-only.
 */
export async function purchaseThumbgateLeash(): Promise<ThumbgateIapResult> {
  if (!isNativeMobileApp() || isExpoGoClient()) {
    return { status: 'not_configured', message: storeUnavailableMessage() };
  }

  if (!isAndroidLifetimeUnlock()) {
    return {
      status: 'not_configured',
      message:
        'Subscriptions are managed on the ThumbGate web dashboard. This app does not sell subscriptions.',
    };
  }

  initializeThumbgateIapListeners();

  try {
    const iap = await loadExpoIapModule();
    if (!iap) {
      return { status: 'not_configured', message: storeUnavailableMessage() };
    }
    await ensureStoreConnection(iap);

    const alreadyActive = await hasStoreEntitlement(iap);
    if (alreadyActive) {
      return { status: 'purchased' };
    }

    return await new Promise<ThumbgateIapResult>((resolve) => {
      pendingPurchase = { resolve };

      iap
        .requestPurchase({
          type: 'in-app',
          request: {
            google: { skus: [HERMES_PRO_LIFETIME_IAP_PRODUCT_ID] },
          },
        })
        .catch((error: unknown) => {
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
    const iap = await loadExpoIapModule();
    if (!iap) {
      return { status: 'not_configured', message: storeUnavailableMessage() };
    }
    await ensureStoreConnection(iap);
    await iap.restorePurchases();
    const active = await hasStoreEntitlement(iap);
    if (active) {
      return { status: 'purchased' };
    }
    return {
      status: 'error',
      message: isAndroidLifetimeUnlock()
        ? 'No Hermes Pro purchase found on this store account.'
        : 'No legacy App Store Leash purchase found. New subscriptions are managed on the web.',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Restore failed.',
    };
  }
}

/** Primary store CTA label — Android lifetime only; iOS uses web dashboard copy. */
export function thumbgateIapSubscribeLabel(): string {
  return Platform.OS === 'android' ? 'Unlock in Google Play' : 'Manage on ThumbGate web';
}
