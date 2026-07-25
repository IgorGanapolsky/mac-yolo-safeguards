import { createMemoryEntry, listMemoryEntries, searchMemory, deleteMemoryEntry, upsertMemoryEntry, getMemoryEntry } from "@/lib/memory";
import { requireSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const id = searchParams.get("id");
    const type = searchParams.get("type");
    const source = searchParams.get("source");
    const tag = searchParams.get("tag");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (id) {
      const entry = await getMemoryEntry(id, session.organizationId);
      if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
      return Response.json(entry);
    }

    if (q) {
      const entries = await searchMemory(session.organizationId, session.userId, q, { limit, type: type as any, source: source as any });
      return Response.json({ entries, count: entries.length, query: q });
    }

    const entries = await listMemoryEntries(session.organizationId, session.userId, {
      type: type as any,
      source: source as any,
      tag,
      limit,
      offset,
    });

    return Response.json({ entries, count: entries.length, limit, offset });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("memory list error:", error);
    return Response.json({ error: "Failed to list memory" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { content, type, source, source_id, tags, confidence, expires_at } = body;

    if (!content || !type || !source) {
      return Response.json({ error: "content, type, and source are required" }, { status: 400 });
    }

    const entry = await createMemoryEntry({
      organization_id: session.organizationId,
      user_id: session.userId,
      content,
      type,
      source,
      source_id,
      tags,
      confidence,
      expires_at,
    });

    return Response.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("memory create error:", error);
    return Response.json({ error: "Failed to create memory" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { content, type, source, source_id, tags, confidence } = body;

    if (!content || !type || !source) {
      return Response.json({ error: "content, type, and source required" }, { status: 400 });
    }

    const entry = await upsertMemoryEntry(session.organizationId, session.userId, content, type, source, source_id, tags, confidence);
    return Response.json(entry);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("memory upsert error:", error);
    return Response.json({ error: "Failed to upsert memory" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const deleted = await deleteMemoryEntry(id, session.organizationId);
    if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("memory delete error:", error);
    return Response.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}