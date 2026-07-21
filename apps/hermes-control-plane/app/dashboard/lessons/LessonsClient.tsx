"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type User = { email: string; name: string };
type Counts = { total: number; up: number; down: number };
type Lesson = {
  id: string;
  taskId: string;
  signal: "up" | "down";
  note: string | null;
  updatedAt: number;
  prompt: string;
  result: string;
  route: string;
  completedAt: number | null;
  threadTitle: string;
};

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric",
    minute: "2-digit", second: "2-digit", hour12: true, timeZoneName: "short",
  }).format(new Date(timestamp));
}

export default function LessonsClient() {
  const [user, setUser] = useState<User | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, up: 0, down: 0 });
  const [signal, setSignal] = useState<"all" | "up" | "down">("all");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const me = await fetch("/api/me", { cache: "no-store" });
    if (me.status === 401) {
      window.location.replace(`/api/auth/login?return_to=${encodeURIComponent("/dashboard/lessons")}`);
      return;
    }
    const identity = await me.json() as { user: User };
    setUser(identity.user);
    const params = new URLSearchParams();
    if (signal !== "all") params.set("signal", signal);
    if (appliedQuery) params.set("q", appliedQuery);
    const response = await fetch(`/api/lessons?${params}`, { cache: "no-store" });
    if (response.ok) {
      const body = await response.json() as { lessons: Lesson[]; counts: Counts };
      setLessons(body.lessons);
      setCounts(body.counts);
    }
    setLoading(false);
  }, [appliedQuery, signal]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setAppliedQuery(query.trim());
  }

  if (!user) return <main className="loading-screen"><p>Opening your ThumbGate lessons…</p></main>;

  return <main className="lessons-shell">
    <header className="lessons-header">
      <div><p className="eyebrow">THUMBGATE</p><h1>Your Hermes lessons</h1><p>Real feedback from your workspace—useful answers to repeat, weak answers to improve.</p></div>
      <a className="button button-secondary button-small" href="/dashboard">← Back to Hermes</a>
    </header>
    <section className="lesson-metrics" aria-label="Feedback totals">
      <button className={signal === "all" ? "is-active" : ""} onClick={() => setSignal("all")}><span>All lessons</span><strong>{counts.total}</strong></button>
      <button className={signal === "up" ? "is-active" : ""} onClick={() => setSignal("up")}><span>👍 Helpful</span><strong>{counts.up}</strong></button>
      <button className={signal === "down" ? "is-active" : ""} onClick={() => setSignal("down")}><span>👎 Improve</span><strong>{counts.down}</strong></button>
    </section>
    <form className="lesson-search" onSubmit={submitSearch} role="search">
      <label htmlFor="lesson-query">Search prompts, responses, and notes</label>
      <div><input id="lesson-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="Search your lessons…" /><button className="button button-primary button-small">Search</button></div>
    </form>
    <section className="lesson-list" aria-live="polite">
      {loading ? <div className="lesson-empty">Loading lessons…</div> : lessons.length === 0 ? <div className="lesson-empty"><h2>No matching lessons yet</h2><p>Rate a completed Hermes response with 👍 or 👎 and it will appear here.</p><a className="button button-primary button-small" href="/dashboard">Open Hermes</a></div> : lessons.map((lesson) => <article className="lesson-card" key={lesson.id}>
        <div className="lesson-card-top"><span className={`lesson-signal signal-${lesson.signal}`}>{lesson.signal === "up" ? "👍 Helpful" : "👎 Improve"}</span><time dateTime={new Date(lesson.updatedAt).toISOString()}>{formatDateTime(lesson.updatedAt)}</time></div>
        <p className="eyebrow">{lesson.threadTitle} · {lesson.route}</p>
        <h2>{lesson.prompt}</h2>
        <pre>{lesson.result}</pre>
        {lesson.note && <div className="lesson-note"><strong>Improvement note</strong><p>{lesson.note}</p></div>}
      </article>)}
    </section>
    <footer className="lessons-footer">Signed in as {user.email}. Feedback is private to this ThumbGate workspace.</footer>
  </main>;
}
