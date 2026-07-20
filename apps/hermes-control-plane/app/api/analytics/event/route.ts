import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

const FUNNEL_SCHEMA_VERSION = 1;
const EVENTS = new Set([
  "landing_view",
  "sign_in_click",
  "free_control_click",
  "cloud_continuity_click",
]);

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 256) return jsonError("analytics payload is too large", 413);

  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
    return jsonError("same-origin analytics only", 403);
  }

  const payload = await request.json().catch(() => null) as {
    schemaVersion?: number;
    event?: string;
  } | null;
  if (payload?.schemaVersion !== FUNNEL_SCHEMA_VERSION || !EVENTS.has(payload.event ?? "")) {
    return jsonError("unsupported analytics event");
  }

  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    await db().prepare(
      `INSERT INTO funnel_counters (day, event, count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(day, event) DO UPDATE SET
         count = funnel_counters.count + 1,
         updated_at = excluded.updated_at`,
    ).bind(day, payload.event, now).run();
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
