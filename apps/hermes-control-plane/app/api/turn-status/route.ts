import { currentSession } from "@/lib/auth";
import { HOSTED_PROVIDER_FALLBACK } from "@/lib/hosted-model-fallback.js";
import { db } from "@/lib/runtime";
import { jsonError } from "@/lib/security";

export const dynamic = "force-dynamic";

type LastCall = {
  provider: string | null;
  model: string | null;
  cost_usd: string | number | null;
};

export async function GET() {
  const session = await currentSession().catch(() => null);
  if (!session) return jsonError("sign in required", 401);

  const primary = HOSTED_PROVIDER_FALLBACK[0];
  let last: LastCall | null = null;
  try {
    last = await db()
      .prepare(
        `SELECT provider, model, cost_usd
           FROM llm_calls
          WHERE organization_id = ?
          ORDER BY created_at DESC
          LIMIT 1`,
      )
      .bind(session.organizationId)
      .first<LastCall>();
  } catch {
    last = null;
  }

  const costRaw = last?.cost_usd;
  const costUsd =
    costRaw == null || costRaw === ""
      ? null
      : Number(costRaw);

  return Response.json(
    {
      providerLabel: last?.provider || primary.label,
      model: last?.model || primary.model,
      ttftMs: null,
      costUsd: Number.isFinite(costUsd) ? costUsd : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
