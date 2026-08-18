"use client";

import { useEffect, useState } from "react";
import { SignOutForm } from "./SignOutForm";
import styles from "./landing.module.css";

type AuthSession = {
  mode: "loading" | "anon" | "session";
  plan?: string;
  cloudAccess?: boolean;
};

let landingAuthRequest: Promise<AuthSession> | null = null;

function bustLandingAuthCache() {
  landingAuthRequest = null;
}

function getLandingAuth(force = false): Promise<AuthSession> {
  if (force) bustLandingAuthCache();
  if (!landingAuthRequest) {
    landingAuthRequest = fetch("/api/me", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return { mode: "anon" as const };
        const body = (await response.json()) as {
          authenticated?: boolean;
          organization?: { plan?: string; cloudAccess?: boolean };
        };
        if (!body.authenticated) return { mode: "anon" as const };
        return {
          mode: "session" as const,
          plan: body.organization?.plan ?? "free",
          cloudAccess: body.organization?.cloudAccess ?? false,
        };
      })
      .catch(() => ({ mode: "anon" as const }));
  }
  return landingAuthRequest;
}

function useLandingAuth(): AuthSession {
  const [session, setSession] = useState<AuthSession>({ mode: "loading" });
  useEffect(() => {
    let cancelled = false;
    const force = typeof window !== "undefined"
      && new URLSearchParams(window.location.search).has("signed_out");
    getLandingAuth(force).then((nextSession) => {
      if (!cancelled) setSession(nextSession);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return session;
}

/** Nav session chrome — after paint via /api/me (keeps public HTML static). */
export function LandingAuthNav() {
  const session = useLandingAuth();
  const isSession = session.mode === "session";
  return (
    <div className="nav-actions" data-landing-auth={session.mode}>
      <a href="#setup" className="nav-link">Setup</a>
      <a href="#closed-system" className="nav-link">Security</a>
      <a href="#how-it-works" className="nav-link">How it works</a>
      <a href="#pricing" className="nav-link">Pricing</a>
      {isSession ? (
        <div className={styles.sessionNav} aria-label="Authenticated session actions">
          <SignOutForm buttonClassName={`button button-small ${styles.signOutButton}`} data-testid="landing-sign-out" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hosted-Hermes hero CTAs. Product is hosted Hermes on a fenced VPS — not Mac pairing.
 * Do not market a phone leash or Hermes Mobile on this page.
 */
export function LandingAuthHero() {
  const session = useLandingAuth();
  const isSession = session.mode === "session";
  const isPaid = isSession && (session.plan === "pro" || session.plan === "team" || session.cloudAccess);

  return (
    <div className="hero-actions" data-landing-hero-auth={session.mode}>
      {isPaid ? (
        <>
          <a
            href="/dashboard"
            className="button button-primary"
            data-funnel-event="dashboard_open_click"
          >
            Open hosted Hermes <span aria-hidden="true">→</span>
          </a>
          <a href="/api/billing/portal" className="button button-secondary" data-funnel-event="manage_billing_click">
            You&apos;re on Pro · Manage billing
          </a>
        </>
      ) : isSession ? (
        <>
          {/* Checkout is POST-only — never <a href> (GET → 405). */}
          <form action="/api/billing/checkout" method="POST" className="hero-cta-form">
            <button
              type="submit"
              className="button button-primary"
              data-funnel-event="upgrade_pro_click"
            >
              Start hosted Hermes trial <span aria-hidden="true">→</span>
            </button>
          </form>
          <a
            href="/dashboard"
            className="button button-secondary"
            data-funnel-event="dashboard_open_click"
          >
            Open hosted Hermes
          </a>
        </>
      ) : (
        <>
          <a
            href="/api/auth/login"
            className="button button-primary"
            data-funnel-event="cloud_continuity_click"
          >
            Start hosted Hermes — $10/mo <span aria-hidden="true">→</span>
          </a>
          <a
            href="/api/auth/login"
            className="button button-secondary"
            data-funnel-event="sign_in_click"
          >
            Sign in
          </a>
        </>
      )}
    </div>
  );
}

/**
 * Private-workspace panel: hosted Hermes first (keeps public HTML free of telemetry).
 */
export function LandingAuthPanel() {
  const mode = useLandingAuth();
  const isSession = mode === "session";
  return (
    <>
      <div className="console-header">
        <span className="console-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-mark" src="/brand/thumbgate-mark-inline-v3.svg" alt="" width={22} height={22} decoding="async" /> Your workspace is private
        </span>
        <span className="action-label">
          {mode === "loading" ? "Checking session…" : isSession ? "Session active" : "Sign-in required"}
        </span>
      </div>
      <div className="landing-action-list">
        <a className="landing-action" href="#pricing">
          <span className="action-icon" aria-hidden="true">☁</span>
          <span>
            <strong>Hosted Hermes</strong>
            <small>Fenced cloud runner with 90s leases. 14 days free, cancel anytime. No Mac pair step.</small>
          </span>
          <b aria-hidden="true">→</b>
        </a>
        <a className="landing-action" href="#closed-system">
          <span className="action-icon" aria-hidden="true">🛡</span>
          <span>
            <strong>Closed-system</strong>
            <small>Approvals stay in thumbgate.app. Fenced VPS. No phone leash.</small>
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
      Sign in →
    </a>
  );
}

export function LandingPricingCtaPaid() {
  const href = useSessionHref();
  return (
    <a href={href} className="button button-primary" data-funnel-event="cloud_continuity_click">
      Start hosted Hermes — $10/mo →
    </a>
  );
}

