"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type User = { email: string; name: string };
type Counts = { total: number; up: number; down: number };
type Activity = {
  threads: number;
  tasks: number;
  completedResponses: number;
  unratedCompleted: number;
};
type Lesson = {
  id: string;
  taskId: string;
  threadId?: string;
  signal: "up" | "down";
  note: string | null;
  updatedAt: number;
  prompt: string;
  result: string;
  route: string;
  completedAt: number | null;
  threadTitle: string;
};

function hermesTaskHref(lesson: Lesson) {
  const params = new URLSearchParams();
  params.set("task", lesson.taskId);
  if (lesson.threadId) params.set("thread", lesson.threadId);
  return `/dashboard?${params.toString()}#task-activity`;
}

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
  const [activity, setActivity] = useState<Activity>({
    threads: 0,
    tasks: 0,
    completedResponses: 0,
    unratedCompleted: 0,
  });
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
      const body = await response.json() as { lessons: Lesson[]; counts: Counts; activity?: Activity };
      setLessons(body.lessons);
      setCounts(body.counts);
      if (body.activity) setActivity(body.activity);
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

  const emptyBecauseNoRatings = !loading && lessons.length === 0 && !appliedQuery && signal === "all" && counts.total === 0;
  const emptyBecauseFilter = !loading && lessons.length === 0 && !emptyBecauseNoRatings;

  return <main className="lessons-shell">
    <header className="lessons-header">
      <div>
        <p className="eyebrow">THUMBGATE</p>
        <h1>Your Hermes lessons</h1>
        <p>
          Lessons are <strong>thumbs you leave on completed answers</strong> — not every chat or prompt.
          👍 = keep doing this. 👎 = fix this next time.
        </p>
      </div>
      <a className="button button-secondary button-small" href="/dashboard">← Back to Hermes</a>
    </header>

    <section className="lesson-activity" aria-label="Workspace activity (not lessons)">
      <p className="eyebrow">WORKSPACE ACTIVITY</p>
      <ul>
        <li><a href="/dashboard" aria-label={`View ${activity.threads} synced chats in Hermes`}><strong>{activity.threads}</strong><span>chats synced</span></a></li>
        <li><a href="/dashboard#task-activity" aria-label={`View ${activity.completedResponses} completed web answers`}><strong>{activity.completedResponses}</strong><span>completed web answers</span></a></li>
        <li><a href="/dashboard#task-activity" aria-label={`View ${activity.unratedCompleted} completed answers waiting for a thumbs rating`}><strong>{activity.unratedCompleted}</strong><span>still unrated</span></a></li>
      </ul>
      <p className="helper-copy">
        Chats and prompts live under Hermes. This page only lists answers you explicitly rate.
      </p>
    </section>

    <section className="lesson-metrics" aria-label="Rated lesson totals">
      <button type="button" className={signal === "all" ? "is-active" : ""} onClick={() => setSignal("all")}>
        <span>All ratings</span><strong>{counts.total}</strong>
      </button>
      <button type="button" className={signal === "up" ? "is-active" : ""} onClick={() => setSignal("up")}>
        <span>👍 Helpful</span><strong>{counts.up}</strong>
      </button>
      <button type="button" className={signal === "down" ? "is-active" : ""} onClick={() => setSignal("down")}>
        <span>👎 Improve</span><strong>{counts.down}</strong>
      </button>
    </section>
    <form className="lesson-search" onSubmit={submitSearch} role="search">
      <label htmlFor="lesson-query">Search rated prompts, responses, and notes</label>
      <div>
        <input
          id="lesson-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={120}
          placeholder="Search your rated lessons…"
        />
        <button type="submit" className="button button-primary button-small">Search</button>
      </div>
    </form>
    <section className="lesson-list" aria-live="polite">
      {loading ? (
        <div className="lesson-empty">Loading lessons…</div>
      ) : emptyBecauseNoRatings ? (
        <div className="lesson-empty">
          <h2>0 ratings yet — that&apos;s expected</h2>
          <p>
            Your workspace already has <strong>{activity.threads}</strong> chat{activity.threads === 1 ? "" : "s"}
            {activity.completedResponses > 0
              ? <> and <strong>{activity.completedResponses}</strong> completed web answer{activity.completedResponses === 1 ? "" : "s"}</>
              : null}
            . None of those become a “lesson” until you tap 👍 or 👎 on a finished reply in Hermes.
          </p>
          {activity.unratedCompleted > 0 ? (
            <p>
              <strong>{activity.unratedCompleted}</strong> completed answer{activity.unratedCompleted === 1 ? "" : "s"} ready to rate.
            </p>
          ) : (
            <p>Run a task until it completes with a result, then rate it from the Hermes tab.</p>
          )}
          <a className="button button-primary button-small" href="/dashboard#task-activity">Rate a completed answer →</a>
        </div>
      ) : emptyBecauseFilter ? (
        <div className="lesson-empty">
          <h2>No matching lessons</h2>
          <p>Nothing matched this filter or search. Clear search or switch to All ratings.</p>
          <button type="button" className="button button-secondary button-small" onClick={() => { setSignal("all"); setQuery(""); setAppliedQuery(""); }}>
            Show all ratings
          </button>
        </div>
      ) : (
        lessons.map((lesson) => (
          <article className="lesson-card" key={lesson.id}>
            <div className="lesson-card-top">
              <span className={`lesson-signal signal-${lesson.signal}`}>
                {lesson.signal === "up" ? "👍 Helpful" : "👎 Improve"}
              </span>
              <time dateTime={new Date(lesson.updatedAt).toISOString()}>{formatDateTime(lesson.updatedAt)}</time>
            </div>
            <p className="eyebrow">{lesson.threadTitle} · {lesson.route}</p>
            <h2>
              <a className="lesson-card-title-link" href={hermesTaskHref(lesson)}>
                {lesson.prompt}
              </a>
            </h2>
            <pre>{lesson.result}</pre>
            {lesson.note && (
              <div className="lesson-note">
                <strong>Improvement note</strong>
                <p>{lesson.note}</p>
              </div>
            )}
            <div className="lesson-card-actions">
              <a className="button button-secondary button-small" href={hermesTaskHref(lesson)}>
                Open in Hermes →
              </a>
            </div>
          </article>
        ))
      )}
    </section>
    <footer className="lessons-footer">
      Signed in as {user.email}. Ratings are private to this ThumbGate workspace.
    </footer>
  </main>;
}
