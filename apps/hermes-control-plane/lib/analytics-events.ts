/** Allowlisted first-party events. No Continuity / product-theater names. */
export const ANALYTICS_EVENTS = [
  "landing_view",
  "sign_in_click",
  "free_control_click",
  "hosted_checkout_click",
  // Landing example-tasks: per-job cta_id + closer.
  "example_task_click",
  "give_work_click",
  // Blog index + post CTA.
  "blog_cta_click",
  "watchdog_probe",
  "play_store_click",
  "app_store_click",
  // Aggregate browser exceptions (ClientErrorBeacon) — counter only, no stack/PII.
  "client_error",
  // Dashboard chrome (existing clients may emit).
  "dashboard_open_click",
] as const;

export const EVENTS = new Set<string>(ANALYTICS_EVENTS);

const LEGACY_EVENT_ALIASES: Record<string, string> = {
  // Existing clients may still beacon the pre-rename checkout event.
  cloud_continuity_click: "hosted_checkout_click",
};

export function resolveAnalyticsEvent(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const mapped = LEGACY_EVENT_ALIASES[raw] ?? raw;
  return EVENTS.has(mapped) ? mapped : null;
}
