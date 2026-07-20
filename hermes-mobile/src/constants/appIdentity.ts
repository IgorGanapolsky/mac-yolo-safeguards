/** Canonical Hermes Mobile app identifiers — single source of truth. */
import firebaseProject from '../../firebase-project.json';

/** Free Play listing (cannot convert Free→Paid). Money path: hermes_pro_lifetime IAP. */
export const HERMES_MOBILE_ANDROID_PACKAGE = 'com.iganapolsky.hermesmobile';
/**
 * Paid Play download SKU — created 2026-07-20 under IgorGanapolsky
 * (Play app id 4972002147362988720). Google blocks Free→Paid on the free package.
 */
export const HERMES_MOBILE_ANDROID_PAID_PACKAGE = 'com.iganapolsky.hermesmobile.paid';
export const HERMES_PLAY_PAID_APP_ID = '4972002147362988720';
export const HERMES_PLAY_PAID_PRICE_USD = '4.99';
export const HERMES_MOBILE_IOS_BUNDLE_ID = 'com.iganapolsky.hermesmobile';

/** Android Firebase App Distribution + GCP (iganapolsky@gmail.com). */
export const HERMES_ANDROID_OPERATOR_EMAIL = 'iganapolsky@gmail.com';

/** Google Play Console — Igor Ganapolsky personal developer account (iganapolsky@gmail.com admin). */
export const HERMES_PLAY_CONSOLE_ACCOUNT_TYPE = 'personal' as const;
export const HERMES_PLAY_CONSOLE_ADMIN_EMAIL = 'iganapolsky@gmail.com';
/** Public Play Store developer slug (no space — Play handle, not login email). */
export const HERMES_PLAY_DEVELOPER_PUBLIC_NAME = 'IgorGanapolsky';
export const HERMES_PLAY_DEVELOPER_ID = '5120393192891708058';
export const HERMES_PLAY_DEVELOPER_PAGE_URL =
  'https://play.google.com/store/apps/developer?id=IgorGanapolsky';

/** iOS App Store Connect / Apple ID for EAS submit and TestFlight. */
export const HERMES_IOS_APPLE_ID_EMAIL = 'igor.ganapolsky@icloud.com';

/** Fly.io approval relay for Leash tab (pairing + queue). */
export const HERMES_MOBILE_CLOUD_URL = 'https://hermesmobile-cloud.fly.dev';

/** Hosted ThumbGate API for Leash thumbs-up/down memory capture. */
export const THUMBGATE_API_URL = 'https://thumbgate-production.up.railway.app';

/** Fly relay URLs saved before 0.3 are reset to the canonical host. */
export function shouldMigrateCloudRelayUrl(cloudUrl?: string): boolean {
  if (!cloudUrl) return false;
  if (cloudUrl.includes('hermesmobile-cloud.fly.dev')) return false;
  return cloudUrl.includes('.fly.dev') || cloudUrl.includes('hermes-mobile-cloud');
}

/** Hermes Mobile Firebase Android app (App Distribution). */
export const HERMES_FIREBASE_PROJECT_NUMBER = firebaseProject.projectNumber;
export const FIREBASE_ANDROID_APP_ID = firebaseProject.androidAppId;
