import { audit } from "./audit";
import {
  AGENT_GOVERNANCE_POLICY_VERSION,
  evaluateCloudContinuation,
  governanceAuditMetadata,
  type GovernanceDecision,
} from "./agent-governance";
import {
  buildTaskCompletionReceipt,
  receiptAuditMetadata,
} from "./execution-receipt";
import { db } from "./runtime";
import { randomToken, sha256 } from "./security";
import { evaluateCloudPromptToolPolicy } from "./cloud-tool-policy";
import { mapProviderError, rememberProviderError } from "./hosted-apphost";
import { webSessionIdForThread } from "./web-session";
import { isSameThreadCompactionCommand, resolveContinuationPrompt } from "./continuation-prompts";

export const TASK_LEASE_MS = 90_000;

interface TaskCandidate {
  id: string;
  organizationId: string;
  threadId: string;
  threadTitle: string;
  prompt: string;
  currentRoute: "local" | "cloud" | "blocked";
  leaseGeneration: number;
  sourceSessionId: string | null;
  contextSnapshot: string | null;
  syncedAt: number | null;
  createdAt: number;
  plan: string;
  trialEndsAt: number | null;
  cloudTasks: number;
}

interface ContextMessage { role: "user" | "assistant" | "system"; content: string }

function parseSnapshot(value: string | null): ContextMessage[] {
  try {
    const parsed = value ? JSON.parse(value) as ContextMessage[] : [];
    return parsed.filter((message) => ["user", "assistant", "system"].includes(message.role) && typeof message.content === "string" && message.content.trim());
  } catch { return []; }
}

function boundMessages(messages: ContextMessage[], maxChars = 64_000): ContextMessage[] {
  let chars = 0;
  const result: ContextMessage[] = [];
  for (const message of [...messages].reverse()) {
    if (chars + message.content.length > maxChars) break;
    result.unshift(message);
    chars += message.content.length;
  }
  return result;
}


/** When a Mac dies mid-queue: auto → cloud Continuity; manual → needs human approve. */
export async function reclassifyStaleLocalTasks(now = Date.now()): Promise<void> {
  const staleBefore = now - 60_000;
  await db().batch([
    db().prepare(
      `UPDATE tasks SET status = 'cloud_pending', route = 'cloud', updated_at = ?
        WHERE status = 'local_pending' AND lease_owner IS NULL
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
          AND device_id IN (
            SELECT id FROM devices
             WHERE revoked_at IS NULL AND failover_mode = 'auto'
               AND (last_seen_at IS NULL OR last_seen_at < ?)
          )`,
    ).bind(now, now, staleBefore),
    db().prepare(
      `UPDATE tasks SET status = 'needs_failover', route = 'blocked', updated_at = ?
        WHERE status = 'local_pending' AND lease_owner IS NULL
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
          AND device_id IN (
            SELECT id FROM devices
             WHERE revoked_at IS NULL AND failover_mode = 'manual'
               AND (last_seen_at IS NULL OR last_seen_at < ?)
          )`,
    ).bind(now, now, staleBefore),
  ]);
}

export async function claimTask(input: {
  route: "local" | "cloud";
  owner: string;
  deviceId?: string;
}): Promise<{ task: {
  id: string;
  organizationId: string;
  threadId: string;
  threadTitle: string;
  prompt: string;
  displayPrompt: string;
  continuationCommand: string | null;
  leaseGeneration: number;
  sourceSessionId: string | null;
  contextMessages: ContextMessage[];
  handoffMessages: ContextMessage[];
  leaseToken: string;
  leaseExpiresAt: number;
} } | null> {
  const now = Date.now();
  if (input.route === "cloud") await reclassifyStaleLocalTasks(now);
  const routeClause = input.route === "local"
    ? "k.route = 'local' AND k.device_id = ? AND k.status IN ('local_pending', 'cloud_pending', 'running')"
    : `((k.route = 'cloud' AND k.status IN ('cloud_pending', 'running'))
        OR (k.route = 'local' AND k.status = 'local_pending' AND d.failover_mode = 'auto'
            AND (d.last_seen_at IS NULL OR d.last_seen_at < ?))
        OR (k.route = 'local' AND k.status = 'running' AND d.failover_mode = 'auto'
            AND (d.last_seen_at IS NULL OR d.last_seen_at < ?)))`;
  // The 'running' branch above is what lets cloud take over a task the Mac claimed and then
  // went offline mid-execution (lid closed while running) — not just tasks never claimed
  // locally. reclassifyStaleLocalTasks() above only sweeps lease_owner IS NULL tasks, so it
  // can't reach this case; both branches require the task's own lease to already be expired
  // (enforced by the trailing lease_expires_at check below), so the fencing-token CAS in the
  // UPDATE still owns correctness.
  const params = input.route === "local" ? [input.deviceId!, now] : [now - 60_000, now - 60_000, now];
  const candidate = await db().prepare(
    `SELECT k.id, k.organization_id AS organizationId, k.thread_id AS threadId, t.title AS threadTitle, k.prompt,
            k.route AS currentRoute, k.lease_generation AS leaseGeneration, k.created_at AS createdAt,
            t.source_session_id AS sourceSessionId, t.context_snapshot AS contextSnapshot, t.synced_at AS syncedAt,
            o.plan, o.trial_ends_at AS trialEndsAt,
            (SELECT COUNT(*) FROM tasks AS cloud_usage
              WHERE cloud_usage.organization_id = k.organization_id AND cloud_usage.route = 'cloud'
                AND cloud_usage.created_at >= ?) AS cloudTasks
       FROM tasks k JOIN threads t ON t.id = k.thread_id
       JOIN organizations o ON o.id = k.organization_id
       LEFT JOIN devices d ON d.id = k.device_id
      WHERE ${routeClause}
        AND (k.lease_expires_at IS NULL OR k.lease_expires_at <= ?)
      ORDER BY k.created_at ASC LIMIT 1`
  ).bind(now - 30 * 24 * 60 * 60 * 1000, ...params).first<TaskCandidate>();
  if (!candidate) return null;

  const prior = await db().prepare(
    `SELECT id, prompt, result, created_at AS createdAt FROM tasks
      WHERE thread_id = ? AND id <> ? AND status = 'completed' AND result IS NOT NULL AND created_at < ?
      ORDER BY created_at ASC LIMIT 30`
  ).bind(candidate.threadId, candidate.id, candidate.createdAt).all<{ id: string; prompt: string; result: string; createdAt: number }>();
  const compactionCandidates = await db().prepare(
    `SELECT id, prompt, result, created_at AS createdAt FROM tasks
      WHERE thread_id = ? AND id <> ? AND status = 'completed' AND result IS NOT NULL AND created_at < ?
        AND LOWER(RTRIM(TRIM(prompt), '!?.,;: ')) IN ('/new', '/reset')
      ORDER BY created_at DESC LIMIT 1`
  ).bind(candidate.threadId, candidate.id, candidate.createdAt).all<{ id: string; prompt: string; result: string; createdAt: number }>();
  const latestCompaction = compactionCandidates.results.find((task) => isSameThreadCompactionCommand(task.prompt)) ?? null;
  const unsynced = prior.results.filter((task) => task.createdAt > (candidate.syncedAt ?? 0));
  const postCompaction = latestCompaction
    ? prior.results.filter((task) => task.createdAt > latestCompaction.createdAt)
    : unsynced;
  const handoffTasks = latestCompaction ? [latestCompaction, ...postCompaction] : unsynced;
  const handoffMessages = handoffTasks.flatMap((task) => [
    { role: "user" as const, content: task.prompt },
    { role: "assistant" as const, content: task.result },
  ]);
  const policyContextMessages = boundMessages([
    ...parseSnapshot(candidate.contextSnapshot),
    ...prior.results.flatMap((task) => [
      { role: "user" as const, content: task.prompt },
      { role: "assistant" as const, content: task.result },
    ]),
  ]);
  const contextMessages = latestCompaction
    ? boundMessages(handoffMessages)
    : boundMessages([...parseSnapshot(candidate.contextSnapshot), ...handoffMessages]);
  const continuation = resolveContinuationPrompt(candidate.prompt, {
    hasContext: contextMessages.some((message) => message.role === "user" || message.role === "assistant"),
  });

  let cloudDecision: GovernanceDecision | null = null;
  if (input.route === "cloud") {
    // Compaction changes what the model receives, never the safety lineage used
    // to decide whether a hosted runner may execute the task.
    const activeUserContext = policyContextMessages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n");
    const policyPrompt = continuation.applied && activeUserContext
      ? `${activeUserContext}\n${continuation.executionPrompt}`
      : candidate.prompt;
    const toolPolicy = evaluateCloudPromptToolPolicy(policyPrompt);
    if (!toolPolicy.allowed) {
      const blocked = await db().prepare(
        `UPDATE tasks SET status = 'offline_blocked', route = 'blocked', error = ?, updated_at = ?,
                lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL
          WHERE id = ? AND lease_generation = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`
      ).bind(toolPolicy.message, now, candidate.id, candidate.leaseGeneration, now).run();
      if (blocked.meta.changes === 1) {
        await audit({
          organizationId: candidate.organizationId,
          actorType: "runner",
          actorId: input.owner,
          action: "task.policy.denied",
          targetType: "task",
          targetId: candidate.id,
          metadata: { code: toolPolicy.code, matched: toolPolicy.matched, stage: "automatic_claim", route: "cloud" },
        });
      }
      return null;
    }
    cloudDecision = evaluateCloudContinuation({
      organization: { plan: candidate.plan, trialEndsAt: candidate.trialEndsAt },
      cloudTasks: candidate.cloudTasks,
      cloudTaskDelta: candidate.currentRoute === "cloud" ? 0 : 1,
      now,
    });
    if (!cloudDecision.allowed) {
      const blocked = await db().prepare(
        `UPDATE tasks SET status = 'offline_blocked', route = 'blocked', error = ?, updated_at = ?,
                lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL
          WHERE id = ? AND lease_generation = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`
      ).bind(`Governance policy denied cloud execution: ${cloudDecision.message}`,
        now, candidate.id, candidate.leaseGeneration, now).run();
      if (blocked.meta.changes === 1) {
        await audit({
          organizationId: candidate.organizationId,
          actorType: "runner",
          actorId: input.owner,
          action: "task.policy.denied",
          targetType: "task",
          targetId: candidate.id,
          metadata: governanceAuditMetadata(cloudDecision, { stage: "automatic_claim", route: "cloud" }),
        });
      }
      return null;
    }
  }

  let sourceSessionId = candidate.sourceSessionId;
  if (input.route === "local" && !sourceSessionId) {
    sourceSessionId = webSessionIdForThread(candidate.threadId);
    const binding = await db().prepare(
      `UPDATE threads SET device_id = ?, source_session_id = ?, source = 'thumbgate-web'
        WHERE id = ? AND organization_id = ? AND source_session_id IS NULL`
    ).bind(input.deviceId!, sourceSessionId, candidate.threadId, candidate.organizationId).run();
    if (binding.meta.changes !== 1) {
      const current = await db().prepare(
        "SELECT source_session_id AS sourceSessionId FROM threads WHERE id = ? AND organization_id = ?"
      ).bind(candidate.threadId, candidate.organizationId).first<{ sourceSessionId: string | null }>();
      if (!current?.sourceSessionId) throw new Error("Failed to persist the Hermes session binding");
      sourceSessionId = current.sourceSessionId;
    }
  }

  const leaseToken = randomToken();
  const leaseExpiresAt = now + TASK_LEASE_MS;
  const update = await db().prepare(
    `UPDATE tasks SET status = 'running', route = ?, lease_owner = ?, lease_token_hash = ?,
            lease_generation = lease_generation + 1, lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND lease_generation = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        AND (? <> 'cloud' OR route = 'cloud' OR
          (SELECT COUNT(*) FROM tasks AS cloud_budget
            WHERE cloud_budget.organization_id = ? AND cloud_budget.route = 'cloud'
              AND cloud_budget.created_at >= ?) < ?)`
  ).bind(input.route, input.owner, await sha256(leaseToken), leaseExpiresAt, now,
    candidate.id, candidate.leaseGeneration, now, input.route, candidate.organizationId,
    now - 30 * 24 * 60 * 60 * 1000, cloudDecision?.limit ?? 0).run();
  if (update.meta.changes !== 1) return null;
  await audit({
    organizationId: candidate.organizationId,
    actorType: input.route === "local" ? "device" : "runner",
    actorId: input.owner,
    action: "task.claim",
    targetType: "task",
    targetId: candidate.id,
    metadata: {
      route: input.route,
      generation: candidate.leaseGeneration + 1,
      ...(cloudDecision
        ? governanceAuditMetadata(cloudDecision, { stage: "automatic_claim", route: "cloud" })
        : { policyVersion: AGENT_GOVERNANCE_POLICY_VERSION, decision: "allow", stage: "automatic_claim" }),
      continuationCommand: continuation.applied ? continuation.command : null,
      continuationApplied: continuation.applied,
      contextCompactedFromTaskId: latestCompaction?.id ?? null,
    },
  });
  return { task: {
    id: candidate.id,
    organizationId: candidate.organizationId,
    threadId: candidate.threadId,
    threadTitle: candidate.threadTitle,
    prompt: continuation.executionPrompt,
    displayPrompt: candidate.prompt,
    continuationCommand: continuation.applied ? continuation.command : null,
    sourceSessionId,
    contextMessages,
    handoffMessages: boundMessages(handoffMessages, 24_000),
    leaseGeneration: candidate.leaseGeneration + 1,
    leaseToken,
    leaseExpiresAt,
  } };
}

export async function renewTask(input: {
  owner: string;
  taskId: string;
  leaseToken: string;
  actorType: "device" | "runner";
}): Promise<{ leaseExpiresAt: number } | null> {
  const now = Date.now();
  const leaseExpiresAt = now + TASK_LEASE_MS;
  const tokenHash = await sha256(input.leaseToken);
  const existing = await db().prepare(
    `SELECT organization_id AS organizationId, route, lease_generation AS leaseGeneration
       FROM tasks WHERE id = ?`
  ).bind(input.taskId).first<{
    organizationId: string;
    route: "local" | "cloud";
    leaseGeneration: number;
  }>();
  if (!existing) return null;
  const update = await db().prepare(
    `UPDATE tasks SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_token_hash = ?
        AND lease_expires_at > ?`
  ).bind(leaseExpiresAt, now, input.taskId, input.owner, tokenHash, now).run();
  if (update.meta.changes !== 1) return null;
  await audit({
    organizationId: existing.organizationId,
    actorType: input.actorType,
    actorId: input.owner,
    action: "task.lease.renew",
    targetType: "task",
    targetId: input.taskId,
    metadata: { route: existing.route, generation: existing.leaseGeneration, leaseExpiresAt },
  });
  return { leaseExpiresAt };
}

export async function completeTask(input: {
  owner: string;
  taskId: string;
  leaseToken: string;
  result?: string;
  error?: string;
  actorType: "device" | "runner";
  /** Optional external verifier the executor cannot self-sign (provider receipt, row, webhook, human). */
  externalCheckPassed?: boolean | null;
  externalCheckKind?: string | null;
  externalEvidenceId?: string | null;
}): Promise<boolean> {
  const now = Date.now();
  // Soft task row status still tracks executor report; audit receipt carries true outcome semantics.
  const status = input.error ? "failed" : "completed";
  const tokenHash = await sha256(input.leaseToken);
  const existing = await db().prepare(
    `SELECT organization_id AS organizationId, route, lease_generation AS leaseGeneration,
            created_at AS createdAt, thread_id AS threadId, prompt FROM tasks WHERE id = ?`
  ).bind(input.taskId).first<{
    organizationId: string;
    route: "local" | "cloud";
    leaseGeneration: number;
    createdAt: number;
    threadId: string;
    prompt: string;
  }>();
  if (!existing) return false;
  const storedError = input.error
    ? (existing.route === "cloud" ? mapProviderError(input.error) : input.error)
    : null;
  const update = await db().prepare(
    `UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = ?, updated_at = ?,
            lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL
      WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_token_hash = ?
        AND lease_expires_at > ?`
  ).bind(status, input.result ?? null, storedError, now, now,
    input.taskId, input.owner, tokenHash, now).run();
  if (update.meta.changes !== 1) return false;
  const compactedResult = input.result?.trim();
  if (!storedError && compactedResult && isSameThreadCompactionCommand(existing.prompt)) {
    await audit({
      organizationId: existing.organizationId,
      actorType: input.actorType,
      actorId: input.owner,
      action: "thread.context.compacted",
      targetType: "thread",
      targetId: existing.threadId,
      metadata: {
        route: existing.route,
        command: "compact_same_thread",
        taskId: input.taskId,
        durableMarker: "completed_task_result",
      },
    });
  }
  if (existing.route === "cloud") {
    rememberProviderError(storedError, now);
  }
  const receipt = buildTaskCompletionReceipt({
    actorType: input.actorType,
    actorId: input.owner,
    taskId: input.taskId,
    route: existing.route,
    error: storedError ?? undefined,
    externalCheckPassed: input.externalCheckPassed,
    externalCheckKind: input.externalCheckKind,
    externalEvidenceId: input.externalEvidenceId,
    now,
  });
  await audit({
    organizationId: existing.organizationId,
    actorType: input.actorType,
    actorId: input.owner,
    action: `task.${status}`,
    targetType: "task",
    targetId: input.taskId,
    metadata: {
      route: existing.route,
      generation: existing.leaseGeneration,
      durationMs: Math.max(0, now - existing.createdAt),
      ...receiptAuditMetadata(receipt),
    },
  });
  return true;
}

export {
  TASK_PICKUP_TIMEOUT_MS,
  TASK_PICKUP_TIMEOUT_ERROR,
  staleUnclaimedTaskIds,
  type PendingTaskRow,
} from "./task-pickup";
import { TASK_PICKUP_TIMEOUT_ERROR, TASK_PICKUP_TIMEOUT_MS } from "./task-pickup";

/**
 * Fail tasks that were never claimed. Fenced to the unclaimed status set with
 * a NULL-lease predicate so it can never steal a task a runner is executing,
 * and issues exactly one write, only when there is something to expire.
 */
export async function expireUnclaimedTasks(taskIds: string[], now = Date.now()): Promise<number> {
  if (!taskIds.length) return 0;
  const placeholders = taskIds.map(() => "?").join(", ");
  const result = await db().prepare(
    `UPDATE tasks SET status = 'failed', error = ?, completed_at = ?, updated_at = ?,
            lease_owner = NULL, lease_token_hash = NULL, lease_expires_at = NULL
      WHERE id IN (${placeholders})
        AND status IN ('cloud_pending', 'local_pending')
        AND lease_owner IS NULL
        AND lease_expires_at IS NULL
        AND created_at <= ?`
  ).bind(TASK_PICKUP_TIMEOUT_ERROR, now, now, ...taskIds, now - TASK_PICKUP_TIMEOUT_MS).run();
  return result.meta.changes ?? 0;
}
