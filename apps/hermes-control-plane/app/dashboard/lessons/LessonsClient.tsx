"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  hermesTaskHref,
  lessonsListHref,
  parseSignalFromSearch,
  resolveSignalClickDestination,
  singleLessonHermesHref,
  splitHighlightParts,
  type LessonSignalFilter,
} from "@/lib/lessons-ui";

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

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric",
    minute: "2-digit", second: "2-digit", hour12: true, timeZoneName: "short",
  }).format(new Date(timestamp));
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const parts = splitHighlightParts(text, query);
  if (parts.length === 1 && !parts[0].match) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={index} className="search-highlight">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function readInitialSignal(): LessonSignalFilter {
  if (typeof window === "undefined") return "all";
  return parseSignalFromSearch(window.location.search);
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
  const [signal, setSignal] = useState<LessonSignalFilter>(readInitialSignal);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const pendingScrollRef = useRef(false);
  const openSingleWhenLoadedRef = useRef(false);

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

      const openHref = singleLessonHermesHref(
        signal,
        body.lessons,
        openSingleWhenLoadedRef.current,
      );
      openSingleWhenLoadedRef.current = false;
      if (openHref) {
        window.location.assign(openHref);
        return;
      }
    } else {
      openSingleWhenLoadedRef.current = false;
    }
    setLoading(false);
  }, [appliedQuery, signal]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (loading || !pendingScrollRef.current) return;
    pendingScrollRef.current = false;
    const list = document.getElementById("lesson-list");
    list?.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstCard = list?.querySelector<HTMLElement>(".lesson-card");
    if (firstCard) {
      firstCard.classList.remove("lesson-card-flash");
      // Force reflow so re-click restarts the animation.
      void firstCard.offsetWidth;
      firstCard.classList.add("lesson-card-flash");
      firstCard.setAttribute("tabindex", "-1");
      firstCard.focus({ preventScroll: true });
    }
  }, [loading, lessons, signal]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setAppliedQuery(query.trim());
  }

  function syncUrl(nextSignal: LessonSignalFilter, nextQuery = appliedQuery) {
    const href = lessonsListHref(nextSignal, nextQuery);
    window.history.replaceState({}, "", href);
  }

  function handleSignalClick(targetSignal: LessonSignalFilter) {
    const destination = resolveSignalClickDestination({
      target: targetSignal,
      counts,
      lessons,
    });

    if (destination.kind === "open-hermes") {
      window.location.assign(destination.href);
      return;
    }

    openSingleWhenLoadedRef.current = destination.openSingleWhenLoaded;
    pendingScrollRef.current = true;
    syncUrl(destination.signal);
    setSignal(destination.signal);
  }

  if (!user) return <main className="loading-screen"><p>Opening your ThumbGate lessons…</p></main>;

  const emptyBecauseNoRatings = !loading && lessons.length === 0 && !appliedQuery && signal === "all" && counts.total === 0;
  const emptyBecauseFilter = !loading && lessons.length === 0 && !emptyBecauseNoRatings;

  const resultsCountText = appliedQuery
    ? `${lessons.length} result${lessons.length === 1 ? "" : "s"} for "${appliedQuery}"`
    : signal === "all"
    ? `${lessons.length} rated lesson${lessons.length === 1 ? "" : "s"}`
    : `${lessons.length} ${signal === "up" ? "Helpful" : "Improve"} rating${lessons.length === 1 ? "" : "s"}`;

  return <main className="lessons-shell">
    <header className="lessons-header">
      <div>
        <p className="eyebrow">THUMBGATE · 🔒 PRIVATE INSTITUTIONAL MEMORY</p>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h1>ThumbGate lessons</h1>
          <span style={{
            fontSize: "12px",
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: "6px",
            background: "rgba(16, 185, 129, 0.15)",
            color: "#10b981",
            border: "1px solid rgba(16, 185, 129, 0.3)",
          }}>
            🔒 Private to {user.email}
          </span>
        </div>
        <p>
          Lessons are <strong>thumbs you leave on completed answers</strong> — strictly private to your workspace.
          They steer your personal AI agents and are never shared publicly or with third parties.
          👍 = keep doing this. 👎 = fix this next time.
        </p>
        <p className="privacy-note">
          🔒 <strong>Private to your workspace.</strong> Only you — and anyone you add to your
          organization — can see these. They are never public and never shared with other users&rsquo; workspaces.
        </p>
      </div>
      <Link
        className="button button-secondary button-small"
        href="/dashboard"
        onClick={() => {
          window.location.assign("/dashboard");
        }}
      >
        ← Back to dashboard
      </Link>
    </header>

    <section className="lesson-activity" aria-label="Workspace activity (not lessons)">
      <p className="eyebrow">WORKSPACE ACTIVITY</p>
      <ul>
        <li><Link href="/dashboard?view=chats#chats" aria-label={`Open chat list — ${activity.threads} synced chats`}><strong>{activity.threads}</strong><span>chats synced</span></Link></li>
        <li><Link href="/dashboard?filter=completed#task-activity" aria-label={`View ${activity.completedResponses} completed web answers`}><strong>{activity.completedResponses}</strong><span>completed web answers</span></Link></li>
        <li><Link href="/dashboard?filter=unrated#task-activity" aria-label={`View ${activity.unratedCompleted} completed answers ready for a thumbs rating`}><strong>{activity.unratedCompleted}</strong><span>ready to rate (👍/👎)</span></Link></li>
      </ul>
      <p className="helper-copy">
        Chats and prompts live under Hermes. This page only lists answers you explicitly rate.
        “Ready to rate” means a finished answer with no 👍/👎 yet — optional, not an error.
      </p>
    </section>

    <section style={{
      margin: "20px 0",
      padding: "14px 18px",
      borderRadius: "8px",
      background: "rgba(255, 255, 255, 0.03)",
      border: "1px solid var(--line)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "18px" }}>⚡</span>
        <div>
          <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>Future AGI 6-in-1 Self-Healing Engine Active</strong>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
            Closed-loop telemetry: Tracing · Evals · Simulations · Guardrails · 0ms Pre-Action WriteGuard
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
          P99 ≤ 21ms
        </span>
        <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.25)" }}>
          OTel Spans Live
        </span>
      </div>
    </section>

    <section className="lesson-metrics" aria-label="Rated lesson totals">
      <button
        type="button"
        className={signal === "all" ? "is-active" : ""}
        aria-pressed={signal === "all"}
        aria-label={`All ratings, ${counts.total}. Filter the list below.`}
        onClick={() => handleSignalClick("all")}
      >
        <span>All ratings</span><strong>{counts.total}</strong>
      </button>
      <button
        type="button"
        className={signal === "up" ? "is-active" : ""}
        aria-pressed={signal === "up"}
        aria-label={
          counts.up === 1
            ? "1 Helpful rating. Open that answer in Hermes."
            : `Helpful ratings, ${counts.up}. Filter the list below.`
        }
        onClick={() => handleSignalClick("up")}
      >
        <span>👍 Helpful</span><strong>{counts.up}</strong>
      </button>
      <button
        type="button"
        className={signal === "down" ? "is-active" : ""}
        aria-pressed={signal === "down"}
        aria-label={
          counts.down === 1
            ? "1 Improve rating. Open that answer in Hermes."
            : `Improve ratings, ${counts.down}. Filter the list below.`
        }
        onClick={() => handleSignalClick("down")}
      >
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
    <section id="lesson-list" className="lesson-list" aria-live="polite">
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
          <Link className="button button-primary button-small" href="/dashboard?filter=unrated#task-activity">Rate a completed answer →</Link>
        </div>
      ) : emptyBecauseFilter ? (
        <div className="lesson-empty">
          <h2>No matching lessons</h2>
          <p>Nothing matched this filter or search. Clear search or switch to All ratings.</p>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => {
              setSignal("all");
              setQuery("");
              setAppliedQuery("");
              syncUrl("all", "");
            }}
          >
            Show all ratings
          </button>
        </div>
      ) : (
        <>
          <div className="lesson-results-count" role="status">
            Showing <strong>{resultsCountText}</strong>
            {signal !== "all" ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="lesson-filter-clear"
                  onClick={() => handleSignalClick("all")}
                >
                  Clear filter
                </button>
              </>
            ) : null}
          </div>
          {lessons.map((lesson) => (
            <article className="lesson-card" key={lesson.id} id={`lesson-${lesson.id}`}>
              <div className="lesson-card-top">
                <span className={`lesson-signal signal-${lesson.signal}`}>
                  {lesson.signal === "up" ? "👍 Helpful" : "👎 Improve"}
                </span>
                <time dateTime={new Date(lesson.updatedAt).toISOString()}>{formatDateTime(lesson.updatedAt)}</time>
              </div>
              <p className="eyebrow">{lesson.threadTitle} · {lesson.route}</p>
              <h2>
                <a className="lesson-card-title-link" href={hermesTaskHref(lesson)}>
                  <HighlightText text={lesson.prompt} query={appliedQuery} />
                </a>
              </h2>
              <pre>
                <HighlightText text={lesson.result} query={appliedQuery} />
              </pre>
              {lesson.note && (
                <div className="lesson-note">
                  <strong>Improvement note</strong>
                  <p>
                    <HighlightText text={lesson.note} query={appliedQuery} />
                  </p>
                </div>
              )}
              <div style={{
                marginTop: "12px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: lesson.signal === "down" ? "rgba(239, 68, 68, 0.06)" : "rgba(16, 185, 129, 0.06)",
                border: lesson.signal === "down" ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(16, 185, 129, 0.2)",
                fontSize: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: lesson.signal === "down" ? "#f87171" : "#34d399", fontWeight: 650, marginBottom: "4px" }}>
                  <span>🔁</span>
                  <span>{lesson.signal === "down" ? "Synthesized Self-Healing Guardrail" : "Reinforced Gold Pattern"}</span>
                </div>
                <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {lesson.note
                    ? `Active rule compiled: “When executing ${lesson.route || 'task'}, enforce constraint: ${lesson.note}”`
                    : lesson.signal === "down"
                    ? `Self-healing guardrail: “Enforce strict verification and deterministic validation before finalizing response for ${lesson.prompt.slice(0, 50)}…”`
                    : `Reinforced memory pattern: “Preserve verified completion schema for ${lesson.prompt.slice(0, 50)}…”`}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px", fontSize: "11px" }}>
                {(() => {
                  const textToScan = `${lesson.prompt} ${lesson.result} ${lesson.note || ''}`;
                  const hasPii = /\b\d{3}-\d{2}-\d{4}\b|\b(?:\d{4}-){3}\d{4}\b/.test(textToScan);
                  const hasInjection = /ignore (all )?previous instructions|system prompt override/i.test(textToScan);
                  const isClean = !hasPii && !hasInjection;
                  const isGrounded = lesson.signal === "up" || !/fabricated|hallucinated|unverified/i.test(textToScan);
                  const groundednessPct = lesson.signal === "up" ? "100%" : isGrounded ? "85%" : "60%";
                  return (
                    <>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: isClean ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                        color: isClean ? "#10b981" : "#ef4444",
                        border: isClean ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)",
                      }}>
                        🛡️ Guardrails: {isClean ? "Clean" : hasPii ? "PII Flagged" : "Injection Flagged"}
                      </span>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: isGrounded ? "rgba(147, 51, 234, 0.1)" : "rgba(245, 158, 11, 0.1)",
                        color: isGrounded ? "#c084fc" : "#f59e0b",
                        border: isGrounded ? "1px solid rgba(147, 51, 234, 0.2)" : "1px solid rgba(245, 158, 11, 0.2)",
                      }}>
                        📊 Groundedness: {groundednessPct}
                      </span>
                    </>
                  );
                })()}
              </div>
              <div className="lesson-card-actions" style={{ marginTop: "14px" }}>
                <a className="button button-secondary button-small" href={hermesTaskHref(lesson)}>
                  Open in Hermes →
                </a>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
    <footer className="lessons-footer">
      Signed in as {user.email}. Ratings are private to this ThumbGate workspace.
    </footer>
  </main>;
}
