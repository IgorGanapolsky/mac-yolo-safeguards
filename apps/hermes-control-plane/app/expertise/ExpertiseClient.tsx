"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ExpertiseData } from "@/lib/expertise-data";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ExpertiseData };

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatMs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 10);
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <article className="price-card">
      <h3>{label}</h3>
      <p className="price">{value}</p>
      {sub ? <p className="signin-note">{sub}</p> : null}
    </article>
  );
}

export default function ExpertiseClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/expertise/stats", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ExpertiseData>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand">
          <span>ThumbGate</span>
        </Link>
        <Link href="/">← Back to home</Link>
      </nav>

      <section className="hero" tabIndex={-1}>
        <div className="hero-copy">
          <p className="eyebrow">Engineering expertise · original data</p>
          <h1 className="hero-title">Running Hermes Agents in production</h1>
          <p className="hero-lede">
            ThumbGate is built and operated by the engineer who maintains the
            Hermes remote-control stack. Every number below is computed live
            from our production control plane — not a static marketing figure.
          </p>
          <div className="trust-row">
            <span>Named author</span>
            <span>Original D1 data</span>
            <span>Canaries excluded</span>
          </div>
        </div>
      </section>

      {state.status === "loading" ? (
        <section className="section-block" aria-live="polite">
          <div className="section-heading">
            <p className="eyebrow">Live telemetry</p>
            <h2>Loading production metrics…</h2>
          </div>
        </section>
      ) : null}

      {state.status === "error" ? (
        <section className="section-block" aria-live="polite">
          <div className="section-heading">
            <p className="eyebrow">Live telemetry</p>
            <h2>Metrics unavailable right now</h2>
            <p className="hero-lede">
              The stats endpoint could not be reached ({state.message}). The
              engineering case studies below remain fully cited.
            </p>
          </div>
        </section>
      ) : null}

      {state.status === "ready" ? (
        <>
          <section className="pricing-section" aria-labelledby="live-metrics">
            <div className="pricing-copy">
              <p className="eyebrow">Last 30 days · live</p>
              <h2 id="live-metrics" className="hero-title">
                Production reliability, computed from D1
              </h2>
            </div>
            <div className="price-grid">
              <Stat
                label="Cloud continuity success"
                value={formatPercent(state.data.continuity.successRate30d)}
                sub={`${formatNumber(state.data.continuity.completedRuns30d)} completed / ${formatNumber(state.data.continuity.failedRuns30d)} failed`}
              />
              <Stat
                label="Median continuity run"
                value={formatMs(state.data.continuity.medianDurationMs)}
                sub={`p95 ${formatMs(state.data.continuity.p95DurationMs)}`}
              />
              <Stat
                label="Pairings completed"
                value={formatNumber(state.data.pairing.pairingsCompleted30d)}
                sub={`median ${state.data.pairing.medianPairTimeSec === null ? "—" : `${state.data.pairing.medianPairTimeSec}s`} · USB ${state.data.pairing.transportMix.usb} / Tailscale ${state.data.pairing.transportMix.tailscale} / LAN ${state.data.pairing.transportMix.lan}`}
              />
              <Stat
                label="Control-plane uptime"
                value={formatPercent(state.data.availability.controlPlaneUptime30d)}
                sub={`runner ${formatPercent(state.data.availability.runnerUptime30d)} · ${formatNumber(state.data.availability.orgsWithOnlineMachine)} orgs online now`}
              />
              <Stat
                label="Scale"
                value={formatNumber(state.data.scale.totalPairedMachines)}
                sub={`${formatNumber(state.data.scale.activeSessions24h)} active sessions · ${formatNumber(state.data.scale.totalTasks30d)} tasks in 30d`}
              />
              <Stat
                label="Generated"
                value={formatDate(state.data.generatedAt)}
                sub="Data refreshes from production every 5 minutes"
              />
            </div>
          </section>
        </>
      ) : null}

      <section className="section-block" aria-labelledby="case-studies-heading">
        <div className="section-heading">
          <p className="eyebrow">Case studies · named authors</p>
          <h2 id="case-studies-heading">What we actually run</h2>
        </div>
        <div className="steps-grid">
          {state.status === "ready" && state.data.caseStudies.length > 0 ? (
            state.data.caseStudies.map((cs) => (
              <article key={cs.id} className="price-card">
                <h3>{cs.title}</h3>
                <p className="signin-note">
                  {cs.orgType} · published {formatDate(cs.publishedAt)}
                </p>
                <p>
                  <strong>Challenge:</strong> {cs.challenge}
                </p>
                <p>
                  <strong>Solution:</strong> {cs.solution}
                </p>
                <p>
                  <strong>Outcome:</strong> {cs.outcome}
                </p>
                <p className="trust-row">
                  <span>{cs.metric}</span>
                </p>
                <p className="signin-note">
                  Author: <strong>{cs.author.name}</strong> — {cs.author.role}
                  {cs.author.linkedin ? (
                    <>
                      {" "}
                      ·{" "}
                      <a href={cs.author.linkedin} rel="nofollow noopener">
                        LinkedIn
                      </a>
                    </>
                  ) : null}
                </p>
              </article>
            ))
          ) : (
            <p className="hero-lede">
              Case studies load from the same endpoint. If metrics are
              unavailable, the live cards above still explain what this page
              tracks.
            </p>
          )}
        </div>
      </section>

      <section className="section-block" aria-labelledby="methodology-heading">
        <div className="section-heading">
          <p className="eyebrow">Methodology · editorial checkpoint</p>
          <h2 id="methodology-heading">How this data is produced</h2>
        </div>
        <div className="steps-grid">
          <article className="price-card">
            <h3>Data source</h3>
            <p className="signin-note">
              {state.status === "ready"
                ? state.data.methodology.dataSource
                : "Production control-plane telemetry, queried live."}
            </p>
          </article>
          <article className="price-card">
            <h3>Privacy boundary</h3>
            <p className="signin-note">
              {state.status === "ready"
                ? state.data.methodology.privacyBoundary
                : "No customer names, machine identifiers, or conversation contents."}
            </p>
          </article>
          <article className="price-card">
            <h3>Canary exclusion</h3>
            <p className="signin-note">
              {state.status === "ready"
                ? state.data.methodology.canaryExclusion
                  ? "Synthetic canary runs are excluded from every continuity stat."
                  : "Canary exclusion is not enabled."
                : "Synthetic canary runs are excluded from every continuity stat."}
            </p>
          </article>
          <article className="price-card">
            <h3>Last audited</h3>
            <p className="signin-note">
              {state.status === "ready"
                ? formatDate(state.data.methodology.lastAudited)
                : "Rolling — refreshed on deploy."}
            </p>
          </article>
        </div>
        <p className="hero-lede">
          Raw JSON:{" "}
          <a href="/api/expertise/stats">/api/expertise/stats</a> (public,
          cache-control 5 minutes).
        </p>
      </section>
    </main>
  );
}