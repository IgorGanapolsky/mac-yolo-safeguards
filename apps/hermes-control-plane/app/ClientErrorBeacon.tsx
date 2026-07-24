"use client";

import { useEffect } from "react";

const endpoint = "/api/analytics/event";
const MAX_REPORTS_PER_SESSION = 8;

/**
 * Content-free client error counter for ThumbGate web.
 * Posts only the event name `client_error` — no stack, URL query, or message text.
 * Visible as health.telemetry.clientErrorsToday + funnel_counters.
 */
function reportClientError() {
  try {
    const key = "tg_client_error_reports";
    const count = Number(sessionStorage.getItem(key) || "0");
    if (count >= MAX_REPORTS_PER_SESSION) return;
    sessionStorage.setItem(key, String(count + 1));
    const body = JSON.stringify({ schemaVersion: 1, event: "client_error" });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    });
  } catch {
    // never throw from error reporting
  }
}

export function ClientErrorBeacon() {
  useEffect(() => {
    const onError = () => {
      reportClientError();
    };
    const onRejection = () => {
      reportClientError();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
