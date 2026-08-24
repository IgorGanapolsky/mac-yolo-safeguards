import { requireDevice } from "@/lib/device-auth";
import { submitDeviceCloudTask } from "@/lib/device-cloud-task";
import { jsonError } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;

  let payload: {
    prompt?: string;
    threadId?: string;
    routePreference?: string;
    contextMessages?: Array<{ role?: string; content?: string }>;
    idempotencyKey?: string;
    traceId?: string;
    source?: string;
  };
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (!payload.prompt?.trim()) return jsonError("prompt is required");

  const result = await submitDeviceCloudTask({
    identity,
    prompt: payload.prompt,
    threadId: payload.threadId,
    routePreference: payload.routePreference ?? "cloud",
    contextMessages: payload.contextMessages,
    idempotencyKey: payload.idempotencyKey,
    traceId: payload.traceId,
    source: payload.source,
  });

  if (result instanceof Response) return result;

  return Response.json(
    {
      task: result.task,
      receipt: result.receipt,
      traceId: result.traceId,
    },
    {
      status: 201,
      headers: { "x-thumbgate-trace-id": result.traceId },
    },
  );
}
