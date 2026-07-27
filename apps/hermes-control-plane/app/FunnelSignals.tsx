"use client";

import { useEffect } from "react";
import { ClientErrorBeacon } from "./ClientErrorBeacon";
import {
  hasAttribution,
  parseAttributionFromSearch,
  type FunnelAttribution,
} from "@/lib/funnel-attribution";

const endpoint = "/api/analytics/event";

function signal(event: string, attr: FunnelAttribution) {
  const body: Record<string, string | number> = {
    schemaVersion: 1,
    event,
  };
  if (hasAttribution(attr)) {
    // camelCase preferred; API also accepts snake_case.
    if (attr.utmSource) body.utmSource = attr.utmSource;
    if (attr.utmMedium) body.utmMedium = attr.utmMedium;
    if (attr.utmCampaign) body.utmCampaign = attr.utmCampaign;
    if (attr.ctaId) body.ctaId = attr.ctaId;
  }
  navigator.sendBeacon(
    endpoint,
    new Blob([JSON.stringify(body)], { type: "application/json" }),
  );
}

export function FunnelSignals() {
  useEffect(() => {
    const attr = parseAttributionFromSearch(
      typeof window !== "undefined" ? window.location.search : "",
    );
    signal("landing_view", attr);
    const trackClick = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-funnel-event]")
          : null;
      const funnelEvent = target?.dataset.funnelEvent;
      if (funnelEvent) signal(funnelEvent, attr);
    };
    document.addEventListener("click", trackClick);
    return () => document.removeEventListener("click", trackClick);
  }, []);

  // Landing also mounts the content-free client error counter.
  return <ClientErrorBeacon />;
}
