import { db, runtimeEnv } from "@/lib/runtime";
import { jsonError } from "@/lib/security";
import { claimTask } from "@/lib/task-leases";
import { buildHostedExecutionPrompt } from "@/lib/cloud-tool-policy";
import { loadTaskAttachments } from "@/lib/task-files";

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
  let attachments: Awaited<ReturnType<typeof loadTaskAttachments>> = [];
  try {
    attachments = await loadTaskAttachments(db(), {
      organizationId: claim.task.organizationId,
      taskId: claim.task.id,
    });
  } catch {
    attachments = [];
  }
  return Response.json({
    task: {
      ...claim.task,
      prompt: buildHostedExecutionPrompt(claim.task.prompt),
      attachments,
      contextMessages: claim.task.contextMessages.map(sanitizeUserMessage),
      handoffMessages: claim.task.handoffMessages.map(sanitizeUserMessage),
    },
  });
}
