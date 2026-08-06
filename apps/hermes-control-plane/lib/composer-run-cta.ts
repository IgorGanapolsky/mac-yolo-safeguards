/**
 * Pure composer primary CTA for Hermes Web "Run on" control.
 *
 * Continuity (cloud VPS) must NEVER require pairing a local computer.
 * Auto with Continuity entitlement must NEVER force pair either — Auto means
 * "Mac first when present, Continuity when unpaired / offline".
 *
 * Regression: owner selected Auto/Continuity but saw "Pair a computer first" (2026-08).
 */

export type RoutePreference = "local" | "cloud" | "auto";

export type ComposerRunCta = {
  /** pair → open Settings installer; run → submit form; upgrade → manage plan */
  kind: "pair" | "run" | "upgrade";
  label: string;
  disabled: boolean;
  /** test id */
  testId: "composer-pair-cta" | "composer-run-cta" | "composer-upgrade-cta";
  /** true when Continuity is the effective run target */
  isContinuity: boolean;
};

export function resolveComposerRunCta(input: {
  routePreference: RoutePreference;
  deviceCount: number;
  hasCloudAccess: boolean;
  busy?: boolean;
  /** Online paired machines (Auto can use local); offline/stale still count as "paired" for label only */
  onlineDeviceCount?: number;
}): ComposerRunCta {
  const busy = Boolean(input.busy);
  const { routePreference, deviceCount, hasCloudAccess } = input;
  const unpaired = deviceCount === 0;
  const online = input.onlineDeviceCount ?? deviceCount;

  // Explicit Continuity — never pair CTA
  if (routePreference === "cloud") {
    if (!hasCloudAccess) {
      return {
        kind: "upgrade",
        label: "Start Continuity (trial/Pro) →",
        disabled: busy,
        testId: "composer-upgrade-cta",
        isContinuity: true,
      };
    }
    return {
      kind: "run",
      label: "Run on Continuity (Cloud VPS) →",
      disabled: busy,
      testId: "composer-run-cta",
      isContinuity: true,
    };
  }

  // Auto: Continuity is a first-class path. Never force pair when cloud is entitled.
  if (routePreference === "auto") {
    if (hasCloudAccess && unpaired) {
      return {
        kind: "run",
        label: "Run on Continuity (Cloud VPS) →",
        disabled: busy,
        testId: "composer-run-cta",
        isContinuity: true,
      };
    }
    if (hasCloudAccess && !unpaired && online === 0) {
      // Mac listed but offline — Auto falls through to Continuity; do not demand re-pair.
      return {
        kind: "run",
        label: "Run on Continuity (Mac offline) →",
        disabled: busy,
        testId: "composer-run-cta",
        isContinuity: true,
      };
    }
    if (!hasCloudAccess && unpaired) {
      return {
        kind: "pair",
        label: "Pair a computer →",
        disabled: busy,
        testId: "composer-pair-cta",
        isContinuity: false,
      };
    }
    // Auto + online Mac (with or without cloud)
    return {
      kind: "run",
      label: "Run task →",
      disabled: busy,
      testId: "composer-run-cta",
      isContinuity: false,
    };
  }

  // Local only, no machine → pair
  if (routePreference === "local" && unpaired) {
    return {
      kind: "pair",
      label: "Pair a computer →",
      disabled: busy,
      testId: "composer-pair-cta",
      isContinuity: false,
    };
  }

  // Local with a machine
  return {
    kind: "run",
    label: "Run task →",
    disabled: busy,
    testId: "composer-run-cta",
    isContinuity: false,
  };
}

/** Effective route sent to POST /api/tasks */
export function resolveEffectiveRoutePreference(input: {
  routePreference: RoutePreference;
  deviceCount: number;
  hasCloudAccess: boolean;
  onlineDeviceCount?: number;
}): RoutePreference {
  if (input.routePreference === "cloud") return "cloud";
  if (input.routePreference === "auto" && input.hasCloudAccess) {
    const online = input.onlineDeviceCount ?? input.deviceCount;
    // Unpaired or no online Mac → Continuity (do not 409 for missing device)
    if (input.deviceCount === 0 || online === 0) return "cloud";
  }
  return input.routePreference;
}

/** Select option label for Auto mode (honest, never forces pair when Continuity is entitled). */
export function resolveAutoRouteLabel(input: {
  hasCloudAccess: boolean;
  deviceLabel: string | null;
  onlineDeviceCount: number;
  deviceCount: number;
}): string {
  if (input.deviceCount > 0 && input.deviceLabel) {
    if (input.onlineDeviceCount > 0) {
      return input.hasCloudAccess
        ? `Auto — ${input.deviceLabel} first, then Continuity`
        : `Auto — ${input.deviceLabel}`;
    }
    // Offline Mac still listed
    return input.hasCloudAccess
      ? `Auto — Continuity while ${input.deviceLabel} is offline`
      : `Auto — wait for ${input.deviceLabel} (no Continuity)`;
  }
  if (input.hasCloudAccess) {
    return "Auto — Continuity (no Mac required)";
  }
  return "Auto — needs a paired Mac (or Continuity plan)";
}
