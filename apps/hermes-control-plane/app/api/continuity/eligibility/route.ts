import { buildContinuityEligibilityMatrix } from "@/lib/continuity-eligibility";

/**
 * Public Continuity eligibility matrix — no secrets, no workspace content.
 * Landing + llms.txt + ops canaries use this as the honest claim surface.
 */
export async function GET() {
  const matrix = buildContinuityEligibilityMatrix();
  return Response.json(
    {
      ok: true,
      service: "thumbgate-continuity-eligibility",
      checkedAt: Date.now(),
      ...matrix,
    },
    {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
