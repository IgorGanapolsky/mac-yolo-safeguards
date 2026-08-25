import { requireDevice } from "@/lib/device-auth";
import { fetchDeviceCloudTaskStatus } from "@/lib/device-cloud-task";
import { jsonError } from "@/lib/security";

export async function POST(request: Request) {
  const body = await request.text();
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;

  let payload: { taskId?: string };
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (!payload.taskId?.trim()) return jsonError("taskId is required");

  const task = await fetchDeviceCloudTaskStatus(identity, payload.taskId.trim());
  if (!task) return jsonError("task not found", 404);

  return Response.json({ task });
}
