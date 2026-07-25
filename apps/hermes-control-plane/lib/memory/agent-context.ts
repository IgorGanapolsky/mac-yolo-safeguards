import { db } from "../runtime";

export interface AgentContext {
  id: string;
  organization_id: string;
  agent_id: string;
  context: string;
  metadata: string | null;
  version: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

function generateId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getAgentContext(organization_id: string, agent_id: string): Promise<AgentContext | null> {
  const context = await db().prepare(
    `SELECT * FROM agent_shared_context WHERE organization_id = ? AND context_key = ?`
  ).bind(organization_id, `agent:${agent_id}`).first<AgentContext>();
  return context ?? null;
}

export async function updateAgentContext(
  organization_id: string,
  agent_id: string,
  context: string,
  metadata: Record<string, unknown> | undefined,
  created_by: string
): Promise<AgentContext> {
  const now = Date.now();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const contextKey = `agent:${agent_id}`;

  const existing = await db().prepare(
    `SELECT * FROM agent_shared_context WHERE organization_id = ? AND context_key = ?`
  ).bind(organization_id, contextKey).first<AgentContext>();

  if (existing) {
    await db().prepare(
      `UPDATE agent_shared_context SET context_value = ?, version = version + 1, updated_at = ?, created_by = ?
       WHERE organization_id = ? AND context_key = ?`
    ).bind(context, now, created_by, organization_id, contextKey).run();
    return { ...existing, context_value: context, version: existing.version + 1, updated_at: now, created_by };
  }

  const id = generateId();
  await db().prepare(
    `INSERT INTO agent_shared_context (id, organization_id, context_key, context_value, version, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).bind(id, organization_id, contextKey, context, created_by, now, now).run();

  return { id, organization_id, agent_id, context, metadata: metadataJson, version: 1, created_by, created_at: now, updated_at: now };
}

export async function listAgentContexts(organization_id: string): Promise<AgentContext[]> {
  const contexts = await db().prepare(
    `SELECT * FROM agent_shared_context WHERE organization_id = ? AND context_key LIKE 'agent:%' ORDER BY updated_at DESC`
  ).bind(organization_id).all<AgentContext>();
  return contexts.results?.map(c => ({ ...c, agent_id: c.context_key.replace("agent:", "") })) ?? [];
}