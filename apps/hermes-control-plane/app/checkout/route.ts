import { currentSession } from "@/lib/auth";
import { hasCloudContinuationAccess } from "@/lib/entitlements";

export async function GET() {
  // Already entitled (trial/pro/team) → dashboard, not another checkout wall.
  // Free signed-in strangers still need the POST checkout auto-submit.
  try {
    const session = await currentSession();
    if (session && hasCloudContinuationAccess(session)) {
      return new Response(null, {
        status: 307,
        headers: { Location: "/dashboard" },
      });
    }
  } catch {
    // Fall through to checkout form.
  }
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Start hosted Hermes</title><form id="hosted-checkout" action="/api/billing/checkout" method="POST"></form><script>document.getElementById("hosted-checkout").submit()</script>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export const HEAD = GET;
