"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./landing.module.css";

type AuthMode = "loading" | "anon" | "session";

function useLandingAuth(): AuthMode {
  const [mode, setMode] = useState<AuthMode>("loading");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
        if (cancelled) return;
        if (!response.ok) {
          setMode("anon");
          return;
        }
        const body = (await response.json()) as { authenticated?: boolean };
        setMode(body.authenticated ? "session" : "anon");
      } catch {
        if (!cancelled) setMode("anon");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return mode;
}

/** Nav session chrome — after paint via /api/me (keeps public HTML static). */
export function LandingAuthNav() {
  const mode = useLandingAuth();
  const isSession = mode === "session";
  return (
    <div className="nav-actions" data-landing-auth={mode}>
      <a href="#pair" className="nav-link">Pair</a>
      <a href="#how-it-works" className="nav-link">How it works</a>
      <a href="#pricing" className="nav-link">Pricing</a>
      {isSession ? (
        <div className={styles.sessionNav} aria-label="Authenticated session actions">
          <Link
            href="/dashboard"
            className={`button button-small button-secondary ${styles.dashboardButton}`}
            data-funnel-event="dashboard_open_click"
          >
            Open dashboard
          </Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className={`button button-small ${styles.signOutButton}`}>
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <a
          href="/api/auth/login"
          className="button button-small button-secondary"
          data-funnel-event="sign_in_click"
          aria-busy={mode === "loading" || undefined}
        >
          Sign in
        </a>
      )}
    </div>
  );
}

/** Single primary hero CTA (not triplicated in the side panel). */
export function LandingAuthHero() {
  const mode = useLandingAuth();
  const isSession = mode === "session";
  return (
    <div className="hero-actions" data-landing-hero-auth={mode}>
      <a
        href={isSession ? "/dashboard" : "/api/auth/login"}
        className="button button-primary"
        data-funnel-event={isSession ? "dashboard_open_click" : "sign_in_click"}
      >
        {isSession ? "Open Hermes on the web" : "Sign in to Hermes Web"}{" "}
        <span aria-hidden="true">→</span>
      </a>
      <a href="#how-it-works" className="button button-ghost">See the failover path</a>
    </div>
  );
}

/**
 * Private-workspace panel: no second Sign-in when anon.
 * Points to pair + explains primary CTA.
 */
export function LandingAuthPanel() {
  const mode = useLandingAuth();
  const isSession = mode === "session";
  return (
    <>
      <div className="console-header">
        <span className="console-title">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span> Your workspace is private
        </span>
        <span className="action-label">
          {mode === "loading" ? "Checking session…" : isSession ? "Session active" : "Sign-in required"}
        </span>
      </div>
      <div className="landing-action-list">
        {isSession ? (
          <Link className="landing-action" href="/dashboard" data-funnel-event="dashboard_open_click">
            <span className="action-icon" aria-hidden="true">⌘</span>
            <span>
              <strong>Open private dashboard</strong>
              <small>Your authenticated session is active. Workspace data still loads only inside the private dashboard.</small>
            </span>
            <b aria-hidden="true">→</b>
          </Link>
        ) : (
          <a className="landing-action" href="#pair" data-funnel-event="pair_panel_click">
            <span className="action-icon" aria-hidden="true">⌘</span>
            <span>
              <strong>After you sign in</strong>
              <small>Use the purple Sign in button above, then pair your Mac. One auth path — not a second login control.</small>
            </span>
            <b aria-hidden="true">→</b>
          </a>
        )}
        <a className="landing-action" href="#pair">
          <span className="action-icon" aria-hidden="true">+</span>
          <span>
            <strong>Pair your Mac</strong>
            <small>Read the public setup steps, then sign in to approve the short code.</small>
          </span>
          <b aria-hidden="true">→</b>
        </a>
        <a className="landing-action" href="#pricing">
          <span className="action-icon" aria-hidden="true">☁</span>
          <span>
            <strong>Review plans</strong>
            <small>Compare public plan details without exposing workspace activity.</small>
          </span>
          <b aria-hidden="true">→</b>
        </a>
      </div>
      <p className="honesty-note">No workspace telemetry is fetched or rendered on this public page.</p>
      {isSession ? (
        <p className={styles.sessionNotice}>This browser has an active session. Sign out before leaving a shared device.</p>
      ) : null}
    </>
  );
}

function useSessionHref(): string {
  const mode = useLandingAuth();
  return mode === "session" ? "/dashboard" : "/api/auth/login";
}

export function LandingPricingCtaFree() {
  const href = useSessionHref();
  return (
    <a href={href} className="button button-secondary" data-funnel-event="free_control_click">
      Use web control free →
    </a>
  );
}

export function LandingPricingCtaPaid() {
  const href = useSessionHref();
  return (
    <a href={href} className="button button-primary" data-funnel-event="cloud_continuity_click">
      Try cloud continuity →
    </a>
  );
}
