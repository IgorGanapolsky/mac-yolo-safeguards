import { Platform } from 'react-native';

/** ThumbGate Pro — paid unlock companion to Hermes Mobile (Leash memory gates). */
export const THUMBGATE_PRO_URL =
  'https://thumbgate.ai/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=pro_upgrade';

/** @deprecated Prefer thumbgateProPriceLabel() — do not surface $19/mo as primary. */
export const THUMBGATE_PRO_PRICE_LABEL = '$4.99 once';

/** Android Play one-time unlock (hermes_pro_lifetime). */
export const ANDROID_PRO_UNLOCK_PRICE_LABEL = '$4.99 once';

/**
 * Primary paywall price copy. Android is paid-once.
 * iOS keeps store-priced unlock wording (no $19.99/mo hero); existing App Store
 * subscribers still restore via thumbgate_leash_monthly.
 */
export function thumbgateProPriceLabel(): string {
  return Platform.OS === 'android' ? ANDROID_PRO_UNLOCK_PRICE_LABEL : 'paid unlock';
}

/** Free-tier routed Leash approvals per ISO week (MONETIZATION-GTM-JULY-2026). */
export const FREE_LEASH_APPROVALS_PER_WEEK = 10;

/** Bottom navigation tab label (short). */
export const LEASH_TAB_LABEL = 'Leash';

/** Product name shown inside the Leash tab and Settings. */
export const THUMBGATE_LEASH_PRODUCT_NAME = 'ThumbGate Leash';

export const HERMES_HARDENING_SPRINT_URL =
  'https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/docs/AI-AGENT-HARDENING.md?utm_source=hermes-mobile&utm_medium=app';
