import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import appConfig from '../../app.json';
import { isPostHogCaptureEnvironmentAllowed } from './productAnalytics';

const QUEUE_KEY = 'hermes-mobile:crash_queue';
const MAX_QUEUE = 25;
const MAX_FIELD = 4000;

// Default from EXPO_PUBLIC_* env, but exposed mutable so tests can override
// without relying on babel's compile-time inlining of EXPO_PUBLIC_* vars.
const posthogConfig = {
  host:
    process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com',
  key: process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || '',
};

function posthogHost(): string {
  return posthogConfig.host;
}

function posthogKey(): string {
  return posthogConfig.key;
}

/** @internal Test seam — overrides PostHog host/key without env inlining. */
export function __setPosthogConfigForTesting(cfg: {
  host?: string;
  key?: string;
}): void {
  if (cfg.host !== undefined) posthogConfig.host = cfg.host;
  if (cfg.key !== undefined) posthogConfig.key = cfg.key;
}

const APP_VERSION = appConfig.expo.version;
const BUILD_NUMBER =
  Platform.OS === 'android'
    ? String(Constants.expoConfig?.android?.versionCode ?? '')
    : String(Constants.expoConfig?.ios?.buildNumber ?? '');

export interface CrashRecord {
  id: string;
  event: string;
  message: string;
  stack?: string;
  component_stack?: string;
  platform: string;
  app_version: string;
  build_number: string;
  occurred_at: string;
}

function truncate(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.length > MAX_FIELD ? `${value.slice(0, MAX_FIELD)}…` : value;
}

function exceptionTypeFromMessage(message: string): string {
  const match = /^([A-Za-z_$][\w$]*)\s*:/.exec(message);
  return match?.[1] || 'Error';
}

/**
 * PostHog Error Tracking payload for a queued crash.
 * Uses `$exception` + `$exception_list` so issues appear in Error Tracking
 * (custom event names like `ui_crash` do not).
 */
export function buildPostHogExceptionCapture(record: CrashRecord): {
  api_key: string;
  event: '$exception';
  distinct_id: string;
  properties: Record<string, unknown>;
} {
  const message = truncate(record.message) || 'unknown';
  const stack = truncate(record.stack);
  const type = exceptionTypeFromMessage(message);
  return {
    api_key: posthogKey(),
    event: '$exception',
    distinct_id: 'hermes-mobile-crash',
    properties: {
      distinct_id: 'hermes-mobile-crash',
      app: 'hermes-mobile',
      platform: record.platform,
      app_version: record.app_version,
      build_number: record.build_number,
      crash_id: record.id,
      hermes_crash_kind: record.event,
      component_stack: truncate(record.component_stack),
      occurred_at: record.occurred_at,
      $lib: 'hermes-mobile-fetch',
      $exception_level: 'error',
      $exception_fingerprint: `hermes-mobile:${record.event}:${type}:${message.slice(0, 120)}`,
      $exception_list: [
        {
          type,
          value: message,
          mechanism: {
            handled: record.event !== 'js_fatal_crash',
            synthetic: !stack,
          },
          stacktrace: {
            type: 'raw',
            frames: stack
              ? [
                  {
                    platform: 'javascript',
                    raw_id: record.id,
                    resolved: false,
                    mangled_name: stack.slice(0, 500),
                    filename: 'hermes-mobile',
                    in_app: true,
                  },
                ]
              : [],
          },
        },
      ],
      // Keep raw stack for debugging when frames are synthetic.
      $exception_stack_trace_raw: stack,
    },
  };
}

/** Build a normalized crash record from any throwable. */
export function buildCrashRecord(
  event: string,
  error: unknown,
  extra: { component_stack?: string } = {},
): CrashRecord {
  const err = error as { message?: string; stack?: string } | undefined;
  const message =
    error instanceof Error
      ? err?.message ?? String(error)
      : String(error ?? 'unknown');
  return {
    id: `crash_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    event,
    message,
    stack: truncate(err?.stack),
    component_stack: truncate(extra.component_stack),
    platform: Platform.OS,
    app_version: APP_VERSION,
    build_number: BUILD_NUMBER,
    occurred_at: new Date().toISOString(),
  };
}

/** Read the persisted crash queue. */
export async function getCrashQueue(): Promise<CrashRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CrashRecord[]) : [];
  } catch {
    return [];
  }
}

/** Append a crash to the persisted queue, keeping it bounded. */
export async function enqueueCrash(record: CrashRecord): Promise<void> {
  try {
    const queue = await getCrashQueue();
    queue.push(record);
    // Keep oldest-first, bounded to avoid unbounded storage growth.
    const trimmed = queue.slice(-MAX_QUEUE);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // If even AsyncStorage fails, there is no durable path. Swallow silently —
    // crashing inside the crash reporter must never mask the original error.
  }
}

/** Convenience: build + persist a crash in one call. */
export async function captureCrash(
  event: string,
  error: unknown,
  extra: { component_stack?: string } = {},
): Promise<void> {
  await enqueueCrash(buildCrashRecord(event, error, extra));
}

/**
 * Flush the crash queue to the PostHog capture endpoint. Called at app launch.
 * Removes successfully-sent crashes; retains failures for the next launch.
 */
export async function flushCrashQueue(): Promise<{
  flushed: number;
  retained: number;
}> {
  const key = posthogKey();
  const queue = await getCrashQueue();
  if (queue.length === 0) {
    return { flushed: 0, retained: 0 };
  }
  if (!key || !isPostHogCaptureEnvironmentAllowed()) {
    // No PostHog key, or non-production/dogfood environment. Clear stale
    // crashes so the queue does not grow unbounded without a destination.
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
      /* ignore */
    }
    return { flushed: 0, retained: 0 };
  }

  const sent: CrashRecord[] = [];
  const failed: CrashRecord[] = [];

  for (const record of queue) {
    try {
      const payload = buildPostHogExceptionCapture(record);
      const res = await fetch(`${posthogHost().replace(/\/+$/, '')}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        sent.push(record);
      } else {
        failed.push(record);
      }
    } catch {
      failed.push(record);
    }
  }

  try {
    if (failed.length > 0) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
    } else {
      await AsyncStorage.removeItem(QUEUE_KEY);
    }
  } catch {
    /* ignore — best effort */
  }

  return { flushed: sent.length, retained: failed.length };
}

/**
 * Install a global JS exception handler that persists fatal crashes to the
 * queue before chaining through to the platform's previous handler (which RN
 * uses to surface the red box / crash dialog). Safe no-op if ErrorUtils is
 * absent (e.g. in the Jest runtime).
 */
export function installGlobalCrashHandler(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils?.getGlobalHandler || !utils?.setGlobalHandler) {
    return;
  }
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error: unknown, isFatal?: boolean) =>
    captureCrash('js_fatal_crash', error, {}).finally(() => {
      if (typeof previous === 'function') {
        try {
          previous(error, isFatal);
        } catch {
          /* never let the chained handler throw */
        }
      }
    }),
  );
}

/** Clear the queue entirely (test helper / reset). */
export async function clearCrashQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

interface ErrorUtilsLike {
  getGlobalHandler(): ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(
    handler: (error: unknown, isFatal?: boolean) => void,
  ): void;
}
