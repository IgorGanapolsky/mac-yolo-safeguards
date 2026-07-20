import * as Sentry from "@sentry/react-native";
import {
  __setSentryConfigForTesting,
  captureException,
  captureMessage,
  initCrashReporting,
  isCrashReportingEnabled,
  withCrashReporting,
} from "../services/telemetry";
import { __setTelemetryIdentityForTesting } from "../services/telemetryIdentity";

const TEST_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";

describe("telemetry", () => {
  beforeEach(() => {
    __setSentryConfigForTesting({ dsn: "", tracesSampleRate: 0.2 });
    __setTelemetryIdentityForTesting({
      app_identifier: "com.iganapolsky.hermesmobile",
      eas_project_id: "eas-project-test",
      platform: "android",
      app_version: "1.2",
      build_number: "14",
      release: "hermes-mobile@1.2",
      environment: "production",
      runtime_version: "1.2",
      update_id: "ota-update-test",
      update_channel: "production",
      update_origin: "ota",
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    __setSentryConfigForTesting({ dsn: "", tracesSampleRate: 0.2 });
    __setTelemetryIdentityForTesting(null);
    jest.clearAllMocks();
  });

  describe("initCrashReporting", () => {
    it("is a no-op when no DSN is configured", () => {
      initCrashReporting();
      expect(Sentry.init).not.toHaveBeenCalled();
      expect(isCrashReportingEnabled()).toBe(false);
    });

    it("initializes Sentry when a DSN is present", () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();

      expect(Sentry.init).toHaveBeenCalledTimes(1);
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: TEST_DSN,
          tracesSampleRate: 0.2,
          release: "hermes-mobile@1.2",
          dist: "14",
          environment: "production",
          initialScope: {
            tags: expect.objectContaining({
              app: "hermes-mobile",
              app_identifier: "com.iganapolsky.hermesmobile",
              eas_project_id: "eas-project-test",
              telemetry_schema_version: "1.0.0",
              runtime_version: "1.2",
              update_id: "ota-update-test",
              update_channel: "production",
              update_origin: "ota",
            }),
            contexts: {
              hermes_release: expect.objectContaining({
                release: "hermes-mobile@1.2",
                build_number: "14",
              }),
            },
          },
        }),
      );
      expect(isCrashReportingEnabled()).toBe(true);
    });

    it("does not re-initialize on repeated calls", () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();
      initCrashReporting();
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });
  });

  describe("captureException", () => {
    it("is a no-op when crash reporting is disabled", () => {
      captureException(new Error("boom"));
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("forwards to Sentry with extra context when enabled", () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();
      const err = new Error("handled");
      captureException(err, { source: "unit_test" });

      expect(Sentry.captureException).toHaveBeenCalledWith(err, {
        extra: { source: "unit_test" },
      });
    });
  });

  describe("captureMessage", () => {
    it("is a no-op when crash reporting is disabled", () => {
      captureMessage("hello");
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it("forwards to Sentry when enabled", () => {
      __setSentryConfigForTesting({ dsn: TEST_DSN });
      initCrashReporting();
      captureMessage("gateway offline", { retries: 3 });

      expect(Sentry.captureMessage).toHaveBeenCalledWith("gateway offline", {
        extra: { retries: 3 },
      });
    });
  });

  describe("withCrashReporting", () => {
    it("wraps the component via Sentry.wrap", () => {
      const Root = () => null;
      const wrapped = withCrashReporting(Root);
      expect(Sentry.wrap).toHaveBeenCalledWith(Root);
      expect(wrapped).toBe(Root);
    });
  });
});
