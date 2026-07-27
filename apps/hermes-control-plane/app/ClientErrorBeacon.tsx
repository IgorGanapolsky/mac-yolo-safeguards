"use client";

import { useEffect } from "react";

const endpoint = "/api/analytics/event";
const MAX_REPORTS_PER_SESSION = 8;

/** Allowlisted Error.name only — never free-form messages or stacks. */
const ALLOWED_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "URIError",
  "EvalError",
  "AggregateError",
]);

/**
 * Content-free client error reporting for ThumbGate web.
 * - Always increments client_error (health.telemetry.clientErrorsToday).
 * - Optionally attaches errorClass (allowlisted Error.name only) for triage.
 * Never sends stack, message text, URL query, or user content.
 */
function classifyError(input: unknown): string {
  try {
    let name = "Error";
    if (input instanceof Error && typeof input.name === "string") {
      name = input.name;
    } else if (input && typeof input === "object" && "reason" in input) {
      const reason = (input as { reason?: unknown }).reason;
      if (reason instanceof Error && typeof reason.name === "string") name = reason.name;
    } else if (input && typeof input === "object" && "error" in input) {
      const err = (input as { error?: unknown }).error;
      if (err instanceof Error && typeof err.name === "string") name = err.name;
    }
    if (ALLOWED_ERROR_NAMES.has(name)) return name;
    // Collapse unknown names so we never store free-form strings.
    if (/^[A-Za-z][A-Za-z0-9]{0,40}Error$/.test(name)) return "OtherError";
    return "Error";
  } catch {
    return "Error";
  }
}

function reportClientError(input?: unknown) {
  try {
    const key = "tg_client_error_reports";
    const count = Number(sessionStorage.getItem(key) || "0");
    if (count >= MAX_REPORTS_PER_SESSION) return;
    sessionStorage.setItem(key, String(count + 1));
    const errorClass = classifyError(input);
    const body = JSON.stringify({
      schemaVersion: 1,
      event: "client_error",
      errorClass,
    });
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
    const onError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason ?? event);
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

/** Exported for unit tests only. */
export const __test = { classifyError, ALLOWED_ERROR_NAMES };
