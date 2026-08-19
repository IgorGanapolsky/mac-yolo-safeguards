/**
 * Gated landing PostHog snippet. No-ops unless NEXT_PUBLIC_POSTHOG_KEY is set.
 * Captures landing_view + hosted_checkout_click only. No PII, no identify().
 */

export const POSTHOG_LANDING_EVENTS = ["landing_view", "hosted_checkout_click"] as const;
export type PosthogLandingEvent = (typeof POSTHOG_LANDING_EVENTS)[number];

export function posthogKeyFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  return String(env.NEXT_PUBLIC_POSTHOG_KEY || "").trim();
}

export function posthogHostFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const raw = String(env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").trim();
  return raw.replace(/\/$/, "") || "https://us.i.posthog.com";
}

export function shouldLoadPosthog(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return Boolean(posthogKeyFromEnv(env));
}

export function isPosthogLandingEvent(event: string): event is PosthogLandingEvent {
  return (POSTHOG_LANDING_EVENTS as readonly string[]).includes(event);
}

export function captureLandingEvent(event: string): void {
  if (!isPosthogLandingEvent(event)) return;
  const key = posthogKeyFromEnv();
  if (!key || typeof fetch === "undefined") return;
  const host = posthogHostFromEnv();
  void fetch(host + "/capture/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: "anonymous",
      properties: { $lib: "thumbgate-landing", $ip: null },
    }),
    keepalive: true,
  }).catch(() => {
    // never throw from analytics
  });
}
