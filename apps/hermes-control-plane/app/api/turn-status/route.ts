import { currentSession } from "@/lib/auth";
import { HOSTED_PROVIDER_FALLBACK } from "@/lib/hosted-model-fallback.js";
import { jsonError } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession().catch(() => null);
  if (!session) return jsonError("sign in required", 401);

  const primary = HOSTED_PROVIDER_FALLBACK[0];
  // llm_calls is declared in schema.ts but has no drizzle migration and no INSERT
  // path. Do not query it: a missing table is not a last-turn sample.
  return Response.json(
    {
      providerLabel: primary.label,
      model: primary.model,
      ttftMs: null,
      costUsd: null,
      source: "hosted-fallback",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
