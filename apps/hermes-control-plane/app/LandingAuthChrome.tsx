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
      <a href="#pair" className="nav-link">Pair</a>
      <a href="#mobile" className="nav-link">Apps</a>
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

/** Dual-track hero CTA: free sign-in stays primary, but a real paid-intent path sits next to it — not buried in the pricing section. */
export function LandingAuthHero() {
  const session = useLandingAuth();
  const isSession = session.mode === "session";
  const isPaid = isSession && (session.plan === "pro" || session.plan === "team" || session.cloudAccess);

  return (
    <div className="hero-actions" data-landing-hero-auth={session.mode}>
      <a
        href={isSession ? "/dashboard" : "/api/auth/login"}
        className="button button-primary"
        data-funnel-event={isSession ? "dashboard_open_click" : "sign_in_click"}
      >
        {isSession ? "Open Hermes on the web" : "Sign in to Hermes Web"}{" "}
        <span aria-hidden="true">→</span>
      </a>
      {isPaid ? (
        <a href="/api/billing/portal" className="button button-secondary" data-funnel-event="manage_billing_click">
          You&apos;re on Pro · Manage billing
        </a>
      ) : isSession ? (
        <a href="/api/billing/checkout" className="button button-secondary" data-funnel-event="upgrade_pro_click">
          Upgrade to Pro ($10/mo)
        </a>
      ) : (
        <a href="#pricing" className="button button-secondary" data-funnel-event="cloud_continuity_click">
          Try Continuity — 14 days free
        </a>
      )}
    </div>
  );
}

/**
 * Private-workspace panel: no second Sign-in when anon.
 * Points to pair + Continuity (keeps public HTML free of workspace telemetry).
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
        <a className="landing-action" href="#pair">
          <span className="action-icon" aria-hidden="true">+</span>
          <span>
            <strong>Pair your Mac</strong>
            <small>One installer. Approve a short code.</small>
          </span>
          <b aria-hidden="true">→</b>
        </a>
        <a className="landing-action" href="#pricing">
          <span className="action-icon" aria-hidden="true">☁</span>
          <span>
            <strong>Continuity</strong>
            <small>Can pick up eligible work on a VPS when offline — still proving this out.</small>
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
