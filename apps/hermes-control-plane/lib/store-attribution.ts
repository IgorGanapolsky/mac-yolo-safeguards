import {
  hasAttribution,
  parseAttributionFromSearch,
  type FunnelAttribution,
} from "@/lib/funnel-attribution";
import { recordFunnelEvent } from "@/lib/funnel-counter";

export type StoreClickEvent = "play_store_click" | "app_store_click";

export type StoreRedirectReceipt = {
  attribution: FunnelAttribution;
  recorded: boolean;
};

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

/**
 * Record direct social/email links that enter through /go/*.
 * Analytics failures never strand a buyer on the redirect route.
 */
export async function recordStoreRedirect(
  request: Request,
  event: StoreClickEvent,
): Promise<StoreRedirectReceipt> {
  const attribution = parseStoreAttribution(request);
  try {
    await recordFunnelEvent(event, attribution);
    return { attribution, recorded: true };
  } catch (error) {
    console.error("store_redirect_analytics_failed", {
      event,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { attribution, recorded: false };
  }
}
