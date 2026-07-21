import { db } from "./runtime";

export interface PublicTelemetry {
  machinesOnlineNow: number;
  cloudRunsCompleted: number;
  p95CompletionMs: number | null;
  lastCloudRunAt: number | null;
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/**
 * Anonymous production aggregates for the public landing page. No titles,
 * names, org or device identifiers — counts and latency only. Returns null on
 * any failure (build-time prerender has no D1 binding; an empty database is a
 * valid state) so the landing renders its honest empty-state instead of 500ing.
 */
export async function getPublicTelemetry(now = Date.now()): Promise<PublicTelemetry | null> {
  try {
    const [machines, completions, latencies] = await Promise.all([
      db().prepare("SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL AND last_seen_at >= ?")
        .bind(now - ONLINE_WINDOW_MS).first<{ n: number }>(),
      db().prepare(
        "SELECT COUNT(*) AS n, MAX(completed_at) AS last FROM tasks WHERE status = 'completed' AND route = 'cloud'"
      ).first<{ n: number; last: number | null }>(),
      db().prepare(
        `SELECT completed_at - created_at AS ms FROM tasks
          WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_at > created_at
          ORDER BY ms ASC`
      ).all<{ ms: number }>(),
    ]);
    const sorted = (latencies.results ?? []).map((row) => row.ms);
    const p95 = sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
      : null;
    return {
      machinesOnlineNow: machines?.n ?? 0,
      cloudRunsCompleted: completions?.n ?? 0,
      p95CompletionMs: p95,
      lastCloudRunAt: completions?.last ?? null,
    };
  } catch {
    return null;
  }
}

export function formatAgo(timestamp: number | null, now = Date.now()): string {
  if (!timestamp) return "—";
  const minutes = Math.max(1, Math.round((now - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}
