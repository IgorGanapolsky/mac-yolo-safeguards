/**
 * Tiny first-error Sentry hook. No SDK, no replay, no profiling, no OTel.
 * No-ops unless SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN is set.
 * Never log the DSN.
 */

let captured = false;

export function sentryDsnFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  return String(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN || "").trim();
}

export function parseSentryDsn(dsn: string): { host: string; publicKey: string; projectId: string } | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
    const publicKey = url.username;
    if (!projectId || !publicKey || !url.host) return null;
    return { host: url.host, publicKey, projectId };
  } catch {
    return null;
  }
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 64);
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name) return name.slice(0, 64);
  }
  return "Error";
}

/** First error only. Never sends stacks, messages, or PII. */
export async function captureFirstError(error: unknown): Promise<boolean> {
  if (captured) return false;
  const parsed = parseSentryDsn(sentryDsnFromEnv());
  if (!parsed) return false;
  captured = true;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const header = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() });
  const item = JSON.stringify({ type: "event", content_type: "application/json" });
  const body = JSON.stringify({
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    logger: "thumbgate-first-error",
    exception: { values: [{ type: errorName(error), value: "client_error" }] },
  });
  try {
    const ingest = "https://" + parsed.host + "/api/" + parsed.projectId + "/envelope/?sentry_key=" + parsed.publicKey;
    await fetch(ingest, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: header + "\n" + item + "\n" + body,
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Test-only reset. */
export function __resetSentryForTests() {
  captured = false;
}
