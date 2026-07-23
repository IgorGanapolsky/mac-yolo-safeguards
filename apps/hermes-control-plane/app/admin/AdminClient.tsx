"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminMetrics } from "@/lib/admin-metrics";

function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
  } catch {
    return "—";
  }
}

function fmtAge(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function AdminClient(props: {
  configured: boolean;
  initiallyAuthed: boolean;
  initialMetrics: AdminMetrics | null;
}) {
  const [authed, setAuthed] = useState(props.initiallyAuthed);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(props.initialMetrics);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/metrics", { cache: "no-store" });
    if (response.status === 401) {
      setAuthed(false);
      setMetrics(null);
      return;
    }
    if (!response.ok) {
      setError("Failed to load metrics");
      return;
    }
    setMetrics(await response.json() as AdminMetrics);
    setError(null);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [authed, refresh]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Login failed");
        return;
      }
      setAuthed(true);
      setPassword("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setMetrics(null);
  }

  if (!props.configured) {
    return (
      <section className="admin-card">
        <h1>Admin not configured</h1>
        <p>
          Set Cloudflare secrets <code>THUMBGATE_ADMIN_EMAIL</code> and{" "}
          <code>THUMBGATE_ADMIN_PASSWORD_HASH</code> (scrypt <code>salt:hash</code>), then redeploy.
        </p>
        <p className="admin-muted">No LangChain / LangSmith required — this uses D1 + runner health only.</p>
      </section>
    );
  }

  if (!authed) {
    return (
      <section className="admin-login">
        <h1>ThumbGate Admin</h1>
        <p className="admin-muted">Observability only. No chat bodies. No IPs.</p>
        <form onSubmit={login} className="admin-form">
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="admin-error">{error}</p> : null}
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    );
  }

  const m = metrics;
  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div>
          <p className="eyebrow">THUMBGATE ADMIN</p>
          <h1>Observability</h1>
          <p className="admin-muted">
            Real-time ops view · auto-refresh 15s · no proprietary chat content · no IPs
          </p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="button button-secondary button-small" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="button button-ghost button-small" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      {!m ? (
        <p className="admin-error">Metrics unavailable.</p>
      ) : (
        <>
          <section className="admin-grid admin-grid-4">
            <article className={`admin-metric ${m.health.controlPlaneOk ? "is-ok" : "is-bad"}`}>
              <span>Control plane</span>
              <strong>{m.health.controlPlaneOk ? "OK" : "DOWN"}</strong>
              <small>D1 {m.health.database}</small>
            </article>
            <article className={`admin-metric ${m.health.runnerOk ? "is-ok" : "is-bad"}`}>
              <span>VPS Continuity runner</span>
              <strong>{m.health.runnerOk ? "OK" : "DEGRADED"}</strong>
              <small>last task {fmtTime(m.health.runnerLastTaskAt)}</small>
            </article>
            <article className="admin-metric">
              <span>Projected MRR</span>
              <strong>${m.revenue.projectedMrrUsd}</strong>
              <small>{m.revenue.paidOrganizations} paid × ${m.revenue.listPriceUsdPerMonth}</small>
            </article>
            <article className="admin-metric">
              <span>Cloud success 30d</span>
              <strong>
                {m.activity.cloudSuccessRate30d === null
                  ? "—"
                  : `${Math.round(m.activity.cloudSuccessRate30d * 100)}%`}
              </strong>
              <small>
                {m.activity.cloudCompleted30d} ok / {m.activity.cloudFailed30d} fail
              </small>
            </article>
          </section>

          <section className="admin-grid admin-grid-3">
            <article className="admin-panel">
              <h2>Sessions & activity (24h)</h2>
              <ul className="admin-kv">
                <li><span>Active web sessions</span><b>{m.sessions.activeWebSessions}</b></li>
                <li><span>Logins</span><b>{m.sessions.loginsLast24h}</b></li>
                <li><span>Sessions created</span><b>{m.sessions.sessionsCreatedLast24h}</b></li>
                <li><span>Tasks created</span><b>{m.activity.tasksCreatedLast24h}</b></li>
                <li><span>Tasks completed</span><b>{m.activity.tasksCompletedLast24h}</b></li>
                <li><span>Tasks failed</span><b>{m.activity.tasksFailedLast24h}</b></li>
                <li><span>Audit events</span><b>{m.activity.auditEventsLast24h}</b></li>
                <li><span>Cloud inflight</span><b>{m.activity.cloudInflight}</b></li>
                <li><span>Local completed 30d</span><b>{m.activity.localCompleted30d}</b></li>
              </ul>
            </article>

            <article className="admin-panel">
              <h2>Revenue (projected)</h2>
              <ul className="admin-kv">
                <li><span>Paid orgs</span><b>{m.revenue.paidOrganizations}</b></li>
                <li><span>List price</span><b>${m.revenue.listPriceUsdPerMonth}/mo</b></li>
                <li><span>Projected MRR</span><b>${m.revenue.projectedMrrUsd}</b></li>
                <li><span>Projected ARR</span><b>${m.revenue.projectedArrUsd}</b></li>
                <li><span>Billing events 24h</span><b>{m.revenue.billingEventsLast24h}</b></li>
                <li><span>Last real billing</span><b>{fmtTime(m.revenue.realBillingEventLatestAt)}</b></li>
              </ul>
              <p className="admin-muted">{m.revenue.note}</p>
            </article>

            <article className="admin-panel">
              <h2>Tokens / cost</h2>
              <p className="admin-muted">{m.tokens.note}</p>
              <ul className="admin-kv">
                <li><span>Usage rows 24h</span><b>{m.tokens.rows24h}</b></li>
                <li><span>Prompt tokens 24h</span><b>{m.tokens.promptTokens24h.toLocaleString()}</b></li>
                <li><span>Completion tokens 24h</span><b>{m.tokens.completionTokens24h.toLocaleString()}</b></li>
                <li><span>Total tokens 24h</span><b>{m.tokens.totalTokens24h.toLocaleString()}</b></li>
                <li><span>Total tokens 30d</span><b>{m.tokens.totalTokens30d.toLocaleString()}</b></li>
                <li><span>Model $ 24h (est.)</span><b>${m.cost.estimatedModelUsd24h.toFixed(4)}</b></li>
                <li><span>Model $ 30d (est.)</span><b>${m.cost.estimatedModelUsd30d.toFixed(4)}</b></li>
                <li><span>Infra (Fly Continuity)</span><b>~${m.cost.estimatedContinuityInfraUsdPerMonth}/mo</b></li>
                <li><span>Combined 30d (model+infra)</span><b>~${m.cost.estimatedCombinedUsd30d.toFixed(4)}</b></li>
              </ul>
              <p className="admin-muted">{m.cost.note}</p>
              <p className="admin-muted">Price basis: {m.cost.priceBasis}</p>
              <p className="admin-muted">
                <strong>LangChain / LangSmith not required.</strong> Ledger is D1 <code>model_usage</code> from Continuity completes.
              </p>
            </article>
          </section>

          <section className="admin-grid admin-grid-2">
            <article className="admin-panel">
              <h2>Funnel today</h2>
              <ul className="admin-kv">
                {Object.entries(m.activity.funnelToday).map(([k, v]) => (
                  <li key={k}><span>{k}</span><b>{v}</b></li>
                ))}
              </ul>
              <h3>Top audit actions (24h)</h3>
              <ul className="admin-kv">
                {m.activity.topAuditActions24h.map((row) => (
                  <li key={row.action}><span>{row.action}</span><b>{row.count}</b></li>
                ))}
              </ul>
            </article>

            <article className="admin-panel">
              <h2>Paid machines (no IPs)</h2>
              <p className="admin-muted">
                Connector-paired machines on paid workspaces. Not Tailscale control-plane IPs — we do not store IPs.
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Offline policy</th>
                      <th>Last seen</th>
                      <th>Id</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.paidMachines.length === 0 ? (
                      <tr><td colSpan={5}>No paid machines</td></tr>
                    ) : m.paidMachines.map((device) => (
                      <tr key={device.deviceIdPrefix + device.name}>
                        <td>{device.name}</td>
                        <td>{device.online ? "online" : "stale"}</td>
                        <td>{device.failoverMode}</td>
                        <td>{fmtAge(device.ageSeconds)}</td>
                        <td><code>{device.deviceIdPrefix}…</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="admin-panel">
            <h2>VPS Continuity runs (no chat bodies)</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Route</th>
                    <th>Created</th>
                    <th>Duration</th>
                    <th>Canary</th>
                  </tr>
                </thead>
                <tbody>
                  {m.continuityRuns.length === 0 ? (
                    <tr><td colSpan={6}>No cloud runs yet</td></tr>
                  ) : m.continuityRuns.map((run) => (
                    <tr key={run.taskIdPrefix + run.createdAt}>
                      <td><code>{run.taskIdPrefix}…</code></td>
                      <td>{run.status}</td>
                      <td>{run.route}</td>
                      <td>{fmtTime(run.createdAt)}</td>
                      <td>{run.durationMs === null ? "—" : `${Math.round(run.durationMs / 1000)}s`}</td>
                      <td>{run.isCanary ? "yes" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="admin-footer">
            <p className="admin-muted">{m.privacy.note}</p>
            <p className="admin-muted">Checked {fmtTime(m.checkedAt)} · host this admin on thumbgate.app/admin (control plane). thumbgate.ai is a separate Railway product.</p>
          </footer>
        </>
      )}
    </div>
  );
}
