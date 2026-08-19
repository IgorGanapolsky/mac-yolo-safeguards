/**
 * A hosted session is not welded to one model route.
 * Handoff keeps history, memory, and tool policy; swaps the opaque route id.
 */

import { appendHistory, distillFacts } from "./hosted-memory-tiers.ts";
import { publicRunReceipt } from "./hosted-source-of-truth.ts";
import type { HostedToolPolicy } from "./hosted-tool-approvals.ts";

export type HostedSession = {
  taskId: string;
  history: string;
  memoryFacts: string[];
  toolPolicy: HostedToolPolicy;
  route: string;
  branch?: string;
  runtime?: string;
};

const SECRET_KEY_RE = /(api[_-]?key|token|secret|authorization|password|bearer)/i;
const SECRET_VALUE_RE = /sk-[a-zA-Z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+/i;

export function stripSecrets(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (SECRET_VALUE_RE.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_RE.test(key) ? "[redacted]" : stripSecrets(item);
    }
    return out;
  }
  return value;
}

export function handoffSession(
  session: HostedSession,
  input: { fromRoute?: string; toRoute: string; reason: string },
): {
  session: HostedSession;
  receipt: ReturnType<typeof publicRunReceipt> & { route?: string };
} {
  const toRoute = String(input.toRoute ?? "").trim();
  const reason = String(input.reason ?? "").trim() || "route changed";
  const history = appendHistory(session.history, `fact: route changed because ${reason}`);
  const next: HostedSession = {
    taskId: session.taskId,
    history,
    memoryFacts: distillFacts(history),
    toolPolicy: session.toolPolicy,
    route: toRoute || session.route,
    branch: session.branch,
    runtime: session.runtime ?? "vps",
  };
  const receipt = publicRunReceipt({
    taskId: next.taskId,
    route: next.route,
    status: "handoff",
    prompt: undefined,
  });
  return { session: next, receipt };
}

export function publicSessionView(session: HostedSession): Record<string, unknown> {
  return stripSecrets({
    taskId: session.taskId,
    route: session.route,
    branch: session.branch ?? null,
    runtime: session.runtime ?? "vps",
    memoryFacts: session.memoryFacts,
    toolPolicy: session.toolPolicy,
    sourceOfTruth: "hosted-vps",
  }) as Record<string, unknown>;
}
