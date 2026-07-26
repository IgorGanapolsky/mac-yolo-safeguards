import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import {
  hasAttribution,
  parseAttributionFromPayload,
  type FunnelAttribution,
} from "@/lib/funnel-attribution";

const FUNNEL_SCHEMA_VERSION = 1;
const EVENTS = new Set([
  "landing_view",
  "sign_in_click",
  "free_control_click",
  "cloud_continuity_click",
  "watchdog_probe",
  "play_store_click",
  "app_store_click",
  // Aggregate browser exceptions (ClientErrorBeacon) — counter only, no stack/PII.
  "client_error",
  // Dashboard chrome (existing clients may emit).
  "dashboard_open_click",
]);

type AnalyticsPayload = {
  schemaVersion?: number;
  event?: string;
  utmSource?: string;
  utm_source?: string;
  utmMedium?: string;
  utm_medium?: string;
  utmCampaign?: string;
  utm_campaign?: string;
  ctaId?: string;
  cta_id?: string;
};

async function bumpAggregate(day: string, event: string, now: number) {
  await db()
    .prepare(
      `INSERT INTO funnel_counters (day, event, count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(day, event) DO UPDATE SET
         count = funnel_counters.count + 1,
         updated_at = excluded.updated_at`,
    )
    .bind(day, event, now)
    .run();
}

async function bumpAttribution(
  day: string,
  event: string,
  attr: FunnelAttribution,
  now: number,
) {
  await db()
    .prepare(
      `INSERT INTO funnel_attribution_counters
         (day, event, utm_source, utm_medium, utm_campaign, cta_id, count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(day, event, utm_source, utm_medium, utm_campaign, cta_id) DO UPDATE SET
         count = funnel_attribution_counters.count + 1,
         updated_at = excluded.updated_at`,
    )
    .bind(
      day,
      event,
      attr.utmSource,
      attr.utmMedium,
      attr.utmCampaign,
      attr.ctaId,
      now,
    )
    .run();
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  // Attribution tokens are short; keep payload small (no free-form text).
  if (contentLength > 512) return jsonError("analytics payload is too large", 413);

  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    return jsonError("same-origin analytics only", 403);
  }

  const payload = (await request.json().catch(() => null)) as AnalyticsPayload | null;
  if (payload?.schemaVersion !== FUNNEL_SCHEMA_VERSION || !EVENTS.has(payload.event ?? "")) {
    return jsonError("unsupported analytics event");
  }

  const event = payload.event as string;
  const attr = parseAttributionFromPayload(payload);
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);

  try {
    await bumpAggregate(day, event, now);
    // Dual-write only when at least one sanitized campaign token is present.
    if (hasAttribution(attr)) {
      await bumpAttribution(day, event, attr, now);
    }
  } catch (error) {
    console.error("funnel_counter_write_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      {
        error: "analytics unavailable",
        code: "LEASH_ANALYTICS_UNAVAILABLE",
        retryAfterMs: 60_000,
        remediation: "Retry after the control-plane D1 migrations complete.",
      },
      { status: 503, headers: { "retry-after": "60" } },
    );
  }

  return new Response(null, { status: 204 });
}
