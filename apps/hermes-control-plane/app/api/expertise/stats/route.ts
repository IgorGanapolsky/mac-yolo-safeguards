import { collectExpertiseData } from "@/lib/expertise-data";

/**
 * Public, cacheable expertise telemetry for thumbgate.app/expertise and llms.txt.
 * No session required — aggregates only; synthetic canaries are excluded in collectExpertiseData.
 */
export async function GET() {
  try {
    const data = await collectExpertiseData();
    return Response.json(data, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "expertise stats unavailable";
    return Response.json(
      { error: message },
      {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }
}
