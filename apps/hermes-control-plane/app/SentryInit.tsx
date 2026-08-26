"use client";

import { useEffect } from "react";
import { captureFirstError, sentryDsnFromEnv } from "@/lib/sentry";
import { WebMcpInit } from "./WebMcpInit";

/**
 * First-error-only client hook. Mounted from the root layout.
 * No-ops when NEXT_PUBLIC_SENTRY_DSN is unset. No replay, no profiling.
 */
export function SentryInit() {
  useEffect(() => {
    if (!sentryDsnFromEnv()) return;
    const onError = (event: ErrorEvent) => {
      void captureFirstError(event.error ?? event);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void captureFirstError(event.reason ?? event);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return <WebMcpInit />;
}
