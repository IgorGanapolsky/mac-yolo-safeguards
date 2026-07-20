import type React from "react";
import * as Sentry from "@sentry/react-native";
import { getTelemetryResourceIdentity } from "./telemetryIdentity";

// Client DSN is publishable (safe to ship in the app binary) but must still come
// from the environment so it is never hardcoded in a tracked file. When it is
// absent, every export below is a no-op — builds without a DSN run unchanged.
const sentryConfig = {
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || "",
  // Modest performance sample: capture traces for 20% of transactions. Errors
  // and crashes are always captured regardless of this rate.
  tracesSampleRate: 0.2,
};

let initialized = false;

/** @internal Test seam — override DSN / sample rate without env inlining. */
export function __setSentryConfigForTesting(cfg: {
  dsn?: string;
  tracesSampleRate?: number;
}): void {
  if (cfg.dsn !== undefined) sentryConfig.dsn = cfg.dsn;
  if (cfg.tracesSampleRate !== undefined) {
    sentryConfig.tracesSampleRate = cfg.tracesSampleRate;
  }
  initialized = false;
}

/** Whether Sentry has been initialized (i.e. a DSN was present). */
export function isCrashReportingEnabled(): boolean {
  return initialized;
}

/**
 * Initialize Sentry as early as possible. Captures JS + native crashes,
 * unhandled promise rejections, and enables a modest performance trace sample.
 * Safe no-op when EXPO_PUBLIC_SENTRY_DSN is unset — the app still runs, crash
 * reporting is simply dormant.
 */
export function initCrashReporting(): void {
  if (initialized) {
    return;
  }
  const dsn = sentryConfig.dsn;
  if (!dsn) {
    return;
  }
  const identity = getTelemetryResourceIdentity();
  Sentry.init({
    dsn,
    tracesSampleRate: sentryConfig.tracesSampleRate,
    release: identity.release,
    dist:
      identity.build_number === "unknown" ? undefined : identity.build_number,
    environment: identity.environment,
    enableNativeFramesTracking: true,
    initialScope: {
      tags: {
        app: identity.app,
        app_identifier: identity.app_identifier,
        eas_project_id: identity.eas_project_id,
        telemetry_schema_version: identity.telemetry_schema_version,
        platform: identity.platform,
        app_version: identity.app_version,
        build_number: identity.build_number,
        runtime_version: identity.runtime_version,
        update_id: identity.update_id,
        update_channel: identity.update_channel,
        update_origin: identity.update_origin,
      },
      contexts: {
        hermes_release: { ...identity },
      },
    },
  });
  initialized = true;
}

/** Report a handled exception with optional structured context. */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) {
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Report a message (breadcrumb-style signal) with optional context. */
export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!initialized) {
    return;
  }
  Sentry.captureMessage(message, context ? { extra: context } : undefined);
}

/**
 * Wrap the root component with Sentry's error boundary / touch / profiling
 * integrations. Harmless when Sentry is not initialized (no DSN). Callers use
 * this instead of importing Sentry directly.
 */
export function withCrashReporting<P extends React.JSX.IntrinsicAttributes>(
  RootComponent: React.ComponentType<P>,
): React.ComponentType<P> {
  return Sentry.wrap(
    RootComponent as React.ComponentType<Record<string, unknown>>,
  ) as unknown as React.ComponentType<P>;
}
