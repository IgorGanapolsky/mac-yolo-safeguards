/** Guards that block shipping broken or wrong Android APKs to Firebase / Play. */

export const EMBEDDED_JS_BUNDLE_PATH = 'assets/index.android.bundle';

export const EXPECTED_ANDROID_PACKAGE = 'com.iganapolsky.hermesmobile';
export const EXPECTED_APP_LABEL = 'Hermes Mobile';
export const FORBIDDEN_APP_LABEL = 'Hermes Mobile Agent';

/** Legacy native shell copy — must never ship from this Expo repo. */
export const LEGACY_SHELL_STRING_MARKERS = [
  'Hold the cord on your AI',
  'Hermes Mobile Agent intercepts dangerous',
] as const;

export const METRO_CRASH_MARKER = 'Unable to load script';

export type ApkZipInspection = {
  entries: string[];
  /** Printable strings sampled from APK (dex + bundle). */
  sampledStrings: string[];
  packageName?: string;
  applicationLabel?: string;
};

export function apkHasEmbeddedJsBundle(entries: string[]): boolean {
  return entries.some(
    (entry) => entry === EMBEDDED_JS_BUNDLE_PATH || entry.endsWith(`/${EMBEDDED_JS_BUNDLE_PATH}`),
  );
}

export function apkContainsLegacyShellMarkers(sampledStrings: string[]): string[] {
  const haystack = sampledStrings.join('\n');
  return LEGACY_SHELL_STRING_MARKERS.filter((marker) => haystack.includes(marker));
}

/** Minified bundle may not retain literal `expo/modules` — use app fingerprints too. */
export const EXPO_APP_BUNDLE_MARKERS = [
  'expo/modules',
  'HERMES CHAT',
  'GatewayProvider',
] as const;

export function apkContainsExpoModules(sampledStrings: string[]): boolean {
  const haystack = sampledStrings.join('\n');
  return EXPO_APP_BUNDLE_MARKERS.some((marker) => haystack.includes(marker));
}

export type ApkReleaseGuardResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function verifyApkReleaseGuards(inspection: ApkZipInspection): ApkReleaseGuardResult {
  const errors: string[] = [];

  if (!apkHasEmbeddedJsBundle(inspection.entries)) {
    errors.push(
      'APK has no embedded JS bundle (assets/index.android.bundle). Debug builds require Metro and will crash on device.',
    );
  }

  if (inspection.packageName && inspection.packageName !== EXPECTED_ANDROID_PACKAGE) {
    errors.push(`APK package ${inspection.packageName} != ${EXPECTED_ANDROID_PACKAGE}`);
  }

  if (inspection.applicationLabel === FORBIDDEN_APP_LABEL) {
    errors.push(`APK is the legacy native shell (${FORBIDDEN_APP_LABEL}), not Expo Hermes Mobile`);
  }

  if (inspection.applicationLabel && inspection.applicationLabel !== EXPECTED_APP_LABEL) {
    errors.push(`Unexpected application label '${inspection.applicationLabel}' (expected '${EXPECTED_APP_LABEL}')`);
  }

  const legacyMarkers = apkContainsLegacyShellMarkers(inspection.sampledStrings);
  if (legacyMarkers.length > 0) {
    errors.push(`APK contains legacy shell UI markers: ${legacyMarkers.join(', ')}`);
  }

  if (!apkContainsExpoModules(inspection.sampledStrings)) {
    errors.push('APK does not contain Expo modules — not the Hermes Mobile Expo build');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
