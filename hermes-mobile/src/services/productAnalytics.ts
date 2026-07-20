import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import { getMarketingAttributionProperties } from "./marketingAttribution";
import { buildTelemetryEventIdentity } from "./telemetryIdentity";

/**
 * Production-only PostHog contract:
 * Report only from real production store/OTA users.
 * Never count __DEV__, preview/dev/e2e EAS builds, developer leash unlock,
 * store leash preview, or EXPO_PUBLIC_POSTHOG_INTERNAL=1 dogfood builds.
 */
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

function posthogKey(): string {
  return process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || "";
}
const DISTINCT_ID_KEY = "hermes.analytics.distinct_id";
const DELIVERY_METRICS_KEY = "hermes.analytics.delivery_metrics.v1";

export interface ProductAnalyticsDeliveryMetrics {
  attempted: number;
  delivered: number;
  failed: number;
  missing_destination: number;
  last_attempt_at?: string;
  last_success_at?: string;
  last_failure_at?: string;
}

const EMPTY_DELIVERY_METRICS: ProductAnalyticsDeliveryMetrics = {
  attempted: 0,
  delivered: 0,
  failed: 0,
  missing_destination: 0,
};

let optOut = false;
let developerLeashUnlockActive = false;
let storeLeashPreviewActive = false;
let distinctIdPromise: Promise<string> | null = null;

/** Test seam — null clears override. */
let reportingOverrideForTesting: boolean | null = null;

async function getDistinctId(): Promise<string> {
  if (!distinctIdPromise) {
    distinctIdPromise = (async () => {
      const existing = await AsyncStorage.getItem(DISTINCT_ID_KEY);
      if (existing?.trim()) {
        return existing.trim();
      }
      const created = `hm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(DISTINCT_ID_KEY, created);
      return created;
    })();
  }
  return distinctIdPromise;
}

export async function getProductAnalyticsDeliveryMetrics(): Promise<ProductAnalyticsDeliveryMetrics> {
  try {
    const raw = await AsyncStorage.getItem(DELIVERY_METRICS_KEY);
    if (!raw) return { ...EMPTY_DELIVERY_METRICS };
    const parsed = JSON.parse(raw) as Partial<ProductAnalyticsDeliveryMetrics>;
    return {
      ...EMPTY_DELIVERY_METRICS,
      ...parsed,
    };
  } catch {
    return { ...EMPTY_DELIVERY_METRICS };
  }
}

async function updateDeliveryMetrics(
  update: (
    current: ProductAnalyticsDeliveryMetrics,
  ) => ProductAnalyticsDeliveryMetrics,
): Promise<ProductAnalyticsDeliveryMetrics> {
  const next = update(await getProductAnalyticsDeliveryMetrics());
  try {
    await AsyncStorage.setItem(DELIVERY_METRICS_KEY, JSON.stringify(next));
  } catch {
    // Analytics must never break the product path when local storage is down.
  }
  return next;
}

export function setProductAnalyticsOptOut(enabled: boolean): void {
  optOut = enabled;
}

/**
 * Runtime dogfood / review-preview exclusions (Igor pair unlock, store preview deep link).
 * Wired from GatewayContext — does not persist beyond process lifetime for store preview.
 */
export function setPostHogDogfoodExclusions(flags: {
  developerLeashUnlock?: boolean;
  storeLeashPreview?: boolean;
}): void {
  if (flags.developerLeashUnlock !== undefined) {
    developerLeashUnlockActive = flags.developerLeashUnlock;
  }
  if (flags.storeLeashPreview !== undefined) {
    storeLeashPreviewActive = flags.storeLeashPreview;
  }
}

/** @internal */
export function __setShouldReportToPostHogForTesting(
  value: boolean | null,
): void {
  reportingOverrideForTesting = value;
}

function easBuildProfile(): string {
  return (
    process.env.EAS_BUILD_PROFILE?.trim() ||
    process.env.EXPO_PUBLIC_EAS_PROFILE?.trim() ||
    ""
  );
}

function updatesChannelName(): string {
  const fromEnv = process.env.EXPO_PUBLIC_UPDATES_CHANNEL?.trim() || "";
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return String(Updates.channel ?? "").trim();
  } catch {
    return "";
  }
}

function isInternalDogfoodBuild(): boolean {
  const flag = process.env.EXPO_PUBLIC_POSTHOG_INTERNAL?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/** True only for production EAS profile/channel (fail closed when unknown). */
export function isProductionPostHogBuild(): boolean {
  const profile = easBuildProfile();
  if (profile && profile !== "production") {
    return false;
  }
  const channel = updatesChannelName();
  if (channel && channel !== "production") {
    return false;
  }
  if (profile === "production" || channel === "production") {
    return true;
  }
  return false;
}

/**
 * Environment / dogfood gates shared by product events and crash flush.
 * Does not check API key or Settings opt-out (those are path-specific).
 */
export function isPostHogCaptureEnvironmentAllowed(): boolean {
  if (reportingOverrideForTesting !== null) {
    return reportingOverrideForTesting;
  }
  if (__DEV__) {
    return false;
  }
  if (!isProductionPostHogBuild()) {
    return false;
  }
  if (isInternalDogfoodBuild()) {
    return false;
  }
  if (developerLeashUnlockActive || storeLeashPreviewActive) {
    return false;
  }
  return true;
}

/**
 * Single gate for product PostHog capture.
 * Real production users: key present, opted in, production channel, no dogfood flags.
 */
export function shouldReportToPostHog(): boolean {
  if (!posthogKey() || optOut) {
    return false;
  }
  return isPostHogCaptureEnvironmentAllowed();
}

export function isProductAnalyticsEnabled(): boolean {
  return shouldReportToPostHog();
}

export async function trackProductEvent(
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): Promise<void> {
  if (!shouldReportToPostHog()) {
    if (!optOut && !posthogKey() && isPostHogCaptureEnvironmentAllowed()) {
      await updateDeliveryMetrics((current) => ({
        ...current,
        missing_destination: current.missing_destination + 1,
        last_failure_at: new Date().toISOString(),
      }));
    }
    if (__DEV__) {
      console.debug("[analytics]", event, properties);
    }
    return;
  }

  try {
    const distinctId = await getDistinctId();
    const attribution = await getMarketingAttributionProperties();
    const attemptedAt = new Date().toISOString();
    const metrics = await updateDeliveryMetrics((current) => ({
      ...current,
      attempted: current.attempted + 1,
      last_attempt_at: attemptedAt,
    }));
    const response = await fetch(
      `${POSTHOG_HOST.replace(/\/+$/, "")}/capture/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: posthogKey(),
          event,
          properties: {
            distinct_id: distinctId,
            ...buildTelemetryEventIdentity(),
            telemetry_delivery_attempted: metrics.attempted,
            telemetry_delivery_delivered: metrics.delivered,
            telemetry_delivery_failed: metrics.failed,
            telemetry_missing_destination: metrics.missing_destination,
            ...attribution,
            ...properties,
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `PostHog capture failed with HTTP ${response.status ?? "unknown"}`,
      );
    }
    await updateDeliveryMetrics((current) => ({
      ...current,
      delivered: current.delivered + 1,
      last_success_at: new Date().toISOString(),
    }));
  } catch (error) {
    await updateDeliveryMetrics((current) => ({
      ...current,
      failed: current.failed + 1,
      last_failure_at: new Date().toISOString(),
    }));
    if (__DEV__) {
      console.debug("[analytics] capture failed", event, error);
    }
  }
}

export async function trackScreenView(screenName: string): Promise<void> {
  await trackProductEvent("screen_view", { screen: screenName });
}

export async function trackAppOpen(): Promise<void> {
  await trackProductEvent("app_open", { telemetry_canary: true });
}
