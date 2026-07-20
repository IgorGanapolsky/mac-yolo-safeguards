jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { versionCode: 14 },
      ios: { buildNumber: "17" },
      extra: { eas: { projectId: "eas-project-test" } },
    },
  },
}));

jest.mock("expo-updates", () => ({
  channel: "production",
  isEmbeddedLaunch: false,
  runtimeVersion: "1.2",
  updateId: "ota-update-test",
}));

import {
  __setTelemetryIdentityForTesting,
  buildTelemetryEventIdentity,
  getTelemetryResourceIdentity,
  TELEMETRY_SCHEMA_VERSION,
} from "../services/telemetryIdentity";
import { Platform } from "react-native";

describe("telemetryIdentity", () => {
  afterEach(() => {
    __setTelemetryIdentityForTesting(null);
    delete process.env.EXPO_PUBLIC_UPDATES_CHANNEL;
  });

  it("attributes a runtime to the Hermes app, package, EAS project, and OTA", () => {
    process.env.EXPO_PUBLIC_UPDATES_CHANNEL = "production";
    expect(getTelemetryResourceIdentity()).toEqual(
      expect.objectContaining({
        telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
        app: "hermes-mobile",
        app_identifier: "com.iganapolsky.hermesmobile",
        eas_project_id: "eas-project-test",
        app_version: "1.2",
        build_number: Platform.OS === "android" ? "14" : "17",
        release: "hermes-mobile@1.2",
        runtime_version: "1.2",
        update_id: "ota-update-test",
        update_channel: "production",
        update_origin: "ota",
      }),
    );
  });

  it("adds deterministic session and event identities to each event", () => {
    let eventSequence = 0;
    __setTelemetryIdentityForTesting({ environment: "production" }, (kind) =>
      kind === "session" ? "session-test" : `event-${++eventSequence}`,
    );

    const first = buildTelemetryEventIdentity();
    const second = buildTelemetryEventIdentity();
    expect(first.telemetry_session_id).toBe("session-test");
    expect(second.telemetry_session_id).toBe("session-test");
    expect(first.telemetry_event_id).toBe("event-1");
    expect(second.telemetry_event_id).toBe("event-2");
  });
});
