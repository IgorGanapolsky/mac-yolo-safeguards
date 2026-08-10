import { collectExpertiseData } from "@/lib/expertise-data";

/**
 * Public expertise telemetry — the raw JSON behind /expertise.
 *
 * This endpoint is advertised in four places and was returning 404 in production:
 *   - app/expertise/ExpertiseClient.tsx fetches it to render the live stat tiles
 *   - the same component links visitors to it as a public data source
 *   - app/page.tsx tells readers "raw JSON endpoint at /api/expertise/stats"
 *   - app/llms.txt/route.ts publishes it to AI crawlers as the live stats endpoint
 *
 * So the expertise page's headline claim — that its numbers come from live D1 —
 * was silently broken, and llms.txt was pointing crawlers at a dead URL.
 * tests/expertise-editorial.test.mjs was already asserting this file exists; it was
 * failing on main, not passing and then regressed.
 *
 * No auth: it is documented as public and contains only aggregates. Everything
 * sensitive is excluded upstream in collectExpertiseData (canary runs are filtered,
 * and the privacy boundary is documented there rather than re-implemented here).
 */

// Aggregates are computed from D1 at request time; caching at the edge would serve
// a stale success rate on a page whose whole point is that the number is live.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await collectExpertiseData();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Five minutes: long enough to absorb crawler and dashboard traffic,
        // short enough that a published figure is never badly out of date.
        "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    // A telemetry endpoint must not 500 the marketing page it feeds. Report the
    // failure honestly instead of emitting zeros, which would read as real data
    // saying the product has no usage.
    const message = error instanceof Error ? error.message : "unknown error";
    return new Response(JSON.stringify({ error: "expertise stats unavailable", detail: message }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
