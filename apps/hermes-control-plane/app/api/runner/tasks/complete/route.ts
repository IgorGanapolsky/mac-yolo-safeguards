import { runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { completeTask } from "@/lib/task-leases";

type CompletePayload = {
  taskId?: string;
  leaseToken?: string;
  result?: string;
  error?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
    provider?: string;
  } | null;
  externalCheckPassed?: boolean | null;
  externalCheckKind?: string | null;
  externalEvidenceId?: string | null;
};

export async function POST(request: Request) {
  const configured = runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied || supplied !== configured) return jsonError("runner authentication failed", 401);
  const runnerId = request.headers.get("x-hermes-runner")?.slice(0, 100) || "default";
  const payload = await request.json().catch(() => null) as CompletePayload | null;
  if (!payload?.taskId || !payload.leaseToken || (!payload.result && !payload.error)) {
    return jsonError("taskId, leaseToken, and result or error are required");
  }
  const completed = await completeTask({
    owner: `cloud:${runnerId}`,
    taskId: payload.taskId,
    leaseToken: payload.leaseToken,
    result: payload.result,
    error: payload.error,
    actorType: "runner",
    usage: payload.usage,
    externalCheckPassed: payload.externalCheckPassed,
    externalCheckKind: payload.externalCheckKind,
    externalEvidenceId: payload.externalEvidenceId,
  });
  return completed ? Response.json({ ok: true }) : jsonError("stale or invalid lease", 409);
}
