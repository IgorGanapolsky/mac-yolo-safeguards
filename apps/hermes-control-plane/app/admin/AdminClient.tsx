"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminMetrics } from "@/lib/admin-metrics";

const HUMAN_KEY_MAP: Record<string, string> = {
  runnerHealthUrl: "Cloud Runner Endpoint",
  runnerRaw: "Runner Diagnostic State",
  runnerError: "Runner Connection Errors",
  runnerFetchMs: "Cloud Runner Latency",
  d1PingMs: "Database Latency",
  workosAuthConfigured: "WorkOS Authentication",
  workosRedirectUri: "OAuth Redirect URI",
  stripeCheckoutConfigured: "Stripe Billing Engine",
  stripeWebhookConfigured: "Stripe Event Webhook",
  cloudRunnerConfigured: "Cloud Runner Authorization",
  lastPollAt: "Last Health Check",
  lastTaskAt: "Last Cloud Execution Task",
  degraded: "Runner Degraded State",
  consecutiveErrors: "Consecutive Error Count",
  lastError: "Last Runner Error",
  sessions: "Active Web Sessions",
  events: "Recent Billing Events",
  funnelToday: "Daily Landing Funnel",
  topAuditActions24h: "24h System Action Audit Log",
  recentAuditEvents: "Recent Machine Audit Logs",
  taskCountsByStatus: "Task Execution Counts by Status",
  failoverMode: "Offline Failover Policy",
  lastSeenAt: "Last Machine Check-In",
  revokedAt: "Machine Revocation Status",
  leaseOwner: "Active Cloud Runner Host",
  leaseGeneration: "Fencing Token Lease Generation",
  leaseExpiresAt: "Lease Expiration Timestamp",
  createdAt: "Registration / Created Date",
  updatedAt: "Last Activity Timestamp",
  completedAt: "Task Completion Timestamp",
  config: "System & Authentication Services",
};

function humanizeKey(key: string): string {
  if (HUMAN_KEY_MAP[key]) return HUMAN_KEY_MAP[key];
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function fmtTime(ms: number | null | undefined): string {
  if (!ms || ms === 0) return "Never / No tasks executed yet";
  try {
    const date = new Date(ms);
    const ago = fmtAge(Math.max(0, Math.floor((Date.now() - ms) / 1000)));
    return `${date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })} (${ago})`;
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

/** Formatted detail view: converts raw timestamps to human dates and renders clean key-value telemetry pairs. */
function RawDetail({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <p className="admin-muted">Loading live telemetry…</p>;

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    return (
      <div className="admin-formatted-detail">
        <ul className="admin-kv">
          {entries.map(([key, val]) => {
            const title = humanizeKey(key);
            let rendered: React.ReactNode;

            if (val === null || val === undefined) rendered = <span className="admin-muted">None / Clear</span>;
            else if (typeof val === "boolean") rendered = <b className={val ? "badge-success" : "badge-warn"}>{val ? "Active / Configured" : "Inactive / Not Configured"}</b>;
            else if (typeof val === "number") {
              if (val > 1_500_000_000_000) rendered = <b>{fmtTime(val)}</b>;
              else if (val === 0 && (key.toLowerCase().includes("at") || key.toLowerCase().includes("time") || key.toLowerCase().includes("task"))) rendered = <span className="admin-muted">Never / No tasks executed yet</span>;
              else if (key.endsWith("Ms")) rendered = <b>{val}ms</b>;
              else rendered = <b>{val.toLocaleString()}</b>;
            } else if (typeof val === "string" && val.startsWith("http")) {
              rendered = (
                <a href={val} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                  {val}
                </a>
              );
            } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
              rendered = (
                <div className="admin-nested-kv" style={{ marginTop: "6px" }}>
                  <ul className="admin-kv">
                    {Object.entries(val as Record<string, unknown>).map(([nk, nv]) => (
                      <li key={nk}>
                        <span>{humanizeKey(nk)}</span>
                        {typeof nv === "number" && nv > 1_500_000_000_000 ? <b>{fmtTime(nv)}</b>
                          : typeof nv === "number" && nv === 0 && (nk.toLowerCase().includes("at") || nk.toLowerCase().includes("time") || nk.toLowerCase().includes("task")) ? <span className="admin-muted">Never / No tasks executed yet</span>
                          : typeof nv === "number" && nk.endsWith("Ms") ? <b>{nv}ms</b>
                          : typeof nv === "boolean" ? <b>{nv ? "Active / Configured" : "Inactive / Not Configured"}</b>
                          : nv === null ? <span className="admin-muted">None</span>
                          : <b>{String(nv)}</b>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            } else if (Array.isArray(val)) {
              if (val.length === 0) rendered = <span className="admin-muted">No entries recorded</span>;
              else {
                rendered = (
                  <div className="admin-nested-kv" style={{ marginTop: "6px" }}>
                    <ul className="admin-kv">
                      {val.map((item, idx) => (
                        <li key={idx}>
                          <span>Entry #{idx + 1}</span>
                          <b>{typeof item === "object" ? JSON.stringify(item) : String(item)}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
            } else rendered = <b>{String(val)}</b>;

            return (
              <li key={key}>
                <span>{title}</span>
                {rendered}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return <pre className="admin-raw">{JSON.stringify(data, null, 2)}</pre>;
}

/** Click-to-expand wrapper: fetches /api/admin/detail?kind=...&id=... once, toggles visibility after. */
function Expandable({
  id,
  label,
  children,
  fetchDetail,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  fetchDetail: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data === undefined && !loading) {
      setLoading(true);
      try {
        setData(await fetchDetail());
      } catch (error) {
        setData({ error: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className={`admin-expandable ${open ? "is-open" : ""}`}>
      <button type="button" className="admin-expandable-trigger" onClick={() => void toggle()} aria-expanded={open} data-testid={`expand-${id}`}>
        {children}
        <span className="admin-expandable-caret" aria-hidden="true">{open ? "▲" : "▶"}</span>
      </button>
      {open ? (
        <div className="admin-expandable-body">
          <p className="admin-muted admin-detail-label">{label}</p>
          {loading ? <p className="admin-muted">Loading…</p> : <RawDetail data={data} />}
        </div>
      ) : null}
    </div>
  );
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

  async function fetchDetail(kind: string, id?: string): Promise<unknown> {
    const qs = new URLSearchParams({ kind, ...(id ? { id } : {}) });
    const response = await fetch(`/api/admin/detail?${qs}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`detail fetch failed: HTTP ${response.status}`);
    return response.json();
  }

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
            Real-time ops view · auto-refresh 15s · click any card for raw technical detail · no proprietary chat content · no IPs
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
            <Expandable id="health" label="Raw control-plane + runner health (fresh fetch, live)" fetchDetail={() => fetchDetail("health")}>
              <article className={`admin-metric ${m.health.controlPlaneOk ? "is-ok" : "is-bad"}`}>
                <span>Control plane</span>
                <strong>{m.health.controlPlaneOk ? "OK" : "DOWN"}</strong>
                <small>D1 {m.health.database}</small>
              </article>
            </Expandable>
            <Expandable id="runner" label="Raw control-plane + runner health (fresh fetch, live)" fetchDetail={() => fetchDetail("health")}>
              <article className={`admin-metric ${m.health.runnerOk ? "is-ok" : "is-bad"}`}>
                <span>VPS Continuity runner</span>
                <strong>{m.health.runnerOk ? "OK" : "DEGRADED"}</strong>
                <small>last task {fmtTime(m.health.runnerLastTaskAt)}</small>
              </article>
            </Expandable>
            <Expandable id="revenue-summary" label="Last 50 non-canary billing_events rows" fetchDetail={() => fetchDetail("revenue")}>
              <article className="admin-metric">
                <span>Projected MRR</span>
                <strong>${m.revenue.projectedMrrUsd}</strong>
                <small>{m.revenue.paidOrganizations} paid × ${m.revenue.listPriceUsdPerMonth}</small>
              </article>
            </Expandable>
            <Expandable id="cloud-success" label="Full activity + funnel breakdown" fetchDetail={() => fetchDetail("activity")}>
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
            </Expandable>
          </section>

          <section className="admin-grid admin-grid-3">
            <Expandable id="sessions" label="Last 50 session rows (id/org hashed prefixes only)" fetchDetail={() => fetchDetail("sessions")}>
              <article className="admin-panel">
                <h2>Sessions &amp; activity (24h)</h2>
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
            </Expandable>

            <Expandable id="revenue" label="Last 50 non-canary billing_events rows" fetchDetail={() => fetchDetail("revenue")}>
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
            </Expandable>

            <article className="admin-panel admin-panel-static">
              <h2>Hermes Agent System Engine</h2>
              <p className="admin-muted">
                Cloud Continuity runs the complete multi-model Hermes Agentic Engine — supporting DeepSeek, Claude, and local Qwen with tools, memory recall, and subagent orchestration.
              </p>
              <ul className="admin-kv">
                <li><span>Fly.io Runner Fleet</span><b>Active (Autostop Billed)</b></li>
                <li><span>Est. Cloud Infra / Sub</span><b>~$0.30 – $1.94/mo</b></li>
                <li><span>Est. Gross Margin</span><b>~74% ($7.41 profit / sub)</b></li>
              </ul>
              <p className="admin-muted" style={{ marginTop: "12px" }}>
                <a href="https://fly.io/dashboard/igor/billing" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                  Open Fly.io Real-Time Billing Dashboard →
                </a>
              </p>
            </article>
          </section>

          <section className="admin-grid admin-grid-2">
            <Expandable id="funnel" label="Full funnel + audit-action breakdown" fetchDetail={() => fetchDetail("activity")}>
              <article className="admin-panel">
                <h2>Landing Funnel (Today)</h2>
                <ul className="admin-kv">
                  {Object.entries(m.activity.funnelToday).map(([k, v]) => (
                    <li key={k}><span>{k}</span><b>{v}</b></li>
                  ))}
                </ul>
                <h3>Top System Actions (24h)</h3>
                <ul className="admin-kv">
                  {m.activity.topAuditActions24h.map((row) => (
                    <li key={row.action}><span>{row.action}</span><b>{row.count}</b></li>
                  ))}
                </ul>
              </article>
            </Expandable>

            <article className="admin-panel admin-panel-static">
              <h2>Paired Devices &amp; Connectors</h2>
              <p className="admin-muted">
                Connector-paired machines across active organizations.
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Offline policy</th>
                      <th>Last seen</th>
                      <th>Device ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.paidMachines.length === 0 ? (
                      <tr><td colSpan={5}>No active paired devices</td></tr>
                    ) : m.paidMachines.map((device) => (
                      <ExpandableRow
                        key={device.deviceIdPrefix + device.name}
                        colSpan={5}
                        detailLabel={`Audit trail for ${device.name}`}
                        fetchDetail={() => fetchDetail("device", device.deviceIdPrefix)}
                      >
                        <td>{device.name}</td>
                        <td>{device.online ? "online" : "stale"}</td>
                        <td>{device.failoverMode}</td>
                        <td>{fmtAge(device.ageSeconds)}</td>
                        <td><code>{device.deviceIdPrefix}…</code></td>
                      </ExpandableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="admin-panel admin-panel-static">
            <h2>VPS Continuity Executions</h2>
            <p className="admin-muted">Fenced execution log of cloud continuations.</p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Task ID</th>
                    <th>Status</th>
                    <th>Route</th>
                    <th>Created</th>
                    <th>Duration</th>
                    <th>Canary</th>
                  </tr>
                </thead>
                <tbody>
                  {m.continuityRuns.length === 0 ? (
                    <tr><td colSpan={6}>No cloud runs recorded</td></tr>
                  ) : m.continuityRuns.map((run) => (
                    <ExpandableRow
                      key={run.taskIdPrefix + run.createdAt}
                      colSpan={6}
                      detailLabel={`Fenced lease details for ${run.taskIdPrefix}…`}
                      fetchDetail={() => fetchDetail("task", run.taskIdPrefix)}
                    >
                      <td><code>{run.taskIdPrefix}…</code></td>
                      <td>{run.status}</td>
                      <td>{run.route}</td>
                      <td>{fmtTime(run.createdAt)}</td>
                      <td>{run.durationMs === null ? "—" : `${Math.round(run.durationMs / 1000)}s`}</td>
                      <td>{run.isCanary ? "yes" : "—"}</td>
                    </ExpandableRow>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="admin-footer">
            <p className="admin-muted">{m.privacy.note}</p>
            <p className="admin-muted">Checked {fmtTime(m.checkedAt)} · Real-time Control Plane Telemetry (thumbgate.app/admin)</p>
          </footer>
        </>
      )}
    </div>
  );
}

/** Table-row variant of Expandable: renders as a normal <tr>, expands into a full-width detail <tr> beneath it. */
function ExpandableRow({
  children,
  colSpan,
  detailLabel,
  fetchDetail,
}: {
  children: React.ReactNode;
  colSpan: number;
  detailLabel: string;
  fetchDetail: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data === undefined && !loading) {
      setLoading(true);
      try {
        setData(await fetchDetail());
      } catch (error) {
        setData({ error: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <tr className="admin-table-row-clickable" onClick={() => void toggle()} aria-expanded={open}>
        {children}
      </tr>
      {open ? (
        <tr className="admin-table-detail-row">
          <td colSpan={colSpan}>
            <p className="admin-muted admin-detail-label">{detailLabel}</p>
            {loading ? <p className="admin-muted">Loading…</p> : <RawDetail data={data} />}
          </td>
        </tr>
      ) : null}
    </>
  );
}
