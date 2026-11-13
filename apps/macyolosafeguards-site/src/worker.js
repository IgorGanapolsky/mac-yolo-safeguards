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
  "dmg": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.1/MacYoloSafeguards-1.2.1.dmg",
  "download": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.1/MacYoloSafeguards-1.2.1.dmg",
  "pkg": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.1/MacYoloSafeguards.pkg",
  "zip": "https://github.com/IgorGanapolsky/mac-yolo-safeguards/releases/download/v1.2.1/MacYoloSafeguards.zip",
  "github": "https://github.com/IgorGanapolsky/mac-yolo-safeguards"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" || url.pathname === "/healthz") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "macyolosafeguards",
          domain: "macyolosafeguards.io",
          version: "1.2.1",
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
      const dest = new URL(target);
      for (const [k, v] of url.searchParams.entries()) {
        dest.searchParams.set(k, v);
      }
      return Response.redirect(dest.toString(), 302);
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
