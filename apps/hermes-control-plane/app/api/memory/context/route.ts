import { getAgentContext, updateAgentContext, listAgentContexts } from "@/lib/memory/agent-context";
import { requireSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");

    if (agentId) {
      const context = await getAgentContext(session.organizationId, agentId);
      return Response.json(context);
    }

    const contexts = await listAgentContexts(session.organizationId);
    return Response.json(contexts);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("agent context get error:", error);
    return Response.json({ error: "Failed to get agent context" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { agent_id, context, metadata } = body;

    if (!agent_id || !context) {
      return Response.json({ error: "agent_id and context required" }, { status: 400 });
    }

    const result = await updateAgentContext(session.organizationId, agent_id, context, metadata, session.userId);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("agent context update error:", error);
    return Response.json({ error: "Failed to update agent context" }, { status: 500 });
  }
}