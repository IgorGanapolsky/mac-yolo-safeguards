import { requireDevice } from "@/lib/device-auth";
import { submitDeviceCloudTask } from "@/lib/device-cloud-task";
import { RouteSchemas, validateRoute } from "@/lib/schema-validator";
import { jsonError } from "@/lib/security";

type DeviceSubmitPayload = {
  prompt: string;
  threadId?: string;
  routePreference: "local" | "cloud" | "auto";
  contextMessages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  idempotencyKey?: string;
  traceId?: string;
  source?: string;
};

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(body || "{}");
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const validation = validateRoute<DeviceSubmitPayload>(RouteSchemas.deviceSubmitTask, rawPayload);
  if (!validation.ok) {
    return jsonError(`invalid request: ${validation.errors.join("; ")}`, 400);
  }
  const payload = validation.value as DeviceSubmitPayload;

  const result = await submitDeviceCloudTask({
    identity,
    prompt: payload.prompt,
    threadId: payload.threadId,
    routePreference: payload.routePreference,
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
