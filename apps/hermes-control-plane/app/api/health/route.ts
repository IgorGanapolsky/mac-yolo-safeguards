import { db } from "@/lib/runtime";

export async function GET() {
  try {
    const schema = await db().prepare(
      `SELECT COUNT(*) AS table_count
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('organizations', 'funnel_counters')`,
    ).first<{ table_count: number }>();
    if (Number(schema?.table_count) !== 2) {
      throw new Error("required D1 migrations are missing");
    }
    return Response.json({
      ok: true,
      service: "leash-control",
      database: "available",
      schema: "current",
    });
  } catch (error) {
    console.error("control_plane_health_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      {
        ok: false,
        service: "leash-control",
        database: "unavailable",
        schema: "unknown",
        code: "LEASH_DATABASE_UNAVAILABLE",
        retryAfterMs: 60_000,
        remediation: "Apply the control-plane D1 migrations before serving traffic.",
      },
      { status: 503, headers: { "retry-after": "60" } },
    );
  }
}
