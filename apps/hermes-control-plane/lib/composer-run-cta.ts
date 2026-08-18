/**
 * Pure composer primary CTA. Hosted VPS is the only public route.
 * No local / Auto / pair picker. Composer is just Run with Output.
 */

export type RoutePreference = "local" | "cloud" | "auto";

export type ComposerRunCta = {
  /** run → submit form; upgrade → manage plan. Pair is not a public composer choice. */
  kind: "run" | "upgrade";
  label: string;
  disabled: boolean;
  testId: "composer-run-cta" | "composer-upgrade-cta";
  /** true when the hosted VPS is the effective run target */
  isContinuity: boolean;
};

export function resolveComposerRunCta(input: {
  hasCloudAccess: boolean;
  busy?: boolean;
  /** ignored — hosted VPS is the only route */
  routePreference?: RoutePreference;
  deviceCount?: number;
  onlineDeviceCount?: number;
}): ComposerRunCta {
  const busy = Boolean(input.busy);
  if (!input.hasCloudAccess) {
    return {
      kind: "upgrade",
      label: "Start trial or Pro →",
      disabled: busy,
      testId: "composer-upgrade-cta",
      isContinuity: true,
    };
  }
  return {
    kind: "run",
    label: "Run →",
    disabled: busy,
    testId: "composer-run-cta",
    isContinuity: true,
  };
}

/** Effective route sent to POST /api/tasks — always hosted VPS. */
export function resolveEffectiveRoutePreference(_input?: {
  routePreference?: RoutePreference;
  deviceCount?: number;
  hasCloudAccess?: boolean;
  onlineDeviceCount?: number;
}): "cloud" {
  return "cloud";
}
