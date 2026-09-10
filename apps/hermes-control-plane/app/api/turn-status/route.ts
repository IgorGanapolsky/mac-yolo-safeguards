import { currentSession } from "@/lib/auth";
import { probeRunnerHealth } from "@/lib/hosted-apphost";
import { jsonError } from "@/lib/security";
import { labelForLiveModel } from "@/lib/turn-statusline";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession().catch(() => null);
  if (!session) return jsonError("sign in required", 401);

  const health = await probeRunnerHealth({ timeoutMs: 2500 }).catch(() => null);
  const model = health?.model ?? null;
  const modelHost = health?.modelHost ?? null;
  return Response.json(
    {
      providerLabel: labelForLiveModel(model, modelHost),
      model: model || "fly",
      modelHost,
      ttftMs: null,
      costUsd: null,
      source: "hosted-runner-health",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
