"use client";

import { useEffect } from "react";
import styles from "./funnel-signals.module.css";

const endpoint = "/api/analytics/event";
const IOS_APP_URL = "https://apps.apple.com/us/app/hermes-ai-agent-leash/id6786778037";
const ANDROID_APP_URL = "https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en&gl=US";

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

  return (
    <aside className={styles.banner} aria-label="Hermes Mobile apps">
      <div className={styles.copy}>
        <strong>Hermes Mobile</strong>
        <span>Prefer the native app? Take the same Hermes workflow with you.</span>
      </div>
      <div className={styles.links}>
        <a
          href={IOS_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-funnel-event="mobile_app_ios_click"
        >
          Download for iPhone
        </a>
        <a
          href={ANDROID_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-funnel-event="mobile_app_android_click"
        >
          Get it on Android
        </a>
      </div>
    </aside>
  );
}
