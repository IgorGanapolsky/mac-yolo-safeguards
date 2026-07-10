import * as Updates from 'expo-updates';

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
    const result = await Updates.checkForUpdateAsync();
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
    const fetchResult = await Updates.fetchUpdateAsync();
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
