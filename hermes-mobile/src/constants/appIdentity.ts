/** Canonical Hermes Mobile app identifiers — single source of truth. */
import firebaseProject from '../../firebase-project.json';

export const HERMES_MOBILE_ANDROID_PACKAGE = 'com.iganapolsky.hermesmobile';
export const HERMES_MOBILE_IOS_BUNDLE_ID = 'com.iganapolsky.hermesmobile';

/** Android Firebase App Distribution + GCP (iganapolsky@gmail.com). */
export const HERMES_ANDROID_OPERATOR_EMAIL = 'iganapolsky@gmail.com';

/** Google Play Console — organization (LLC) developer account, same Gmail admin. */
export const HERMES_PLAY_CONSOLE_ACCOUNT_TYPE = 'organization' as const;
export const HERMES_PLAY_CONSOLE_ADMIN_EMAIL = 'iganapolsky@gmail.com';

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
