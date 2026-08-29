"use client";

import { useEffect, useRef, useState } from "react";
import { shareableMessageText } from "@/lib/message-actions";

type CopyState = "idle" | "copied" | "shared" | "failed";

/**
 * Quick actions rendered under every Hermes output bubble: one-tap Copy and
 * Share (native share sheet where available, clipboard fallback elsewhere).
 * Shares exactly the sanitized text the user sees — never raw tool protocol.
 */
export function MessageActions({ text, hideToolProtocol = false, label = "response" }: { text: string | null | undefined; hideToolProtocol?: boolean; label?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const [canShare, setCanShare] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    return () => { if (resetTimer.current) clearTimeout(resetTimer.current); };
  }, []);

  const payload = shareableMessageText(text, { hideToolProtocol });
  if (!payload) return null;

  const flash = (next: CopyState) => {
    setState(next);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 2000);
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      flash("copied");
    } catch {
      flash("failed");
    }
  }

  async function share() {
    try {
      await navigator.share({ text: payload });
      flash("shared");
    } catch (error) {
      // AbortError = user dismissed the sheet; not a failure worth surfacing.
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copy();
    }
  }

  return (
    <div className="message-actions" data-testid="message-actions" aria-label={`Actions for this ${label}`}>
      <button type="button" onClick={() => void copy()} aria-label={`Copy this ${label} to the clipboard`}>
        {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy unavailable" : "Copy"}
      </button>
      {canShare && (
        <button type="button" onClick={() => void share()} aria-label={`Share this ${label}`}>
          {state === "shared" ? "Shared ✓" : "Share"}
        </button>
      )}
    </div>
  );
}
