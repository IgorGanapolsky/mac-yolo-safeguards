/**
 * First-party campaign attribution for funnel counters.
 *
 * Privacy contract (llms.txt):
 * - No prompts, threads, emails, IPs, cookies, or user-agents.
 * - Only short, allowlisted campaign tokens (utm + cta_id).
 * - Free-form query strings and PII-looking values are dropped.
 */

export const ATTRIBUTION_MAX_LEN = 64;
/** Safe token: alnum, dash, underscore, dot, colon (campaign ids). */
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

const EMAIL_LIKE = /@/;
const LONG_HEX = /^[a-f0-9]{32,}$/i;

export type FunnelAttribution = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  ctaId: string;
};

export const EMPTY_ATTRIBUTION: FunnelAttribution = {
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  ctaId: "",
};

export function sanitizeAttributionToken(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().slice(0, ATTRIBUTION_MAX_LEN);
  if (!trimmed) return "";
  if (EMAIL_LIKE.test(trimmed)) return "";
  if (LONG_HEX.test(trimmed)) return "";
  if (!TOKEN_RE.test(trimmed)) return "";
  return trimmed;
}

export function parseAttributionFromPayload(payload: {
  utmSource?: unknown;
  utm_source?: unknown;
  utmMedium?: unknown;
  utm_medium?: unknown;
  utmCampaign?: unknown;
  utm_campaign?: unknown;
  ctaId?: unknown;
  cta_id?: unknown;
} | null | undefined): FunnelAttribution {
  if (!payload || typeof payload !== "object") return { ...EMPTY_ATTRIBUTION };
  return {
    utmSource: sanitizeAttributionToken(payload.utmSource ?? payload.utm_source),
    utmMedium: sanitizeAttributionToken(payload.utmMedium ?? payload.utm_medium),
    utmCampaign: sanitizeAttributionToken(payload.utmCampaign ?? payload.utm_campaign),
    ctaId: sanitizeAttributionToken(payload.ctaId ?? payload.cta_id),
  };
}

/** Parse landing URL search params (browser or Node URL). */
export function parseAttributionFromSearch(search: string): FunnelAttribution {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  return {
    utmSource: sanitizeAttributionToken(params.get("utm_source")),
    utmMedium: sanitizeAttributionToken(params.get("utm_medium")),
    utmCampaign: sanitizeAttributionToken(params.get("utm_campaign")),
    ctaId: sanitizeAttributionToken(params.get("cta_id")),
  };
}

export function hasAttribution(attr: FunnelAttribution): boolean {
  return Boolean(attr.utmSource || attr.utmMedium || attr.utmCampaign || attr.ctaId);
}

/** Stable key for tests / offline joins. */
export function attributionKey(attr: FunnelAttribution): string {
  return [attr.utmSource, attr.utmMedium, attr.utmCampaign, attr.ctaId].join("|");
}
