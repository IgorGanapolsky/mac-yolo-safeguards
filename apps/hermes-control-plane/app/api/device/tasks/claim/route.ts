import { requireDevice } from "@/lib/device-auth";
import { runtimeEnv } from "@/lib/runtime";
import { claimTask } from "@/lib/task-leases";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;
  let claim = await claimTask({ route: "local", owner: `device:${identity.id}`, deviceId: identity.id });
  // E2E / local Worker has no hosted runner token. The Mac connector is the
  // only claimant, so cloud_pending rows must not sit forever unclaimed.
  if (!claim && !runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN) {
    claim = await claimTask({ route: "cloud", owner: `device:${identity.id}` });
  }
  return claim ? Response.json(claim) : new Response(null, { status: 204 });
}
