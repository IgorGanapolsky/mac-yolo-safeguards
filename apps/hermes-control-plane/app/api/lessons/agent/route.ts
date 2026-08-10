import { audit } from "@/lib/audit";
import { requireDevice } from "@/lib/device-auth";
import { db } from "@/lib/runtime";

/**
 * Agent lessons — the capture_feedback / recall backend that works from anywhere.
 *
 * Why this exists: AGENTS.md requires `recall` at session start and `capture_feedback`
 * on incidents, but the lessons store was `~/.thumbgate` on the Mac. A scheduled agent
 * run executes in an ephemeral cloud container with no route to that directory, so the
 * one agent whose mistakes most need recording — the unattended one, running while
 * nobody watches — was structurally unable to record them. This moves the store to D1,
 * which any runner can reach.
 *
 * Deliberately a SEPARATE route from /api/lessons. That one is the dashboard view over
 * response_feedback — user thumbs on a task response, keyed by (org, user, task). An
 * unattended agent has neither a task row nor a session, so it needs its own store and
 * its own device-signed write path rather than overloading an existing endpoint.
 */

const MAX_BODY_BYTES = 32 * 1024;
const KINDS = new Set(["mistake", "success", "rule", "feedback"]);
const SEVERITIES = new Set(["info", "warn", "critical"]);

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

/**
 * Fingerprint decides what counts as "the same lesson". Deliberately derived from the
 * rule when present, falling back to the title: two runs phrasing the same mistake
 * differently in the body should still collapse to one row, or recall degrades into a
 * log of near-duplicates.
 */
async function fingerprint(agentId: string, kind: string, key: string): Promise<string> {
  const canonical = `${agentId}\n${kind}\n${key.trim().toLowerCase().replace(/\s+/g, " ")}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return jsonError("lesson payload is too large", 413);
  }
  // requireDevice verifies the signature over the RAW body, so it must be read once
  // and passed through — re-reading or re-serializing would change the bytes it signed.
  const identity = await requireDevice(request, body);
  if (identity instanceof Response) return identity;

  let payload: {
    agentId?: string; kind?: string; severity?: string;
    title?: string; body?: string; rule?: string; sessionRef?: string;
  };
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return jsonError("body must be JSON");
  }

  const agentId = (payload.agentId || "").trim();
  const kind = (payload.kind || "").trim();
  const title = (payload.title || "").trim();
  const lessonBody = (payload.body || "").trim();
  const rule = (payload.rule || "").trim();
  const severity = (payload.severity || "info").trim();

  if (!agentId) return jsonError("agentId is required");
  if (!KINDS.has(kind)) return jsonError(`kind must be one of: ${[...KINDS].join(", ")}`);
  if (!SEVERITIES.has(severity)) return jsonError(`severity must be one of: ${[...SEVERITIES].join(", ")}`);
  if (!title) return jsonError("title is required");
  if (!lessonBody) return jsonError("body is required — a lesson with no detail cannot be acted on later");

  const now = Date.now();
  const fp = await fingerprint(agentId, kind, rule || title);
  const id = crypto.randomUUID();

  // Upsert: a repeat of a known lesson bumps occurrences and refreshes the text,
  // so "how often has this bitten us" is answerable and the store stays small.
  await db().prepare(
    `INSERT INTO agent_lessons
       (id, organization_id, device_id, agent_id, kind, severity, title, body, rule, source, session_ref, fingerprint, occurrences, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent', ?, ?, 1, ?, ?)
     ON CONFLICT(organization_id, fingerprint) DO UPDATE SET
       occurrences = occurrences + 1,
       severity    = excluded.severity,
       title       = excluded.title,
       body        = excluded.body,
       rule        = excluded.rule,
       session_ref = excluded.session_ref,
       updated_at  = excluded.updated_at`
  ).bind(
    id, identity.organizationId, identity.id, agentId, kind, severity,
    title, lessonBody, rule || null, payload.sessionRef || null, fp, now, now
  ).run();

  const row = await db().prepare(
    "SELECT id, occurrences FROM agent_lessons WHERE organization_id = ? AND fingerprint = ?"
  ).bind(identity.organizationId, fp).first<{ id: string; occurrences: number }>();

  await audit({
    organizationId: identity.organizationId,
    actorType: "device",
    actorId: identity.id,
    action: "lesson.capture",
    targetType: "lesson",
    targetId: row?.id ?? id,
  });

  return Response.json({ ok: true, id: row?.id ?? id, fingerprint: fp, occurrences: row?.occurrences ?? 1 });
}
