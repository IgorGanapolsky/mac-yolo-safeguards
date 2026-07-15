import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

/** Max wait for Expo update manifest probe. */
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
  | { status: 'downloading'; message: string }
  | { status: 'error'; message: string };

export type OtaUpdateApplyResult =
  | { status: 'reloaded'; message: string }
  | { status: 'noop'; message: string }
  | { status: 'error'; message: string };

export type InstalledOtaInfo = {
  enabled: boolean;
  channel: string;
  runtimeVersion: string;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  createdAt: string | null;
};

function shortId(id: string | null | undefined): string {
  const value = String(id ?? '').trim();
  if (!value) {
    return 'unknown';
  }
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function isOtaUpdatesEnabled(): boolean {
  return Updates.isEnabled;
}

export function getInstalledOtaInfo(): InstalledOtaInfo {
  const channel = String(Updates.channel ?? '').trim() || 'unknown';
  const runtimeVersion =
    String(Updates.runtimeVersion ?? '').trim() ||
    String(Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '').trim() ||
    'unknown';
  const updateId = Updates.updateId ? String(Updates.updateId) : null;
  const createdAt =
    Updates.createdAt instanceof Date
      ? Updates.createdAt.toISOString()
      : Updates.createdAt
        ? String(Updates.createdAt)
        : null;

  return {
    enabled: Updates.isEnabled,
    channel,
    runtimeVersion,
    updateId,
    isEmbeddedLaunch: Boolean(Updates.isEmbeddedLaunch),
    createdAt,
  };
}

function currentBundleMessage(info: InstalledOtaInfo): string {
  const source = info.isEmbeddedLaunch ? 'embedded native bundle' : 'downloaded OTA';
  return (
    `No newer update on channel "${info.channel}" for runtime ${info.runtimeVersion}. ` +
    `Running ${shortId(info.updateId)} (${source}). ` +
    `This means Expo found nothing newer to download — not a guarantee you saw every store APK.`
  );
}

export async function checkForAppUpdate(): Promise<OtaUpdateCheckResult> {
  const info = getInstalledOtaInfo();
  if (!Updates.isEnabled) {
    return {
      status: 'disabled',
      message:
        'OTA is off in this build (dev client / E2E). Store and release APKs check the production channel on launch.',
    };
  }

  try {
    const result = await withTimeout(
      Updates.checkForUpdateAsync(),
      OTA_CHECK_TIMEOUT_MS,
      'Update check',
    );
    if (!result.isAvailable) {
      return { status: 'current', message: currentBundleMessage(info) };
    }
    const manifestId =
      result.manifest && 'id' in result.manifest
        ? String((result.manifest as { id?: string }).id ?? '')
        : undefined;
    return {
      status: 'available',
      message: `Update available on "${info.channel}" for runtime ${info.runtimeVersion} — tap again or wait; download starts next.`,
      manifestId: manifestId || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update check failed';
    return { status: 'error', message };
  }
}

export async function fetchAndApplyAppUpdate(): Promise<OtaUpdateApplyResult> {
  if (!Updates.isEnabled) {
    return {
      status: 'noop',
      message: 'OTA disabled in this build — install a store/release APK to receive updates.',
    };
  }

  try {
    const fetchResult = await withTimeout(
      Updates.fetchUpdateAsync(),
      OTA_FETCH_TIMEOUT_MS,
      'Update download',
    );
    if (!fetchResult.isNew) {
      return {
        status: 'noop',
        message: 'Download finished but Expo reported no new bundle to apply.',
      };
    }
    await Updates.reloadAsync();
    return { status: 'reloaded', message: 'Restarting now with the downloaded update…' };
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
  return {
    status: 'available',
    message: apply.message || check.message,
    manifestId: check.manifestId,
  };
}
