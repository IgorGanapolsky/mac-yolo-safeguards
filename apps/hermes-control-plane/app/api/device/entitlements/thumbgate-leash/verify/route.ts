import { requireDevice } from "@/lib/device-auth";
import { jsonError } from "@/lib/security";
import { verifyAndGrantThumbgateLeashEntitlement } from "@/lib/store-entitlement-grant";

export async function POST(request: Request) {
  const bodyText = await request.text();
  const identity = await requireDevice(request, bodyText);
  if (identity instanceof Response) return identity;

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const result = await verifyAndGrantThumbgateLeashEntitlement({
    identity,
    body: payload,
  });
  if (result instanceof Response) return result;

  return Response.json(
    {
      ok: true,
      plan: result.plan,
      entitlement: {
        thumbgate_leash: {
          active: true,
          product_id: result.entitlement.product_id,
          platform: result.entitlement.platform,
          expires_at: result.entitlement.expires_at,
          source: result.entitlement.source,
        },
      },
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
