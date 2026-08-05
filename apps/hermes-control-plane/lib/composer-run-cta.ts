/**
 * Pure composer primary CTA for Hermes Web "Run on" control.
 *
 * Continuity (cloud VPS) must NEVER require pairing a local computer.
 * Pairing is only required for local / Auto-without-cloud modes.
 *
 * Regression: owner selected Continuity but saw "Pair a computer first" (2026-08).
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
}): ComposerRunCta {
  const busy = Boolean(input.busy);
  const { routePreference, deviceCount, hasCloudAccess } = input;
  const unpaired = deviceCount === 0;

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

  // Auto, unpaired: Continuity if entitled, else pair
  if (routePreference === "auto" && unpaired) {
    if (hasCloudAccess) {
      return {
        kind: "run",
        label: "Run on Continuity (Cloud VPS) →",
        disabled: busy,
        testId: "composer-run-cta",
        isContinuity: true,
      };
    }
    return {
      kind: "pair",
      label: "Pair a computer →",
      disabled: busy,
      testId: "composer-pair-cta",
      isContinuity: false,
    };
  }

  // Paired local or auto with a machine
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
}): RoutePreference {
  if (input.routePreference === "cloud") return "cloud";
  if (input.deviceCount === 0 && input.hasCloudAccess && input.routePreference === "auto") {
    return "cloud";
  }
  return input.routePreference;
}
