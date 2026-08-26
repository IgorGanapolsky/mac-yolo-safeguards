import { requireSession } from "@/lib/auth";
import { publicRunReceipt } from "@/lib/hosted-source-of-truth";
import { db } from "@/lib/runtime";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

interface TaskRow {
  id: string;
  threadId: string;
  threadTitle: string;
  prompt: string;
  status: string;
  route: string;
  result: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deviceName: string | null;
}

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: PRIVATE_NO_STORE });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return errorResponse("sign in required", 401);
  }

  const { taskId } = await params;
  const task = await db().prepare(
    `SELECT k.id, k.thread_id AS threadId, COALESCE(t.title_override, t.title) AS threadTitle,
            k.prompt, k.status, k.route, k.result, k.error,
            k.created_at AS createdAt, k.updated_at AS updatedAt,
            k.completed_at AS completedAt, d.name AS deviceName
       FROM tasks k
       JOIN threads t ON t.id = k.thread_id AND t.organization_id = k.organization_id
       LEFT JOIN devices d ON d.id = k.device_id
      WHERE k.id = ? AND k.organization_id = ? AND t.deleted_at IS NULL
      LIMIT 1`,
  ).bind(taskId, session.organizationId).first<TaskRow>();

  if (!task) return errorResponse("task not found", 404);

  return Response.json({
    task,
    receipt: publicRunReceipt({
      taskId: task.id,
      route: task.route,
      status: task.status,
    }),
  }, { headers: PRIVATE_NO_STORE });
}
