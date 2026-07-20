import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import appConfig from "../../app.json";

export const TELEMETRY_SCHEMA_VERSION = "1.0.0";

export type TelemetryPrimitive = string | number | boolean;

export interface TelemetryResourceIdentity {
  telemetry_schema_version: string;
  app: "hermes-mobile";
  app_identifier: string;
  eas_project_id: string;
  platform: string;
  app_version: string;
  build_number: string;
  release: string;
  environment: "development" | "production";
  runtime_version: string;
  update_id: string;
  update_channel: string;
  update_origin: "embedded" | "ota";
}

export interface TelemetryEventIdentity extends TelemetryResourceIdentity {
  telemetry_session_id: string;
  telemetry_event_id: string;
}

let sequence = 0;
let identityOverrideForTesting: Partial<TelemetryResourceIdentity> | null =
  null;
let idFactoryForTesting: ((kind: "session" | "event") => string) | null = null;

function createId(kind: "session" | "event"): string {
  if (idFactoryForTesting) {
    return idFactoryForTesting(kind);
  }
  sequence += 1;
  return `hm_${kind}_${Date.now()}_${sequence}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

let sessionId = createId("session");

function readUpdateValue(key: keyof typeof Updates): unknown {
  try {
    return Updates[key];
  } catch {
    return undefined;
  }
}

function text(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

/**
 * Stable resource attributes that make a provider row provably attributable
 * to one Hermes binary / OTA runtime instead of a generic analytics project.
 */
export function getTelemetryResourceIdentity(): TelemetryResourceIdentity {
  const expo = appConfig.expo;
  const appIdentifier =
    Platform.OS === "android"
      ? expo.android?.package
      : expo.ios?.bundleIdentifier;
  const buildNumber =
    Platform.OS === "android"
      ? Constants.expoConfig?.android?.versionCode
      : Constants.expoConfig?.ios?.buildNumber;
  const embedded = readUpdateValue("isEmbeddedLaunch") !== false;
  const identity: TelemetryResourceIdentity = {
    telemetry_schema_version: TELEMETRY_SCHEMA_VERSION,
    app: "hermes-mobile",
    app_identifier: text(appIdentifier, "com.iganapolsky.hermesmobile"),
    eas_project_id: text(
      Constants.expoConfig?.extra?.eas?.projectId,
      text(expo.extra?.eas?.projectId, "unknown"),
    ),
    platform: Platform.OS,
    app_version: text(expo.version, "unknown"),
    build_number: text(buildNumber, "unknown"),
    release: `hermes-mobile@${text(expo.version, "unknown")}`,
    environment: __DEV__ ? "development" : "production",
    runtime_version: text(
      readUpdateValue("runtimeVersion"),
      text(expo.version, "unknown"),
    ),
    update_id: text(
      readUpdateValue("updateId"),
      embedded ? "embedded" : "unknown",
    ),
    update_channel: text(
      process.env.EXPO_PUBLIC_UPDATES_CHANNEL || readUpdateValue("channel"),
      embedded ? "embedded" : "unknown",
    ),
    update_origin: embedded ? "embedded" : "ota",
  };
  return identityOverrideForTesting
    ? { ...identity, ...identityOverrideForTesting }
    : identity;
}

/** Per-event identity: stable resource attributes plus session and event IDs. */
export function buildTelemetryEventIdentity(): TelemetryEventIdentity {
  return {
    ...getTelemetryResourceIdentity(),
    telemetry_session_id: sessionId,
    telemetry_event_id: createId("event"),
  };
}

/** @internal Deterministic test seam; null restores runtime identity. */
export function __setTelemetryIdentityForTesting(
  identity: Partial<TelemetryResourceIdentity> | null,
  idFactory?: ((kind: "session" | "event") => string) | null,
): void {
  identityOverrideForTesting = identity;
  idFactoryForTesting = idFactory ?? null;
  sessionId = createId("session");
}
