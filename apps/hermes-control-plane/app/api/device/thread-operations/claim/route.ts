import { requireDevice } from "@/lib/device-auth";
import { claimThreadOperation } from "@/lib/thread-operations";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  const claim = await claimThreadOperation({ owner: `device:${identity.id}`, deviceId: identity.id });
  return claim ? Response.json(claim) : new Response(null, { status: 204 });
}
