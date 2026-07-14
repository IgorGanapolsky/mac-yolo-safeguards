import * as Updates from 'expo-updates';

/** Max wait for Expo update manifest probe (Tools → Check for update). */
export const OTA_CHECK_TIMEOUT_MS = 30_000;
/** Max wait for OTA bundle download before surfacing error. */
export const OTA_FETCH_TIMEOUT_MS = 60_000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export type OtaUpdateCheckResult =
  | { status: 'disabled'; message: string }
  | { status: 'current'; message: string }
  | { status: 'available'; message: string; manifestId?: string }
  | { status: 'error'; message: string };

export type OtaUpdateApplyResult =
  | { status: 'reloaded'; message: string }
  | { status: 'noop'; message: string }
  | { status: 'error'; message: string };

export function isOtaUpdatesEnabled(): boolean {
  return Updates.isEnabled;
}

export async function checkForAppUpdate(): Promise<OtaUpdateCheckResult> {
  if (!Updates.isEnabled) {
    return {
      status: 'disabled',
      message: 'OTA updates ship with store builds — dev clients skip this check.',
    };
  }

  try {
    const result = await withTimeout(
      Updates.checkForUpdateAsync(),
      OTA_CHECK_TIMEOUT_MS,
      'Update check',
    );
    if (!result.isAvailable) {
      return { status: 'current', message: 'App is up to date.' };
    }
    const manifestId =
      result.manifest && 'id' in result.manifest
        ? String((result.manifest as { id?: string }).id ?? '')
        : undefined;
    return {
      status: 'available',
      message: 'Update downloaded — restart to apply.',
      manifestId: manifestId || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update check failed';
    return { status: 'error', message };
  }
}

export async function fetchAndApplyAppUpdate(): Promise<OtaUpdateApplyResult> {
  if (!Updates.isEnabled) {
    return { status: 'noop', message: 'OTA disabled in this build.' };
  }

  try {
    const fetchResult = await withTimeout(
      Updates.fetchUpdateAsync(),
      OTA_FETCH_TIMEOUT_MS,
      'Update download',
    );
    if (!fetchResult.isNew) {
      return { status: 'noop', message: 'No new update to apply.' };
    }
    await Updates.reloadAsync();
    return { status: 'reloaded', message: 'Restarting with the latest update…' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update apply failed';
    return { status: 'error', message };
  }
}

export async function checkAndApplyAppUpdate(): Promise<OtaUpdateCheckResult | OtaUpdateApplyResult> {
  const check = await checkForAppUpdate();
  if (check.status !== 'available') {
    return check;
  }
  const apply = await fetchAndApplyAppUpdate();
  if (apply.status === 'error') {
    return { status: 'error', message: apply.message };
  }
  if (apply.status === 'reloaded') {
    return { status: 'available', message: apply.message };
  }
  return check;
}
