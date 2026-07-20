"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = { id: string; email: string; name: string; avatarUrl: string | null };
type Organization = { id: string; plan: string };
type Device = { id: string; name: string; fingerprint: string; failoverMode: "disabled" | "manual" | "auto"; lastSeenAt: number | null; online: boolean };
type Thread = { id: string; title: string; taskCount: number; updatedAt: number; source: string; model: string | null; preview: string | null; messageCount: number; sourceSessionId: string | null; syncedAt: number | null; deviceName: string | null };
type Task = { id: string; threadId: string; threadTitle: string; prompt: string; status: string; route: string; result: string | null; error: string | null; createdAt: number; deviceName: string | null };
type ThreadDetails = { snapshot: Array<{ role: string; content: string }>; tasks: Array<{ prompt: string; result: string | null; error: string | null; route: string; status: string; createdAt: number }> };

const terminal = new Set(["completed", "failed"]);

function Mark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>; }
function age(timestamp: number | null) {
  if (!timestamp) return "never connected";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function DashboardClient() {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [threadDetails, setThreadDetails] = useState<ThreadDetails | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const me = await fetch("/api/me", { cache: "no-store" });
    if (me.status === 401) { window.location.href = "/?auth=required"; return; }
    const identity = await me.json() as { user: User; organization: Organization };
    setUser(identity.user); setOrganization(identity.organization);
    const [deviceResponse, threadResponse, taskResponse] = await Promise.all([
      fetch("/api/devices", { cache: "no-store" }), fetch("/api/threads", { cache: "no-store" }), fetch("/api/tasks", { cache: "no-store" }),
    ]);
    if (deviceResponse.ok) setDevices((await deviceResponse.json() as { devices: Device[] }).devices);
    if (threadResponse.ok) setThreads((await threadResponse.json() as { threads: Thread[] }).threads);
    if (taskResponse.ok) setTasks((await taskResponse.json() as { tasks: Task[] }).tasks);
    if (selectedThread) {
      const detailResponse = await fetch(`/api/thread-messages?thread_id=${encodeURIComponent(selectedThread)}`, { cache: "no-store" });
      if (detailResponse.ok) setThreadDetails(await detailResponse.json() as ThreadDetails);
    } else setThreadDetails(null);
  }, [selectedThread]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
  const activeTasks = useMemo(() => tasks.filter((task) => !terminal.has(task.status)), [tasks]);
  const visibleTasks = selectedThread ? tasks.filter((task) => task.threadId === selectedThread) : tasks;

  async function pair(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    const response = await fetch("/api/pairing/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userCode: pairCode }) });
    const body = await response.json() as { device?: Device; error?: string };
    setNotice(response.ok && body.device ? `${body.device.name} paired. Fingerprint ${body.device.fingerprint}.` : body.error ?? "Pairing failed");
    if (response.ok) { setPairCode(""); await load(); }
    setBusy(false);
  }

  async function createTask(event: FormEvent) {
    event.preventDefault(); if (!prompt.trim()) return;
    setBusy(true); setNotice(null);
    const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, threadId: selectedThread, idempotencyKey: crypto.randomUUID() }) });
    const body = await response.json() as { task?: { route: string; threadId: string }; error?: string };
    setNotice(response.ok && body.task ? `Task routed ${body.task.route}.` : body.error ?? "Task routing failed");
    if (response.ok && body.task) { setPrompt(""); setSelectedThread(body.task.threadId); await load(); }
    setBusy(false);
  }

  async function updateFailover(deviceId: string, failoverMode: Device["failoverMode"]) {
    const response = await fetch("/api/devices", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, failoverMode }) });
    const body = await response.json() as { error?: string }; setNotice(response.ok ? `Failover policy set to ${failoverMode}.` : body.error ?? "Update failed"); await load();
  }

  async function failover(taskId: string) {
    const response = await fetch("/api/tasks/failover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId }) });
    const body = await response.json() as { error?: string }; setNotice(response.ok ? "Cloud failover approved." : body.error ?? "Failover failed"); await load();
  }

  async function subscribe() {
    setBusy(true);
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const body = await response.json() as { url?: string; error?: string };
    if (response.ok && body.url) window.location.href = body.url; else setNotice(body.error ?? "Checkout is unavailable");
    setBusy(false);
  }

  if (!user || !organization) return <main className="loading-screen"><Mark /><p>Opening the control plane…</p></main>;

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <a href="/dashboard" className="brand"><Mark /><span>Hermes Control</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <button className={!selectedThread ? "side-item active" : "side-item"} onClick={() => setSelectedThread(null)}><span>⌁</span>All activity<em>{activeTasks.length}</em></button>
        <div className="workspace-label">THREADS</div>
        <div className="thread-list">{threads.map((thread) => <button key={thread.id} title={thread.title} className={selectedThread === thread.id ? "side-item active" : "side-item"} onClick={() => setSelectedThread(thread.id)}><span>{thread.sourceSessionId ? "⌘" : "›_"}</span>{thread.title}<em>{thread.messageCount || thread.taskCount}</em></button>)}</div>
        <div className="sidebar-bottom"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><strong>{user.name}</strong><small>{organization.plan} plan</small></div><form action="/api/auth/logout" method="post"><button title="Sign out">↗</button></form></div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header"><div><p className="eyebrow">CONTROL PLANE</p><h1>{selectedThread ? threads.find((thread) => thread.id === selectedThread)?.title : "Agent operations"}</h1></div><div className="header-actions"><span className="status-chip online"><i /> Control plane online</span><button className="button button-small button-secondary" onClick={() => void subscribe()} disabled={busy}>Manage plan</button></div></header>
        {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice(null)}>×</button></div>}

        <div className="metric-grid">
          <article><span>Paired machines</span><strong>{devices.length}</strong><small>{devices.filter((device) => device.online).length} online now</small></article>
          <article><span>Active tasks</span><strong>{activeTasks.length}</strong><small>{tasks.filter((task) => task.route === "cloud" && !terminal.has(task.status)).length} routed to cloud</small></article>
          <article><span>Execution safety</span><strong className="safe-copy">Fenced</strong><small>90-second renewable leases</small></article>
        </div>

        <div className="dashboard-grid">
          <section className="panel task-panel">
            <div className="panel-heading"><div><p className="eyebrow">THREAD CONSOLE</p><h2>Continue the work</h2></div><span>{selectedThread ? `${threadDetails?.snapshot.length ?? 0} synced messages` : `${visibleTasks.length} tasks`}</span></div>
            {selectedThread && <div className="conversation-history">
              {threadDetails?.snapshot.length ? threadDetails.snapshot.map((message, index) => <article key={`snapshot-${index}`} className={`conversation-message role-${message.role}`}><span>{message.role}</span><p>{message.content}</p></article>) : <div className="conversation-empty">This thread has no cloud snapshot yet. Keep the paired Hermes connector online to sync it.</div>}
              {threadDetails?.tasks.flatMap((task, index) => [
                <article key={`task-user-${index}`} className="conversation-message role-user"><span>web</span><p>{task.prompt}</p></article>,
                task.result ? <article key={`task-result-${index}`} className="conversation-message role-assistant"><span>{task.route}</span><p>{task.result}</p></article> : null,
              ])}
            </div>}
            <form className="composer" onSubmit={createTask}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Tell Hermes what to do next…" rows={4} /><div><small>{devices.length ? "Routes to your paired machine or fenced cloud runner" : "Pair a machine before creating a task"}</small><button className="button button-primary button-small" disabled={busy || !devices.length}>Run task →</button></div></form>
            <div className="task-list">{visibleTasks.length === 0 ? <div className="empty-state"><Mark /><h3>No tasks yet</h3><p>Pair a machine, then continue a Hermes thread from anywhere.</p></div> : visibleTasks.map((task) => <article key={task.id} className="dashboard-task"><div className="task-top"><span className={`task-status status-${task.status}`}>{task.status.replaceAll("_", " ")}</span><time>{new Date(task.createdAt).toLocaleString()}</time></div><h3>{task.threadTitle}</h3><p>{task.prompt}</p><div className="task-foot"><span>{task.route === "cloud" ? "☁ Cloud runner" : task.route === "local" ? `⌘ ${task.deviceName ?? "Hermes machine"}` : "Ⅱ Awaiting route"}</span>{["needs_failover", "offline_blocked"].includes(task.status) && <button onClick={() => void failover(task.id)}>Continue in cloud →</button>}</div>{task.result && <pre>{task.result}</pre>}{task.error && <div className="task-error">{task.error}</div>}</article>)}</div>
          </section>

          <aside className="right-rail">
            <section className="panel"><div className="panel-heading"><div><p className="eyebrow">MACHINES</p><h2>Paired Hermes</h2></div></div>{devices.map((device) => <article key={device.id} className="device-card"><div><span className={`device-light ${device.online ? "is-online" : ""}`} /><div><strong>{device.name}</strong><small>{device.online ? "Online" : `Last seen ${age(device.lastSeenAt)}`}</small></div></div><code>{device.fingerprint}</code><label>Offline policy<select value={device.failoverMode} onChange={(event) => void updateFailover(device.id, event.target.value as Device["failoverMode"])}><option value="manual">Ask before cloud</option><option value="auto">Continue automatically</option><option value="disabled">Pause until online</option></select></label></article>)}<form className="pair-form" onSubmit={pair}><label>Pairing code<input value={pairCode} onChange={(event) => setPairCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={9} /></label><button className="button button-secondary button-small" disabled={busy}>Approve machine</button></form><p className="helper-copy">The code and fingerprint are shown by the Hermes cloud connector. Your device private key never leaves that machine.</p></section>
          </aside>
        </div>
      </section>
    </main>
  );
}
