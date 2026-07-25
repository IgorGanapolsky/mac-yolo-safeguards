import { db } from "../runtime.ts";
import { classifyMemoryType, extractTags, splitIntoSentences } from "./classify.ts";

export type MemoryType = "fact" | "preference" | "context" | "pattern" | "summary" | "voice_note" | "agent_insight" | "device";
export type MemorySource = "chat" | "voice" | "agent" | "device" | "approval" | "task" | "cron" | "manual" | "webhook";

export interface MemoryEntry {
  id: string;
  organization_id: string;
  user_id: string;
  content: string;
  type: MemoryType;
  source: MemorySource;
  source_id: string | null;
  tags: string | null;
  confidence: number | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export interface CreateMemoryInput {
  organization_id: string;
  user_id: string;
  content: string;
  type: MemoryType;
  source: MemorySource;
  source_id?: string;
  tags?: string[];
  confidence?: number;
  expires_at?: number;
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<MemoryType, number>;
  bySource: Record<MemorySource, number>;
  recentCount: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  avgConfidence: number | null;
}

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createMemoryEntry(input: CreateMemoryInput): Promise<MemoryEntry> {
  const id = generateId();
  const now = Date.now();
  const tags = input.tags ? JSON.stringify(input.tags) : null;

  await db().prepare(
    `INSERT INTO memory_entries (id, organization_id, user_id, content, type, source, source_id, tags, confidence, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.organization_id,
    input.user_id,
    input.content,
    input.type,
    input.source,
    input.source_id ?? null,
    tags,
    input.confidence ?? null,
    now,
    now,
    input.expires_at ?? null
  ).run();

  return {
    id,
    organization_id: input.organization_id,
    user_id: input.user_id,
    content: input.content,
    type: input.type,
    source: input.source,
    source_id: input.source_id ?? null,
    tags,
    confidence: input.confidence ?? null,
    created_at: now,
    updated_at: now,
    expires_at: input.expires_at ?? null,
  };
}

export async function upsertMemoryEntry(
  organization_id: string,
  user_id: string,
  content: string,
  type: MemoryType,
  source: MemorySource,
  source_id: string | undefined,
  tags: string[] | undefined,
  confidence: number | undefined
): Promise<MemoryEntry> {
  const now = Date.now();
  const tagsJson = tags ? JSON.stringify(tags) : null;

  const existing = await db().prepare(
    `SELECT id FROM memory_entries
     WHERE organization_id = ? AND user_id = ? AND type = ? AND source = ? AND source_id = ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(organization_id, user_id, type, source, source_id ?? "").first<{ id: string }>();

  if (existing) {
    await db().prepare(
      `UPDATE memory_entries SET content = ?, tags = ?, confidence = ?, updated_at = ?
       WHERE id = ?`
    ).bind(content, tagsJson, confidence ?? null, now, existing.id).run();
    return getMemoryEntry(existing.id, organization_id)!;
  }

  return createMemoryEntry({ organization_id, user_id, content, type, source, source_id, tags, confidence });
}

export async function getMemoryEntry(id: string, organization_id: string): Promise<MemoryEntry | null> {
  const entry = await db().prepare(
    `SELECT * FROM memory_entries WHERE id = ? AND organization_id = ?`
  ).bind(id, organization_id).first<MemoryEntry>();
  return entry ?? null;
}

export async function deleteMemoryEntry(id: string, organization_id: string): Promise<boolean> {
  const result = await db().prepare(
    `DELETE FROM memory_entries WHERE id = ? AND organization_id = ?`
  ).bind(id, organization_id).run();
  return (result.changes ?? 0) > 0;
}

export async function listMemoryEntries(
  organization_id: string,
  user_id: string,
  options: {
    type?: MemoryType;
    source?: MemorySource;
    tag?: string;
    limit?: number;
    offset?: number;
    since?: number;
    until?: number;
  } = {}
): Promise<MemoryEntry[]> {
  const { type, source, tag, limit = 50, offset = 0, since, until } = options;
  const conditions = ["organization_id = ?", "user_id = ?"];
  const params: (string | number)[] = [organization_id, user_id];

  if (type) { conditions.push("type = ?"); params.push(type); }
  if (source) { conditions.push("source = ?"); params.push(source); }
  if (tag) { conditions.push("tags LIKE ?"); params.push(`%${tag}%`); }
  if (since) { conditions.push("created_at >= ?"); params.push(since); }
  if (until) { conditions.push("created_at <= ?"); params.push(until); }

  const where = conditions.join(" AND ");
  const entries = await db().prepare(
    `SELECT * FROM memory_entries WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all<MemoryEntry>();

  return entries.results ?? [];
}

export async function searchMemory(
  organization_id: string,
  user_id: string,
  query: string,
  options: { limit?: number; type?: MemoryType; source?: MemorySource } = {}
): Promise<MemoryEntry[]> {
  const { limit = 20, type, source } = options;
  const conditions = ["organization_id = ?", "user_id = ?", "content LIKE ?"];
  const params: (string | number)[] = [organization_id, user_id, `%${query}%`];

  if (type) { conditions.push("type = ?"); params.push(type); }
  if (source) { conditions.push("source = ?"); params.push(source); }

  const where = conditions.join(" AND ");
  const entries = await db().prepare(
    `SELECT * FROM memory_entries WHERE ${where} ORDER BY created_at DESC LIMIT ?`
  ).bind(...params, limit).all<MemoryEntry>();

  return entries.results ?? [];
}

export async function getMemoryStats(
  organization_id: string,
  user_id: string
): Promise<MemoryStats> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const [total, byType, bySource, recent, oldest, newest, avgConf] = await Promise.all([
    db().prepare(`SELECT COUNT(*) as c FROM memory_entries WHERE organization_id = ? AND user_id = ?`).bind(organization_id, user_id).first<{ c: number }>(),
    db().prepare(`SELECT type, COUNT(*) as c FROM memory_entries WHERE organization_id = ? AND user_id = ? GROUP BY type`).bind(organization_id, user_id).all<{ type: MemoryType; c: number }>(),
    db().prepare(`SELECT source, COUNT(*) as c FROM memory_entries WHERE organization_id = ? AND user_id = ? GROUP BY source`).bind(organization_id, user_id).all<{ source: MemorySource; c: number }>(),
    db().prepare(`SELECT COUNT(*) as c FROM memory_entries WHERE organization_id = ? AND user_id = ? AND created_at >= ?`).bind(organization_id, user_id, thirtyDaysAgo).first<{ c: number }>(),
    db().prepare(`SELECT MIN(created_at) as c FROM memory_entries WHERE organization_id = ? AND user_id = ?`).bind(organization_id, user_id).first<{ c: number }>(),
    db().prepare(`SELECT MAX(created_at) as c FROM memory_entries WHERE organization_id = ? AND user_id = ?`).bind(organization_id, user_id).first<{ c: number }>(),
    db().prepare(`SELECT AVG(confidence) as c FROM memory_entries WHERE organization_id = ? AND user_id = ? AND confidence IS NOT NULL`).bind(organization_id, user_id).first<{ c: number }>(),
  ]);

  const typeMap: Record<MemoryType, number> = {
    fact: 0, preference: 0, context: 0, pattern: 0, summary: 0, voice_note: 0, agent_insight: 0, device: 0,
  };
  for (const row of byType.results ?? []) typeMap[row.type] = row.c;

  const sourceMap: Record<MemorySource, number> = {
    chat: 0, voice: 0, agent: 0, device: 0, approval: 0, task: 0, cron: 0, manual: 0, webhook: 0,
  };
  for (const row of bySource.results ?? []) sourceMap[row.source] = row.c;

  return {
    totalEntries: total?.c ?? 0,
    byType: typeMap,
    bySource: sourceMap,
    recentCount: recent?.c ?? 0,
    oldestEntry: oldest?.c ?? null,
    newestEntry: newest?.c ?? null,
    avgConfidence: avgConf?.c ?? null,
  };
}

export async function getRelevantContext(
  organization_id: string,
  user_id: string,
  query: string,
  options: { maxEntries?: number; maxAgeMs?: number } = {}
): Promise<{ entries: MemoryEntry[]; summary: string }> {
  const { maxEntries = 10, maxAgeMs = 90 * 24 * 60 * 60 * 1000 } = options;
  const since = Date.now() - maxAgeMs;

  const entries = await searchMemory(organization_id, user_id, query, { limit: maxEntries });
  const recentEntries = entries.filter(e => e.created_at >= since);

  const summary = recentEntries.length > 0
    ? `Found ${recentEntries.length} relevant memories: ${recentEntries.slice(0, 3).map(e => e.content.slice(0, 80)).join("; ")}`
    : "No relevant memories found";

  return { entries: recentEntries, summary };
}

export async function extractAndStoreMemories(
  organization_id: string,
  user_id: string,
  text: string,
  source: MemorySource,
  source_id: string
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const sentence of splitIntoSentences(text)) {
    const type = classifyMemoryType(sentence);
    const existing = await db().prepare(
      `SELECT id FROM memory_entries WHERE organization_id = ? AND user_id = ? AND source = ? AND source_id = ? AND content LIKE ?`
    ).bind(organization_id, user_id, source, source_id, `%${sentence.substring(0, 50)}%`).first();

    if (existing) {
      await db().prepare(
        `UPDATE memory_entries SET content = ?, updated_at = ? WHERE id = ?`
      ).bind(sentence, Date.now(), existing.id).run();
      updated++;
    } else {
      await createMemoryEntry({
        organization_id,
        user_id,
        content: sentence,
        type,
        source,
        source_id,
        tags: extractTags(sentence),
        confidence: 0.8,
      });
      created++;
    }
  }

  return { created, updated };
}