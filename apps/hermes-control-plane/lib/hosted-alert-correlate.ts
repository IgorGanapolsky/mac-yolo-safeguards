/**
 * Hosted alert correlate — Digitate/ignio process steal (TNS 2026-08-25).
 * Keep in lockstep with tools/hosted-alert-correlate.js.
 * Not ignio, not CloudWatch, not Azure Monitor.
 */

export const HOSTED_ALERT_CORRELATE_SCHEMA = "hosted-alert-correlate/v1";
export const DUPLICATE_WINDOW_MS = 60_000;
export const PRECURSOR_COUNT = 3;

const FAMILIES = [
  { id: "hosted_admission", re: /^\/api\/(tasks|nostr\/events|device\/tasks)/ },
  { id: "billing", re: /^\/api\/billing\// },
  { id: "analytics", re: /^\/api\/analytics\// },
  { id: "health", re: /^\/api\/health/ },
] as const;

export type HostedAlertEvent = {
  ts: number;
  method?: string;
  path?: string;
  status?: number;
  errorClass?: string;
};

export function familyForPath(path: string): string {
  const p = String(path || "").split("?")[0];
  for (const fam of FAMILIES) {
    if (fam.re.test(p)) return fam.id;
  }
  return "other";
}

export function eventSignature(ev: HostedAlertEvent): string {
  if (ev.errorClass) return `client_error:${ev.errorClass}`;
  const method = String(ev.method || "GET").toUpperCase();
  const path = String(ev.path || "/").split("?")[0];
  const status = Number(ev.status) || 0;
  return `${method} ${path} ${status}`;
}

export function shouldEmitDuplicate(opts: {
  signature: string;
  now: number;
  lastBySignature: Record<string, number>;
  windowMs?: number;
}): { emit: boolean; reason: "ok" | "duplicate_suppressed" } {
  const windowMs = Number.isFinite(opts.windowMs) ? Number(opts.windowMs) : DUPLICATE_WINDOW_MS;
  const last = opts.lastBySignature[opts.signature];
  if (typeof last === "number" && opts.now - last < windowMs) {
    return { emit: false, reason: "duplicate_suppressed" };
  }
  return { emit: true, reason: "ok" };
}

export function suggestValidatedFix(opts: {
  testsPass?: boolean;
  receiptOk?: boolean;
  action?: string;
}): { action: string | null; autoApply: false; validated: boolean; reason?: string } {
  if (opts.testsPass && opts.receiptOk) {
    return { action: opts.action || "retry_with_receipt", autoApply: false, validated: true };
  }
  return { action: null, autoApply: false, validated: false, reason: "unvalidated" };
}

export function correlate(
  events: HostedAlertEvent[],
  opts: {
    windowMs?: number;
    precursorCount?: number;
    testsPass?: boolean;
    receiptOk?: boolean;
  } = {},
) {
  const windowMs = Number.isFinite(opts.windowMs) ? Number(opts.windowMs) : DUPLICATE_WINDOW_MS;
  const precursorCount = Number.isFinite(opts.precursorCount)
    ? Number(opts.precursorCount)
    : PRECURSOR_COUNT;
  const errorEvents = (events || [])
    .filter((ev) => {
      const status = Number(ev.status) || 0;
      return status >= 500 || Boolean(ev.errorClass);
    })
    .slice()
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  const lastBySignature: Record<string, number> = Object.create(null);
  const groups: Record<
    string,
    { id: string; signature: string; family: string; count: number; firstTs: number; lastTs: number }
  > = Object.create(null);
  const finished: Array<(typeof groups)[string]> = [];
  let suppressed = 0;

  for (const ev of errorEvents) {
    const ts = Number(ev.ts) || 0;
    const sig = eventSignature(ev);
    const family = familyForPath(ev.path || "");
    const key = family === "other" ? sig : family;
    if (groups[key] && ts - groups[key].lastTs >= windowMs) {
      finished.push(groups[key]);
      delete groups[key];
    }
    const dup = shouldEmitDuplicate({
      signature: `${key}:${sig}`,
      now: ts,
      lastBySignature,
      windowMs,
    });
    if (!dup.emit) {
      suppressed += 1;
      if (groups[key]) groups[key].count += 1;
      continue;
    }
    lastBySignature[`${key}:${sig}`] = ts;
    if (!groups[key]) {
      groups[key] = { id: key, signature: sig, family, count: 1, firstTs: ts, lastTs: ts };
    } else {
      groups[key].count += 1;
      groups[key].lastTs = ts;
    }
  }

  const incidents = finished.concat(Object.values(groups)).map((g) => {
    const userFacing = g.count >= precursorCount;
    return {
      ...g,
      precursor: g.count > 0 && !userFacing,
      userFacing,
      suggestedFix: suggestValidatedFix({
        testsPass: Boolean(opts.testsPass),
        receiptOk: Boolean(opts.receiptOk),
        action: `inspect_${g.family}`,
      }),
    };
  });

  const rawCount = errorEvents.length;
  return {
    schema: HOSTED_ALERT_CORRELATE_SCHEMA,
    clonedIgnio: false,
    autoApply: false as const,
    rawCount,
    incidentCount: incidents.length,
    suppressed,
    suppressRatio: rawCount === 0 ? 0 : Number((suppressed / rawCount).toFixed(4)),
    incidents,
  };
}
