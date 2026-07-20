import { Platform } from 'react-native';

/** ThumbGate Pro product page (marketing). */
export const THUMBGATE_PRO_URL =
  'https://thumbgate.ai/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=pro_upgrade';

/**
 * Web dashboard for ThumbGate / Leash subscriptions.
 * Product lock (2026-07-20): subscriptions are sold only on the web — never via
 * StoreKit / Play Billing subscription SKUs inside Hermes Mobile.
 */
export const THUMBGATE_WEB_SUBSCRIPTION_URL =
  'https://thumbgate.ai/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=web_subscription';

/** @deprecated Prefer thumbgateProPriceLabel() — never surface $19/mo in the app. */
export const THUMBGATE_PRO_PRICE_LABEL = '$4.99 once';

/** Android Play one-time unlock (hermes_pro_lifetime). */
export const ANDROID_PRO_UNLOCK_PRICE_LABEL = '$4.99 once';

/** iOS paid App Store download is the primary gate (not an in-app subscription). */
export const IOS_PAID_DOWNLOAD_PRICE_LABEL = 'paid App Store download';

/**
 * Primary paywall price copy.
 * - Android: one-time Play unlock
 * - iOS: paid download (subscription, if any, is web-only)
 */
export function thumbgateProPriceLabel(): string {
  return Platform.OS === 'android' ? ANDROID_PRO_UNLOCK_PRICE_LABEL : IOS_PAID_DOWNLOAD_PRICE_LABEL;
}

/** Free-tier routed Leash approvals per ISO week (MONETIZATION-GTM-JULY-2026). */
export const FREE_LEASH_APPROVALS_PER_WEEK = 10;

/** Bottom navigation tab label (short). */
export const LEASH_TAB_LABEL = 'Leash';

/** Product name shown inside the Leash tab and Settings. */
export const THUMBGATE_LEASH_PRODUCT_NAME = 'ThumbGate Leash';

export const HERMES_HARDENING_SPRINT_URL =
  'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/docs/AI-AGENT-HARDENING.md?utm_source=hermes-mobile&utm_medium=app';
