"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HostedCheckoutCta } from "./HostedCheckoutCta";
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

function hasHostedEntitlement(session: AuthSession): boolean {
  // Trust /api/me cloudAccess (includes live trial expiry). Do not treat a stale
  // plan label alone as entitlement — expired trials stay on plan=trial.
  if (session.mode !== "session") return false;
  if (session.cloudAccess) return true;
  return session.plan === "pro" || session.plan === "team";
}

function isPaidPlan(session: AuthSession): boolean {
  return session.mode === "session" && (session.plan === "pro" || session.plan === "team");
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
          <a href="/dashboard" className="button button-small button-secondary" data-funnel-event="dashboard_open_click">
            Open dashboard
          </a>
          <SignOutForm buttonClassName={`button button-small ${styles.signOutButton}`} data-testid="landing-sign-out" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hosted-Hermes hero CTAs. Product is hosted Hermes on a fenced VPS — not Mac pairing.
 * Do not market a phone leash or Hermes Mobile on this page.
 *
 * Signed-in users with trial/pro must NOT see another $10 checkout wall.
 */
export function LandingAuthHero() {
  const session = useLandingAuth();
  const isSession = session.mode === "session";
  const entitled = hasHostedEntitlement(session);
  const paid = isPaidPlan(session);

  return (
    <div className="hero-actions" data-landing-hero-auth={session.mode} data-landing-entitled={entitled ? "1" : "0"}>
      {entitled ? (
        <>
          <a
            href="/dashboard"
            className="button button-primary"
            data-funnel-event="dashboard_open_click"
            data-testid="landing-open-hosted"
          >
            Continue hosted Hermes <span aria-hidden="true">→</span>
          </a>
          {paid ? (
            <a href="/api/billing/portal" className="button button-secondary" data-funnel-event="manage_billing_click">
              You&apos;re on {session.plan === "team" ? "Team" : "Pro"} · Manage billing
            </a>
          ) : (
            <a href="/dashboard" className="button button-secondary" data-funnel-event="dashboard_open_click">
              Trial active · Open dashboard
            </a>
          )}
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
            Open dashboard
          </a>
        </>
      ) : (
        <>
          <HostedCheckoutCta>
            Start hosted Hermes — $10/mo <span aria-hidden="true">→</span>
          </HostedCheckoutCta>
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
  const session = useLandingAuth();
  const isSession = session.mode === "session";
  return (
    <>
      <div className="console-header">
        <span className="console-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-mark" src="/brand/thumbgate-mark-inline-v3.svg" alt="" width={22} height={22} decoding="async" /> Your workspace is private
        </span>
        <span className="action-label">
          {session.mode === "loading" ? "Checking session…" : isSession ? "Session active" : "Sign-in required"}
        </span>
      </div>
      <div className="landing-action-list">
        <a className="landing-action" href={isSession ? "/dashboard" : "#pricing"}>
          <span className="action-icon" aria-hidden="true">☁</span>
          <span>
            <strong>Hosted Hermes</strong>
            <small>
              {hasHostedEntitlement(session)
                ? "Your trial/plan is active. Open the dashboard to keep working."
                : "Fenced cloud runner with 90s leases. 14 days free, cancel anytime. No Mac pair step."}
            </small>
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
  const session = useLandingAuth();
  return session.mode === "session" ? "/dashboard" : "/api/auth/login";
}

export function LandingPricingCtaFree() {
  const session = useLandingAuth();
  const href = useSessionHref();
  const label = session.mode === "session" ? "Open dashboard →" : "Sign in →";
  return (
    <a href={href} className="button button-secondary" data-funnel-event="free_control_click">
      {label}
    </a>
  );
}

/**
 * Primary paid CTA used across pricing / qualifier / footer / StartSurfaces.
 * Entitled sessions open the dashboard — never another $10 checkout wall.
 *
 * Important: when entitled, ignore `children` so call sites that still pass
 * "Start hosted Hermes — $10/mo" do not re-paint a pay wall for trial/pro users.
 * While /api/me is loading, render a disabled placeholder — never checkout.
 */
export function LandingPricingCtaPaid({
  children,
  testId,
  funnelEvent,
  ctaId,
}: {
  children?: ReactNode;
  testId?: string;
  /** Optional funnel id for anon checkout / entitled continue (e.g. give_work_click). */
  funnelEvent?: string;
  /** Optional data-cta-id for analytics (e.g. put-hosted-hermes-to-work). */
  ctaId?: string;
} = {}) {
  const session = useLandingAuth();
  if (session.mode === "loading") {
    return (
      <button
        type="button"
        className="button button-primary"
        disabled
        aria-busy="true"
        data-testid={testId ?? "landing-cta-loading"}
        {...(ctaId ? { "data-cta-id": ctaId } : {})}
      >
        Checking session…
      </button>
    );
  }
  if (hasHostedEntitlement(session)) {
    return (
      <a
        href="/dashboard"
        className="button button-primary"
        data-funnel-event={funnelEvent ?? "dashboard_open_click"}
        data-testid={testId ?? "landing-continue-hosted"}
        {...(ctaId ? { "data-cta-id": ctaId } : {})}
      >
        Continue hosted Hermes <span aria-hidden="true">→</span>
      </a>
    );
  }
  return (
    <HostedCheckoutCta testId={testId} funnelEvent={funnelEvent} ctaId={ctaId}>
      {children ?? (
        <>
          Start hosted Hermes — $10/mo →
        </>
      )}
    </HostedCheckoutCta>
  );
}
