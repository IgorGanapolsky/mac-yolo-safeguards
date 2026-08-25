"use client";

import { useEffect } from "react";
import { captureFirstError } from "@/lib/sentry";
import { shouldEmitDuplicate } from "@/lib/hosted-alert-correlate";

const endpoint = "/api/analytics/event";
const MAX_REPORTS_PER_SESSION = 8;
const SIG_STORE_KEY = "tg_client_error_sigs";

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
 * - Always increments client_error (health.telemetry.clientErrorsToday) unless
 *   the same errorClass was already reported inside the duplicate window
 *   (Digitate/ignio process steal: suppress duplicate signatures).
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

function loadSignatureTimes(): Record<string, number> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SIG_STORE_KEY) || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function shouldReportClientError(
  errorClass: string,
  now: number,
  lastBySignature: Record<string, number>,
  sessionCount: number,
): { emit: boolean; reason: string } {
  if (sessionCount >= MAX_REPORTS_PER_SESSION) {
    return { emit: false, reason: "session_cap" };
  }
  return shouldEmitDuplicate({
    signature: `client_error:${errorClass}`,
    now,
    lastBySignature,
  });
}

function reportClientError(input?: unknown) {
  try {
    const key = "tg_client_error_reports";
    const count = Number(sessionStorage.getItem(key) || "0");
    const errorClass = classifyError(input);
    const now = Date.now();
    const lastBySignature = loadSignatureTimes();
    const decision = shouldReportClientError(errorClass, now, lastBySignature, count);
    if (!decision.emit) return;
    lastBySignature[`client_error:${errorClass}`] = now;
    sessionStorage.setItem(SIG_STORE_KEY, JSON.stringify(lastBySignature));
    sessionStorage.setItem(key, String(count + 1));
    void captureFirstError({ name: errorClass });
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
export const __test = {
  classifyError,
  ALLOWED_ERROR_NAMES,
  shouldReportClientError,
  MAX_REPORTS_PER_SESSION,
};
