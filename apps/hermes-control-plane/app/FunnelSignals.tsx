"use client";

import { useEffect } from "react";
import { ClientErrorBeacon } from "./ClientErrorBeacon";

const endpoint = "/api/analytics/event";

function signal(event: string) {
  const body = JSON.stringify({ schemaVersion: 1, event });
  navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
}

export function FunnelSignals() {
  useEffect(() => {
    signal("landing_view");
    const trackClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-funnel-event]")
        : null;
      const funnelEvent = target?.dataset.funnelEvent;
      if (funnelEvent) signal(funnelEvent);
    };
    document.addEventListener("click", trackClick);
    return () => document.removeEventListener("click", trackClick);
  }, []);

  // Landing also mounts the content-free client error counter.
  return <ClientErrorBeacon />;
}
