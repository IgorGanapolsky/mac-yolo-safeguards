import { activate, activatePage, refresh } from "./license.js";
import { sendCheckoutAlerts } from "./checkout-alerts.js";

// Cloudflare Worker for Mac YOLO Safeguards (macyolosafeguards.io)
// Mirrors the dayglass.io Worker + Static Assets + /go/* checkout attribution architecture.

const PRO_SLUGS = new Set(["pro-direct", "pro", "pro_monthly", "monthly", "pro-once", "once", "lifetime"]);

// Staging (CHECKOUT_MODE = "test") never redirects to a live Stripe link: Pro slugs go to the
// test-mode PRO_CHECKOUT_URL when it is set, and every other slug falls back to pricing.
export function checkoutTarget(slug, env = {}) {
  if (env.CHECKOUT_MODE === "test") {
    return PRO_SLUGS.has(slug) && env.PRO_CHECKOUT_URL ? env.PRO_CHECKOUT_URL : undefined;
  }
  return GO_REDIRECTS[slug];
}

// Stripe Payment Links drop query parameters they don't know, so ?from=app never reached the
// Checkout Session. client_reference_id is kept, so the visitor source goes there.
export function checkoutRedirect(target, params) {
  const dest = new URL(target);
  for (const [k, v] of params.entries()) {
    dest.searchParams.set(k, v);
  }
  const source = (params.get("from") || params.get("utm_source") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
  if (source) dest.searchParams.set("client_reference_id", source);
  return dest.toString();
}

const GO_REDIRECTS = {
  "pro-direct": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "pro": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "pro-once": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "once": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "lifetime": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "pro-annual": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "annual": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "yearly": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "pro_monthly": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "monthly": "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05",
  "triage": "https://buy.stripe.com/3cI28s5F6cxN9Bt4nJf3a02",
  "diagnostic": "https://buy.stripe.com/3cI28s5F6cxN9Bt4nJf3a02",
  "499": "https://buy.stripe.com/3cI28s5F6cxN9Bt4nJf3a02",
  "sprint": "https://buy.stripe.com/dRmdRa3wYdBRdRJ7zVf3a03",
  "hardening": "https://buy.stripe.com/dRmdRa3wYdBRdRJ7zVf3a03",
  "1500": "https://buy.stripe.com/dRmdRa3wYdBRdRJ7zVf3a03",
  "pilot": "https://buy.stripe.com/eVq9AU2sUeFV3d51bxf3a04",
  "b2b": "https://buy.stripe.com/eVq9AU2sUeFV3d51bxf3a04",
  "3000": "https://buy.stripe.com/eVq9AU2sUeFV3d51bxf3a04",
  "dmg": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.2/MacYoloSafeguards-1.2.2.dmg",
  "download": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.2/MacYoloSafeguards-1.2.2.dmg",
  "pkg": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.2/MacYoloSafeguards.pkg",
  "zip": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.2/MacYoloSafeguards.zip",
  "github": "https://github.com/IgorGanapolsky/mac-yolo-safeguards"
};

// PostHog project key for the Mac YOLO site. Client-side capture keys are public by design.
const POSTHOG_KEY = "phc_ub5A4JPFsB2dm54Vaq2dWGeDh9zouzLL4Vb6TcicJxvf";
const GO_PLANS = {
  "pro-once": ["pro", 29], once: ["pro", 29], pro: ["pro", 29], "pro-direct": ["pro", 29], lifetime: ["pro", 29],
  "pro-annual": ["pro", 29], annual: ["pro", 29], yearly: ["pro", 29], pro_monthly: ["pro", 29], monthly: ["pro", 29],
  triage: ["investigation", 499], diagnostic: ["investigation", 499], "499": ["investigation", 499],
  sprint: ["rollout", 1500], hardening: ["rollout", 1500], "1500": ["rollout", 1500],
  pilot: ["pilot", 3000], b2b: ["pilot", 3000], "3000": ["pilot", 3000]
};
const DOWNLOAD_SLUGS = new Set(["dmg", "download", "pkg", "zip"]);

// Counts every /go/* hit (downloads, checkout clicks) on the server, so ad blockers and
// no-JS visitors still show up. No cookies and no IP or user id are stored with the event.
export function goEvent(slug, url, request) {
  const q = url.searchParams;
  const props = { product: "macyolo", slug, source: "worker", $process_person_profile: false, $ip: null };
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = q.get(k);
    if (v) props[k] = v.slice(0, 100);
  }
  if (q.get("from")) props.from = q.get("from").slice(0, 40);
  const ua = request.headers.get("user-agent") || "";
  props.likely_bot = !ua || /bot|crawl|spider|curl|wget|python|node|headless|preview|slack|facebook/i.test(ua);
  let event = "go_click";
  if (DOWNLOAD_SLUGS.has(slug)) { event = "download_click"; props.format = slug === "pkg" ? "pkg" : slug === "zip" ? "zip" : "dmg"; }
  else if (GO_PLANS[slug]) { event = GO_PLANS[slug][0] === "pro" ? "pro_click" : "team_click"; props.plan = GO_PLANS[slug][0]; props.price = GO_PLANS[slug][1]; }
  return { api_key: POSTHOG_KEY, event, distinct_id: crypto.randomUUID(), properties: props };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" || url.pathname === "/healthz") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "macyolosafeguards",
          domain: "macyolosafeguards.io",
          version: "1.2.2",
          checkout_ready: true,
          redirects: Object.keys(GO_REDIRECTS)
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
          }
        }
      );
    }

    if (url.pathname === "/activate" || url.pathname === "/activate/") {
      const result = await activate(env, url.searchParams.get("session_id"));
      return new Response(activatePage(result), {
        status: result.ok ? 200 : 400,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" }
      });
    }

    if (url.pathname === "/license/refresh") {
      const result = await refresh(env, url.searchParams.get("key"));
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 403,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    if (url.pathname === "/pricing" || url.pathname === "/pricing/") {
      // Keep ?from=… so the page can tag checkout links with where the visitor came from.
      return Response.redirect(new URL("/" + url.search + "#pricing", url.origin).toString(), 301);
    }

    if (url.pathname.startsWith("/go/")) {
      const slug = url.pathname.slice(4).replace(/\/+$/, "").toLowerCase();
      const target = checkoutTarget(slug, env);
      // An unknown or mistyped slug goes to the pricing section, not straight into a checkout.
      if (!target) return Response.redirect(new URL("/#pricing", url.origin).toString(), 302);
      if (env.CHECKOUT_MODE !== "test" && ctx && ctx.waitUntil) {
        ctx.waitUntil(
          fetch("https://us.i.posthog.com/capture/", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(goEvent(slug, url, request))
          }).catch(() => {})
        );
      }
      return Response.redirect(checkoutRedirect(target, url.searchParams), 302);
    }

    const accept = request.headers.get("accept") || "";
    if ((url.pathname === "/" || url.pathname === "/index.html") && accept.includes("text/markdown")) {
      const mdUrl = new URL("/llms.txt", url.origin);
      const mdResp = await env.ASSETS.fetch(new Request(mdUrl.toString(), request));
      if (mdResp.ok) {
        const headers = new Headers(mdResp.headers);
        headers.set("content-type", "text/markdown; charset=utf-8");
        return new Response(mdResp.body, { status: 200, headers });
      }
    }

    return env.ASSETS.fetch(request);
  },

  // Every 30 minutes: alert on unpaid checkouts worth $400 or more.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendCheckoutAlerts(env, event.scheduledTime).then((a) => console.log(`checkout alerts sent: ${a.length}`)));
  }
};
