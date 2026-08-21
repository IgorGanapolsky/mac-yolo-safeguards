"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../approval-inbox.module.css";

type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "consumed";
interface Approval {
  id: string;
  taskId: string;
  actionClass: string;
  summary: string;
  argumentDigest: string;
  status: ApprovalStatus;
  expiresAt: number;
  requestedAt: number;
  decidedAt: number | null;
}
interface Inbox { pendingCount: number; approvals: Approval[] }

function timestamp(value: number | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export function ApprovalInboxClient({ initial }: { initial: Inbox }) {
  const [inbox, setInbox] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/approvals", { cache: "no-store" });
    if (!response.ok) throw new Error("Approval inbox could not be refreshed");
    setInbox(await response.json() as Inbox);
    setUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const startedAt = Date.now();
    const poll = async () => {
      if (stopped || Date.now() - startedAt > 2 * 60 * 1000) return;
      if (document.visibilityState === "visible") await refresh().catch(() => undefined);
      timer = setTimeout(poll, 3_000);
    };
    timer = setTimeout(poll, 3_000);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [refresh]);

  const decide = async (id: string, decision: "approved" | "denied") => {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Decision failed");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className={styles.toolbar}>
        <span><strong>{inbox.pendingCount}</strong> pending · {updatedAt ? `updated ${new Date(updatedAt).toLocaleTimeString()}` : "server snapshot"}</span>
        <button className={styles.refreshButton} type="button" disabled={busyId !== null} onClick={() => refresh().catch((cause) => setError(cause.message))}>Refresh inbox</button>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {inbox.approvals.length === 0 ? <p className={styles.empty}>No action approvals yet.</p> : (
        <section className={styles.list} aria-label="Hosted action approvals">
          {inbox.approvals.map((approval) => (
            <article className={`${styles.card} ${approval.status === "pending" ? styles.cardPending : ""}`} key={approval.id}>
              <div className={styles.cardMeta}>
                <span className={styles.status}>{approval.status}</span>
                <span>{approval.actionClass} · requested {timestamp(approval.requestedAt)}</span>
              </div>
              <h2>{approval.summary}</h2>
              <p className={styles.details}>Task {approval.taskId} · digest {approval.argumentDigest.slice(0, 12)}… · expires {timestamp(approval.expiresAt)}</p>
              {approval.status === "pending" ? (
                <div className={styles.actions}>
                  <button className={styles.approve} type="button" disabled={busyId !== null} onClick={() => decide(approval.id, "approved")}>Approve once</button>
                  <button className={styles.deny} type="button" disabled={busyId !== null} onClick={() => decide(approval.id, "denied")}>Deny</button>
                </div>
              ) : <p className={styles.notice}>Decision recorded {timestamp(approval.decidedAt)}.</p>}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
