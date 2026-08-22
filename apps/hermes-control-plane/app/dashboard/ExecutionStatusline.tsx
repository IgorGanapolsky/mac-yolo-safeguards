"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExecutionStatusline } from "@/lib/execution-statusline";
import { formatCost, formatLatency, formatTokens } from "@/lib/execution-statusline";
import styles from "./execution-statusline.module.css";

const EMPTY = "—";

export function ExecutionStatusline() {
  const [turn, setTurn] = useState<ExecutionStatusline | null>(null);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/api/execution-statusline", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { statusline?: ExecutionStatusline | null };
      setTurn(payload.statusline ?? null);
    } catch {
      // The dashboard remains usable during a transient telemetry read failure.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return (
    <aside className={styles.statusline} aria-label="Latest completed turn telemetry">
      <div className={styles.title}>
        <span aria-hidden="true">▥</span>
        <strong>Turn Statusline</strong>
        <em data-status={turn?.status ?? "waiting"}>{turn?.status ?? "waiting"}</em>
      </div>
      <div className={styles.metric}><span>Engine</span><strong>{turn?.engine ?? EMPTY}</strong></div>
      <div className={styles.metric}><span>Model</span><strong>{turn?.model ?? EMPTY}</strong></div>
      <div className={styles.metric}><span>Duration</span><strong>{formatLatency(turn?.durationMs ?? null)}</strong></div>
      <div className={styles.metric}><span>Tokens</span><strong>{formatTokens(turn?.promptTokens ?? null, turn?.completionTokens ?? null)}</strong></div>
      <div className={styles.metric}><span>TTFT</span><strong>{formatLatency(turn?.ttftMs ?? null)}</strong></div>
      <div className={styles.metric}><span>Cost</span><strong>{formatCost(turn?.costUsd ?? null)}</strong></div>
    </aside>
  );
}
