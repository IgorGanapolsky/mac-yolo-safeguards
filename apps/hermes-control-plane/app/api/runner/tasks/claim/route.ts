import { runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { claimTask } from "@/lib/task-leases";
import { buildHostedExecutionPrompt } from "@/lib/cloud-tool-policy";

export async function POST(request: Request) {
  const configured = runtimeEnv().HERMES_CLOUD_RUNNER_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied || supplied !== configured) return jsonError("runner authentication failed", 401);
  const runnerId = request.headers.get("x-hermes-runner")?.slice(0, 100) || "default";
  const claim = await claimTask({ route: "cloud", owner: `cloud:${runnerId}` });
  if (!claim) return new Response(null, { status: 204 });

  const sanitizeUserMessage = (message: { role: string; content: string }) => message.role === "user"
    ? { ...message, content: buildHostedExecutionPrompt(message.content) }
    : message;
  return Response.json({
    task: {
      ...claim.task,
      prompt: buildHostedExecutionPrompt(claim.task.prompt),
      contextMessages: claim.task.contextMessages.map(sanitizeUserMessage),
      handoffMessages: claim.task.handoffMessages.map(sanitizeUserMessage),
    },
  });
}
