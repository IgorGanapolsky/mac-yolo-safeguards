import { createMemoryEntry, listMemoryEntries } from "@/lib/memory";
import { requireSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { transcript, duration_ms, language, source_id, tags } = body;

    if (!transcript) {
      return Response.json({ error: "transcript required" }, { status: 400 });
    }

    const entry = await createMemoryEntry({
      organization_id: session.organizationId,
      user_id: session.userId,
      content: transcript,
      type: "voice_note",
      source: "voice",
      source_id,
      tags: tags ? [...tags, "voice", "mobile"] : ["voice", "mobile"],
      confidence: 0.9,
    });

    return Response.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("voice note error:", error);
    return Response.json({ error: "Failed to save voice note" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const entries = await listMemoryEntries(session.organizationId, session.userId, {
      type: "voice_note",
      limit,
      offset,
    });

    return Response.json({ entries, limit, offset });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("voice notes list error:", error);
    return Response.json({ error: "Failed to list voice notes" }, { status: 500 });
  }
}