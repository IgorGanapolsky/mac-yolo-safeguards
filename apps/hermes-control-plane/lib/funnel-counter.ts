import { db } from "@/lib/runtime";
import {
  hasAttribution,
  type FunnelAttribution,
} from "@/lib/funnel-attribution";

type FunnelDatabase = Pick<D1Database, "prepare">;

/**
 * Increment the content-free aggregate and, when present, its sanitized
 * campaign dimensions. The caller owns error policy: API writes fail closed,
 * while outbound store redirects log and continue.
 */
export async function bumpFunnelEvent(
  database: FunnelDatabase,
  event: string,
  attr: FunnelAttribution,
  now = Date.now(),
): Promise<void> {
  const day = new Date(now).toISOString().slice(0, 10);
  await database
    .prepare(
      `INSERT INTO funnel_counters (day, event, count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(day, event) DO UPDATE SET
         count = funnel_counters.count + 1,
         updated_at = excluded.updated_at`,
    )
    .bind(day, event, now)
    .run();

  if (!hasAttribution(attr)) return;

  await database
    .prepare(
      `INSERT INTO funnel_attribution_counters
         (day, event, utm_source, utm_medium, utm_campaign, cta_id, count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(day, event, utm_source, utm_medium, utm_campaign, cta_id) DO UPDATE SET
         count = funnel_attribution_counters.count + 1,
         updated_at = excluded.updated_at`,
    )
    .bind(
      day,
      event,
      attr.utmSource,
      attr.utmMedium,
      attr.utmCampaign,
      attr.ctaId,
      now,
    )
    .run();
}

export async function recordFunnelEvent(
  event: string,
  attr: FunnelAttribution,
  now = Date.now(),
): Promise<void> {
  await bumpFunnelEvent(db(), event, attr, now);
}
