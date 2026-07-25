import { getMemoryStats } from "@/lib/memory";
import { requireSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireSession();
    const stats = await getMemoryStats(session.organizationId, session.userId);
    return Response.json(stats);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("memory stats error:", error);
    return Response.json({ error: "Failed to get memory stats" }, { status: 500 });
  }
}