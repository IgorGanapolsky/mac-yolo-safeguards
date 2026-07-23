/**
 * Expo billing freeze (2026-07-23): Visa charge failed after OTA publish spam.
 * Publishing stays gated by `scripts/require-expo-billing-thaw.sh`.
 *
 * Clients can still *download* already-published CDN updates for free (no new
 * Expo bill). During the freeze we suppress auto check + banner/Alert so dogfood
 * is not nagged with Restart while we refuse new publishes.
 *
 * Thaw (client): set EXPO_PUBLIC_OTA_BILLING_THAW=1 at build time, or force
 * prompts with EXPO_PUBLIC_OTA_CLIENT_PROMPTS=1. Date floor also expires.
 */
export const OTA_BILLING_FREEZE_UNTIL_MS = Date.parse('2026-08-15T00:00:00.000Z');

function envFlag(name: string): string {
  try {
    return String(process.env[name] ?? '').trim();
  } catch {
    return '';
  }
}

export function shouldSuppressOtaClientPrompts(nowMs: number = Date.now()): boolean {
  if (envFlag('EXPO_PUBLIC_OTA_CLIENT_PROMPTS') === '1') return false;
  if (envFlag('EXPO_PUBLIC_OTA_BILLING_THAW') === '1') return false;
  return nowMs < OTA_BILLING_FREEZE_UNTIL_MS;
}
