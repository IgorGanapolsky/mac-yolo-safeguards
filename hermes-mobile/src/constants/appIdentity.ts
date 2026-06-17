/** Canonical Hermes Mobile app identifiers — single source of truth. */
export const HERMES_MOBILE_ANDROID_PACKAGE = 'com.iganapolsky.hermesmobile';
export const HERMES_MOBILE_IOS_BUNDLE_ID = 'com.iganapolsky.hermesmobile';

/** Fly.io approval relay for Leash tab (pairing + queue). */
export const HERMES_MOBILE_CLOUD_URL = 'https://hermes-mobile-cloud.fly.dev';

/** Fly relay URLs saved before 0.3 are reset to the canonical host. */
export function shouldMigrateCloudRelayUrl(cloudUrl?: string): boolean {
  if (!cloudUrl) return false;
  if (cloudUrl.includes('hermes-mobile-cloud')) return false;
  return cloudUrl.includes('.fly.dev');
}

/**
 * Firebase Android app on openclaw-console-mobile-8d53d (Hermes-only; not LipoShield).
 * Created 2026-06-17 — package com.iganapolsky.hermesmobile.
 */
export const FIREBASE_ANDROID_APP_ID = '1:587028054730:android:00258f23e47d56f6772a33';
