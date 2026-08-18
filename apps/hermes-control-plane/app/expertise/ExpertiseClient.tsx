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
          <p className="eyebrow">Operator telemetry · not a customer story</p>
          <h1 className="hero-title">Internal hosted telemetry</h1>
          <p className="hero-lede">
            Numbers below are operator control-plane counters. They are not
            stranger case studies and they do not imply paying customers.
            We measure recovered runs after you start.
          </p>
          <div className="trust-row">
            <span>No invented customers</span>
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
              The stats endpoint could not be reached ({state.message}). No
              case studies are invented to fill the gap.
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
                label="Hosted VPS success"
                value={formatPercent(state.data.continuity.successRate30d)}
                sub={`${formatNumber(state.data.continuity.completedRuns30d)} completed / ${formatNumber(state.data.continuity.failedRuns30d)} failed`}
              />
              <Stat
                label="Median hosted run"
                value={formatMs(state.data.continuity.medianDurationMs)}
                sub={`p95 ${formatMs(state.data.continuity.p95DurationMs)}`}
              />
              <Stat
                label="Hosted sessions (24h)"
                value={formatNumber(state.data.scale.activeSessions24h)}
                sub={`${formatNumber(state.data.scale.totalTasks30d)} tasks in 30d`}
              />
              <Stat
                label="Control-plane uptime"
                value={formatPercent(state.data.availability.controlPlaneUptime30d)}
                sub={`runner ${formatPercent(state.data.availability.runnerUptime30d)} · ${formatNumber(state.data.availability.orgsWithOnlineMachine)} orgs online now`}
              />
              <Stat
                label="Hosted workspaces"
                value={formatNumber(state.data.scale.totalPairedMachines)}
                sub={`${formatNumber(state.data.availability.orgsWithOnlineMachine)} orgs with a live runner`}
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
          <p className="eyebrow">No stranger case studies</p>
          <h2 id="case-studies-heading">We do not invent customer stories</h2>
          <p className="hero-lede">
            ThumbGate has no stranger testimonials on this page.
            Operator telemetry is not a case study. If a paying customer
            later publishes a real write-up, it will be marked as such.
          </p>
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
                  ? "Synthetic canary runs are excluded from every hosted-run stat."
                  : "Canary exclusion is not enabled."
                : "Synthetic canary runs are excluded from every hosted-run stat."}
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