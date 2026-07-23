/**
 * Expo billing freeze (2026-07-23): Visa charge failed after OTA publish spam.
 * Publishing stays gated by `scripts/require-expo-billing-thaw.sh`.
 *
 * CRITICAL: Clients can still ON_LOAD-download already-published CDN updates and
 * replace a freshly installed local APK — that is how "Applying update…" wiped
 * dogfood after android:phone. During freeze we:
 * - bake `updates.checkAutomatically=NEVER` (+ enabled false) via app.config.js
 * - suppress banner/Alert/check/apply/reload in JS
 *
 * Thaw: HERMES_OTA_BILLING_THAW=1 or EXPO_PUBLIC_OTA_BILLING_THAW=1 at build time,
 * or EXPO_PUBLIC_OTA_CLIENT_PROMPTS=1 to force prompts, or after freeze floor date.
 */
export const OTA_BILLING_FREEZE_UNTIL_MS = Date.parse('2026-08-15T00:00:00.000Z');

function envFlag(name: string): string {
  try {
    return String(process.env[name] ?? '').trim();
  } catch {
    return '';
  }
}

export function isOtaBillingFreezeActive(nowMs: number = Date.now()): boolean {
  if (envFlag('EXPO_PUBLIC_OTA_CLIENT_PROMPTS') === '1') return false;
  if (envFlag('EXPO_PUBLIC_OTA_BILLING_THAW') === '1') return false;
  if (envFlag('HERMES_OTA_BILLING_THAW') === '1') return false;
  return nowMs < OTA_BILLING_FREEZE_UNTIL_MS;
}

/** @deprecated use isOtaBillingFreezeActive — kept for call-site clarity */
export function shouldSuppressOtaClientPrompts(nowMs: number = Date.now()): boolean {
  return isOtaBillingFreezeActive(nowMs);
}

/** True when native expo-updates should be disabled in app.config.js. */
export function shouldDisableNativeOtaChecks(nowMs: number = Date.now()): boolean {
  return isOtaBillingFreezeActive(nowMs);
}
