import {
  hasAttribution,
  parseAttributionFromSearch,
  type FunnelAttribution,
} from "@/lib/funnel-attribution";
import { recordFunnelEvent } from "@/lib/funnel-counter";

export type StoreClickEvent = "play_store_click" | "app_store_click";
export type StorePreviewEvent = "play_store_preview" | "app_store_preview";
export type StoreRedirectEvent = StoreClickEvent | StorePreviewEvent;

export type StoreRedirectReceipt = {
  attribution: FunnelAttribution;
  event: StoreRedirectEvent;
  recorded: boolean;
};

const PREVIEW_EVENT: Record<StoreClickEvent, StorePreviewEvent> = {
  play_store_click: "play_store_preview",
  app_store_click: "app_store_preview",
};

const PREVIEW_USER_AGENT =
  /(?:bot\b|crawler\b|spider\b|slurp\b|facebookexternalhit|facebot|linkedinbot|twitterbot|slackbot|discordbot|telegrambot|whatsapp|applebot|googlebot|bingpreview|pinterestbot|embedly|quora link preview)/i;

export function buildPlayStoreUrl(
  baseUrl: string,
  attribution: FunnelAttribution,
): string {
  const target = new URL(baseUrl);
  const referrer = new URLSearchParams();
  if (attribution.utmSource) referrer.set("utm_source", attribution.utmSource);
  if (attribution.utmMedium) referrer.set("utm_medium", attribution.utmMedium);
  if (attribution.utmCampaign) {
    referrer.set("utm_campaign", attribution.utmCampaign);
  }
  if (attribution.ctaId) {
    referrer.set("utm_content", attribution.ctaId);
    referrer.set("cta_id", attribution.ctaId);
  }
  if (referrer.size > 0) {
    target.searchParams.set("referrer", referrer.toString());
  }
  return target.toString();
}

export function storeRedirectResponse(targetUrl: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: targetUrl,
      "cache-control": "no-store, max-age=0",
      "referrer-policy": "no-referrer",
    },
  });
}

export function parseStoreAttribution(request: Request): FunnelAttribution {
  const target = new URL(request.url);
  const direct = parseAttributionFromSearch(target.search);
  if (hasAttribution(direct)) return direct;

  const referrer = request.headers.get("referer");
  if (!referrer) return direct;
  try {
    const source = new URL(referrer);
    return source.origin === target.origin
      ? parseAttributionFromSearch(source.search)
      : direct;
  } catch {
    return direct;
  }
}

export function isAutomatedStorePreview(request: Request): boolean {
  const purpose = [
    request.headers.get("purpose"),
    request.headers.get("sec-purpose"),
    request.headers.get("x-purpose"),
  ]
    .filter(Boolean)
    .join(" ");
  if (/\b(?:prefetch|preview)\b/i.test(purpose)) return true;
  return PREVIEW_USER_AGENT.test(request.headers.get("user-agent") ?? "");
}

/**
 * Record direct social/email links that enter through /go/*.
 * Identified crawlers and prefetchers receive a separate preview event so link
 * unfurls cannot inflate human store-click conversion counts.
 * Analytics failures never strand a buyer on the redirect route.
 */
export async function recordStoreRedirect(
  request: Request,
  event: StoreClickEvent,
): Promise<StoreRedirectReceipt> {
  const attribution = parseStoreAttribution(request);
  const recordedEvent = isAutomatedStorePreview(request)
    ? PREVIEW_EVENT[event]
    : event;
  try {
    await recordFunnelEvent(recordedEvent, attribution);
    return { attribution, event: recordedEvent, recorded: true };
  } catch (error) {
    console.error("store_redirect_analytics_failed", {
      event: recordedEvent,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { attribution, event: recordedEvent, recorded: false };
  }
}
