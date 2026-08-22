"use client";

import { useEffect, useState } from "react";
import { formatTurnStatusline } from "@/lib/turn-statusline";
import { TurnStatusline } from "./TurnStatusline";

type Payload = {
  providerLabel?: string | null;
  model?: string | null;
  ttftMs?: number | null;
  costUsd?: number | null;
};

export function DashboardTurnChrome() {
  const [status, setStatus] = useState(() => formatTurnStatusline());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/turn-status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as Payload;
        if (cancelled) return;
        setStatus(formatTurnStatusline(payload));
      } catch {
        // Keep the hosted default. A fetch miss is not a Mac Ollama engine.
      }
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return <TurnStatusline engine={status.engine} ttft={status.ttft} cost={status.cost} />;
}
