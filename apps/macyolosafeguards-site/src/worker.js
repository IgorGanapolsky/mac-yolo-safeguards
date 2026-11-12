import { activate, activatePage, refresh } from "./license.js";
import { sendCheckoutAlerts } from "./checkout-alerts.js";

// Cloudflare Worker for Mac YOLO Safeguards (macyolosafeguards.io)
// Mirrors the dayglass.io Worker + Static Assets + /go/* checkout attribution architecture.

const PRO_SLUGS = new Set(["pro-direct", "pro", "pro_monthly", "monthly"]);

// Staging (CHECKOUT_MODE = "test") never redirects to a live Stripe link: Pro slugs go to the
// test-mode PRO_CHECKOUT_URL when it is set, and every other slug falls back to pricing.
export function checkoutTarget(slug, env = {}) {
  if (env.CHECKOUT_MODE === "test") {
    return PRO_SLUGS.has(slug) && env.PRO_CHECKOUT_URL ? env.PRO_CHECKOUT_URL : undefined;
  }
  return GO_REDIRECTS[slug];
}

const GO_REDIRECTS = {
  "pro-direct": "https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10",
  "pro": "https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10",
  "pro_monthly": "https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10",
  "monthly": "https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10",
  "triage": "https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y",
  "diagnostic": "https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y",
  "499": "https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y",
  "sprint": "https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38",
  "hardening": "https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38",
  "1500": "https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38",
  "pilot": "https://buy.stripe.com/9B6eVdcqM7DgcSdayn3sJ0Z",
  "b2b": "https://buy.stripe.com/9B6eVdcqM7DgcSdayn3sJ0Z",
  "3000": "https://buy.stripe.com/9B6eVdcqM7DgcSdayn3sJ0Z",
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
