import * as Updates from 'expo-updates';
import { shouldSuppressOtaClientPrompts } from '../utils/otaClientPromptPolicy';

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

export type OtaDiagnostics = {
  isEnabledFlag: boolean;
  channel: string;
  runtimeVersion: string;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
};

export type OtaUpdateCheckResult =
  | { status: 'disabled'; message: string; diagnostics: OtaDiagnostics }
  | { status: 'current'; message: string; reason?: string; diagnostics: OtaDiagnostics }
  | { status: 'available'; message: string; manifestId?: string; diagnostics: OtaDiagnostics }
  | { status: 'error'; message: string; diagnostics: OtaDiagnostics };

export type OtaUpdateApplyResult =
  | { status: 'reloaded'; message: string }
  | { status: 'noop'; message: string }
  | { status: 'error'; message: string };

function trimStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Native EnabledUpdatesController always exposes channel + runtimeVersion.
 * `Updates.isEnabled` is a one-shot JS const and has falsely reported false on
 * Play release binaries while expo-updates was actively checking — treat
 * channel+runtime as an enabled signal so Check for update can run.
 */
export function getOtaDiagnostics(): OtaDiagnostics {
  return {
    isEnabledFlag: !!Updates.isEnabled,
    channel: trimStr(Updates.channel),
    runtimeVersion: trimStr(Updates.runtimeVersion),
    updateId:
      typeof Updates.updateId === 'string' && Updates.updateId.length > 0
        ? Updates.updateId.toLowerCase()
        : null,
    isEmbeddedLaunch: !!Updates.isEmbeddedLaunch,
    isEmergencyLaunch: !!Updates.isEmergencyLaunch,
  };
}

export function isOtaUpdatesEnabled(): boolean {
  if (Updates.isEnabled) {
    return true;
  }
  const { channel, runtimeVersion } = getOtaDiagnostics();
  return channel.length > 0 && runtimeVersion.length > 0;
}

function formatDiagnosticsSuffix(d: OtaDiagnostics): string {
  const id = d.updateId ? d.updateId.slice(0, 8) : 'embedded';
  const launch = d.isEmbeddedLaunch ? 'embedded' : 'ota';
  return ` [${d.channel || '?'}@${d.runtimeVersion || '?'} ${launch} ${id}]`;
}

export async function checkForAppUpdate(): Promise<OtaUpdateCheckResult> {
  const diagnostics = getOtaDiagnostics();
  if (shouldSuppressOtaClientPrompts()) {
    return {
      status: 'disabled',
      message:
        'OTA client checks frozen (Expo billing freeze 2026-07-23). Local release APK only until HERMES_OTA_BILLING_THAW=1.',
      diagnostics,
    };
  }
  if (!isOtaUpdatesEnabled()) {
    return {
      status: 'disabled',
      message:
        'OTA disabled in this binary (no channel/runtime). Needs a store/release rebuild with expo-updates enabled.',
      diagnostics,
    };
  }

  try {
    const result = await withTimeout(
      Updates.checkForUpdateAsync(),
      OTA_CHECK_TIMEOUT_MS,
      'Update check',
    );
    if (!result.isAvailable) {
      const reason =
        'reason' in result && typeof result.reason === 'string' ? result.reason : undefined;
      const reasonNote = reason ? ` (${reason})` : '';
      return {
        status: 'current',
        message: `App is up to date.${reasonNote}${formatDiagnosticsSuffix(diagnostics)}`,
        reason,
        diagnostics,
      };
    }
    const manifestId =
      result.manifest && 'id' in result.manifest
        ? String((result.manifest as { id?: string }).id ?? '')
        : undefined;
    return {
      status: 'available',
      message: 'Update available — downloading…',
      manifestId: manifestId || undefined,
      diagnostics,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update check failed';
    return {
      status: 'error',
      message: `${message}${formatDiagnosticsSuffix(diagnostics)}`,
      diagnostics,
    };
  }
}

export async function fetchAndApplyAppUpdate(): Promise<OtaUpdateApplyResult> {
  if (shouldSuppressOtaClientPrompts()) {
    return {
      status: 'noop',
      message:
        'OTA apply frozen (Expo billing freeze). Will not reloadAsync — protects local USB/dogfood installs.',
    };
  }
  if (!isOtaUpdatesEnabled()) {
    return {
      status: 'noop',
      message:
        'OTA disabled in this binary (no channel/runtime). Needs a store/release rebuild with expo-updates enabled.',
    };
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
    return { status: 'error', message: apply.message, diagnostics: check.diagnostics };
  }
  if (apply.status === 'reloaded') {
    return {
      status: 'available',
      message: apply.message,
      manifestId: check.manifestId,
      diagnostics: check.diagnostics,
    };
  }
  return check;
}
