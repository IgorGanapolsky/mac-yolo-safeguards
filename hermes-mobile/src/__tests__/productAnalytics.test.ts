jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { versionCode: 4 },
      ios: { buildNumber: "1" },
      extra: { eas: { projectId: "eas-project-test" } },
    },
  },
}));

jest.mock("expo-updates", () => ({
  channel: "production",
  isEnabled: true,
  isEmbeddedLaunch: false,
  runtimeVersion: "1.2",
  updateId: "ota-update-test",
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearMarketingAttribution,
  recordAttributionFromUrl,
} from "../services/marketingAttribution";
import {
  __setShouldReportToPostHogForTesting,
  getProductAnalyticsDeliveryMetrics,
  isProductAnalyticsEnabled,
  isProductionPostHogBuild,
  setPostHogDogfoodExclusions,
  setProductAnalyticsOptOut,
  shouldReportToPostHog,
  trackAppOpen,
  trackProductEvent,
} from "../services/productAnalytics";
import { __setTelemetryIdentityForTesting } from "../services/telemetryIdentity";

describe("productAnalytics", () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearMarketingAttribution();
    setProductAnalyticsOptOut(false);
    setPostHogDogfoodExclusions({
      developerLeashUnlock: false,
      storeLeashPreview: false,
    });
    __setShouldReportToPostHogForTesting(null);
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    delete process.env.EXPO_PUBLIC_POSTHOG_INTERNAL;
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.EXPO_PUBLIC_EAS_PROFILE;
    delete process.env.EXPO_PUBLIC_UPDATES_CHANNEL;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EAS_BUILD_PROFILE = "production";
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    let eventSequence = 0;
    __setTelemetryIdentityForTesting(
      {
        environment: "production",
        platform: "android",
        build_number: "14",
      },
      (kind) =>
        kind === "session" ? "session-test" : `event-${++eventSequence}`,
    );
  });

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    __setShouldReportToPostHogForTesting(null);
    setPostHogDogfoodExclusions({
      developerLeashUnlock: false,
      storeLeashPreview: false,
    });
    __setTelemetryIdentityForTesting(null);
  });

  it("retains a measurable destination gap when the PostHog key is missing", async () => {
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent("test_event");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await getProductAnalyticsDeliveryMetrics()).toEqual(
      expect.objectContaining({
        attempted: 0,
        delivered: 0,
        failed: 0,
        missing_destination: 1,
      }),
    );
  });

  it("captures events when key is configured on production builds", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = "phc_test";
    await trackProductEvent("mac_scan_complete", { found_count: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/capture/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.event).toBe("mac_scan_complete");
    expect(body.properties.found_count).toBe(2);
    expect(body.properties).toEqual(
      expect.objectContaining({
        app: "hermes-mobile",
        app_identifier: "com.iganapolsky.hermesmobile",
        eas_project_id: "eas-project-test",
        release: "hermes-mobile@1.2",
        runtime_version: "1.2",
        update_id: "ota-update-test",
        update_channel: "production",
        update_origin: "ota",
        telemetry_schema_version: "1.0.0",
        telemetry_session_id: "session-test",
        telemetry_event_id: "event-1",
        telemetry_delivery_attempted: 1,
        telemetry_delivery_delivered: 0,
        telemetry_delivery_failed: 0,
        telemetry_missing_destination: 0,
      }),
    );
    expect(await getProductAnalyticsDeliveryMetrics()).toEqual(
      expect.objectContaining({ attempted: 1, delivered: 1, failed: 0 }),
    );
  });

  it("marks app_open as the deterministic production canary", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = "phc_test";
    await trackAppOpen();
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.event).toBe("app_open");
    expect(body.properties.telemetry_canary).toBe(true);
  });

  it("counts a non-2xx provider response as failed delivery", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = "phc_test";
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });
    await trackProductEvent("provider_failure");
    expect(await getProductAnalyticsDeliveryMetrics()).toEqual(
      expect.objectContaining({ attempted: 1, delivered: 0, failed: 1 }),
    );
  });

  it("attaches first and last marketing attribution properties", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = "phc_test";
    await recordAttributionFromUrl(
      "hermes://chat?utm_source=applovin&utm_medium=cpp&utm_campaign=day0-paywall&campaign_id=c-1&creative_id=cr-9",
      Date.parse("2026-07-01T12:00:00Z"),
    );
    await trackProductEvent("leash_purchase_result", { status: "purchased" });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.properties.attribution_source).toBe("applovin");
    expect(body.properties.attribution_medium).toBe("cpp");
    expect(body.properties.attribution_campaign).toBe("day0-paywall");
    expect(body.properties.attribution_campaign_id).toBe("c-1");
    expect(body.properties.attribution_creative_id).toBe("cr-9");
    expect(body.properties.attribution_window).toBe("day0");
    expect(body.properties.first_attribution_source).toBe("applovin");
    expect(body.properties.status).toBe("purchased");
  });

  it("respects opt-out", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = "phc_test";
    setProductAnalyticsOptOut(true);
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent("ignored");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  describe("shouldReportToPostHog", () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_POSTHOG_API_KEY = "phc_test";
      process.env.EAS_BUILD_PROFILE = "production";
      (global as { __DEV__?: boolean }).__DEV__ = false;
    });

    it("allows production builds with key", () => {
      expect(isProductionPostHogBuild()).toBe(true);
      expect(shouldReportToPostHog()).toBe(true);
    });

    it("skips __DEV__", () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      expect(shouldReportToPostHog()).toBe(false);
      expect(isProductAnalyticsEnabled()).toBe(false);
    });

    it("skips non-production EAS profile", () => {
      process.env.EAS_BUILD_PROFILE = "preview";
      expect(isProductionPostHogBuild()).toBe(false);
      expect(shouldReportToPostHog()).toBe(false);
    });

    it("skips non-production updates channel", () => {
      delete process.env.EAS_BUILD_PROFILE;
      process.env.EXPO_PUBLIC_UPDATES_CHANNEL = "preview";
      expect(isProductionPostHogBuild()).toBe(false);
      expect(shouldReportToPostHog()).toBe(false);
    });

    it("skips developerLeashUnlock dogfood", () => {
      setPostHogDogfoodExclusions({ developerLeashUnlock: true });
      expect(shouldReportToPostHog()).toBe(false);
    });

    it("skips store leash preview", () => {
      setPostHogDogfoodExclusions({ storeLeashPreview: true });
      expect(shouldReportToPostHog()).toBe(false);
    });

    it("skips EXPO_PUBLIC_POSTHOG_INTERNAL dogfood builds", () => {
      process.env.EXPO_PUBLIC_POSTHOG_INTERNAL = "1";
      expect(shouldReportToPostHog()).toBe(false);
    });

    it("does not send events when gated off", async () => {
      setPostHogDogfoodExclusions({ developerLeashUnlock: true });
      await trackProductEvent("leash_purchase_result", { status: "purchased" });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
