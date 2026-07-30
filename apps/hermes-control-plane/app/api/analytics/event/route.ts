import { jsonError } from "@/lib/security";
import { parseAttributionFromPayload } from "@/lib/funnel-attribution";
import { recordFunnelEvent } from "@/lib/funnel-counter";

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

const ALLOWED_ERROR_CLASSES = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "URIError",
  "EvalError",
  "AggregateError",
  "OtherError",
]);

type AnalyticsPayload = {
  schemaVersion?: number;
  event?: string;
  /** Allowlisted Error.name only (ClientErrorBeacon). Never free-form. */
  errorClass?: string;
  utmSource?: string;
  utm_source?: string;
  utmMedium?: string;
  utm_medium?: string;
  utmCampaign?: string;
  utm_campaign?: string;
  ctaId?: string;
  cta_id?: string;
};

function sanitizeErrorClass(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!ALLOWED_ERROR_CLASSES.has(value)) return null;
  return value;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  // Attribution tokens are short; keep payload small (no free-form text).
  if (contentLength > 512) return jsonError("analytics payload is too large", 413);

  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    return jsonError("same-origin analytics only", 403);
  }

  const payload = (await request
    .json()
    .catch(() => null)) as AnalyticsPayload | null;
  if (
    payload?.schemaVersion !== FUNNEL_SCHEMA_VERSION ||
    !EVENTS.has(payload.event ?? "")
  ) {
    return jsonError("unsupported analytics event");
  }

  const event = payload.event as string;
  const attr = parseAttributionFromPayload(payload);
  const errorClass =
    event === "client_error" ? sanitizeErrorClass(payload.errorClass) : null;
  const now = Date.now();

  try {
    await recordFunnelEvent(event, attr, now);
    // Class histogram for triage (still content-free — name only).
    if (errorClass) {
      await recordFunnelEvent(
        `client_error_class_${errorClass}`,
        {
          utmSource: "",
          utmMedium: "",
          utmCampaign: "",
          ctaId: "",
        },
        now,
      );
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
