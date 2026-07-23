import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the public Leash subscription landing page", async () => {
  const [page, billingPlan, billingPlanRoute, checkoutRoute, portalRoute, dashboard, layout, robots, sitemap, llms] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/BillingPlan.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/plan/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/portal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /metadataBase: new URL\("https:\/\/thumbgate\.app"\)/);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(layout, /url: "\/og\.png"/);
  assert.match(layout, /width: 1200/);
  assert.match(layout, /height: 630/);
  assert.match(layout, /images: \["\/og\.png"\]/);
  assert.match(layout, /agent observability/);
  assert.match(page, /ThumbGate/);
  assert.match(page, /Hermes dashboard/);
  assert.match(page, /Continuity/);
  assert.doesNotMatch(page, /Self-Improving Firewall|self-improving firewall/);
  assert.match(page, /Free control\. Paid continuity\./);
  assert.match(page, /Web Control/);
  assert.match(page, /Cloud Continuity/);
  assert.match(page, /Continue with Google today/);
  assert.doesNotMatch(page, /Continue with Google or Apple/);
  assert.match(page, /still proving out in real use/);
  assert.match(page, /by ThumbGate/);
  assert.match(page, /Your Hermes work/);
  assert.match(page, /Leash/);
  assert.match(page, /Run one installer/);
  assert.match(page, /href="\/go\/android"/);
  assert.match(page, /href="\/go\/ios"/);
  assert.match(page, /data-funnel-event="play_store_click"/);
  assert.match(page, /data-funnel-event="app_store_click"/);
  assert.match(page, /id="mobile"/);
  assert.match(page, /Google Play/);
  assert.match(page, /App Store/);
  const storeLinks = await readFile(new URL("../app/storeLinks.ts", import.meta.url), "utf8");
  const androidGo = await readFile(new URL("../app/go/android/route.ts", import.meta.url), "utf8");
  const iosGo = await readFile(new URL("../app/go/ios/route.ts", import.meta.url), "utf8");
  assert.match(storeLinks, /com\.iganapolsky\.hermesmobile\.paid/);
  assert.match(storeLinks, /id6786778037/);
  assert.match(androidGo, /PLAY_STORE_URL/);
  assert.match(iosGo, /APP_STORE_URL/);
  assert.doesNotMatch(page, /Sign in with AuthKit \(Google, Apple, Microsoft, GitHub/);
  assert.match(page, /<BillingPlan \/>/);
  assert.match(page, /LandingAuthHero|LandingAuthNav/);
  assert.doesNotMatch(page, /currentSession\(/);
  assert.match(page, /<FailoverPathDemo \/>/);
  assert.match(page, /Remote control\. Keep going offline\./);
  assert.doesNotMatch(page, /\$29|price: "29"/);
  const failoverDemo = await readFile(new URL("../app/FailoverPathDemo.tsx", import.meta.url), "utf8");
  assert.match(failoverDemo, /Deny call/);
  assert.match(failoverDemo, /Approve call/);
  assert.match(failoverDemo, /Continue in cloud/);
  assert.match(failoverDemo, /needs_failover/);
  assert.match(failoverDemo, /offline_blocked/);
  assert.match(failoverDemo, /Interactive demo · no real tools run/);
  assert.match(billingPlan, /\/api\/billing\/plan/);
  assert.match(billingPlanRoute, /STRIPE_PRICE_ID/);
  assert.match(billingPlanRoute, /unitAmount: price\.unit_amount/);
  assert.doesNotMatch(billingPlanRoute, /["']STRIPE_SECRET_KEY["']\s*:/);
  assert.match(checkoutRoute, /billing\.checkout\.created/);
  assert.match(checkoutRoute, /billing\.checkout\.failed/);
  assert.match(checkoutRoute, /subscription already active; use billing management/);
  assert.match(portalRoute, /subscription\.metadata\?\.organization_id === session\.organizationId/);
  assert.match(portalRoute, /item\.price\?\.id === current\.STRIPE_PRICE_ID/);
  assert.match(portalRoute, /\/\^\(ThumbGate\|Leash\)\\b\/i\.test\(productName\)/);
  assert.match(portalRoute, /\/v1\/billing_portal\/sessions/);
  assert.match(portalRoute, /billing\.portal\.created/);
  assert.match(dashboard, /\? manageBilling\(\) : subscribe\(\)/);
  assert.match(page, /100 cloud continuations/);
  assert.match(page, /Run one installer/);
  assert.match(page, /Connect your Mac\. Open the dashboard\./);
  assert.match(page, /Continuity \(VPS\)/);
  // Pricing CTAs live in client chrome (static shell + /api/me personalization).
  const chrome = await readFile(new URL("../app/LandingAuthChrome.tsx", import.meta.url), "utf8");
  assert.match(chrome, /data-funnel-event="free_control_click"/);
  assert.match(chrome, /data-funnel-event="cloud_continuity_click"/);
  assert.match(chrome, /data-funnel-event=\{isSession \? "dashboard_open_click" : "sign_in_click"\}/);
  assert.match(chrome, /Try Continuity — 14 days free/);
  assert.match(chrome, /Can pick up eligible work on a VPS when offline — still proving this out/);
  assert.equal((chrome.match(/"sign_in_click"/g) ?? []).length, 1);
  assert.equal((chrome.match(/fetch\("\/api\/me"/g) ?? []).length, 1);
  assert.match(page, /90s<\/strong><span>execution lease/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /RemoteControlDiagram/);
  const diagram = await readFile(new URL("../app/RemoteControlDiagram.tsx", import.meta.url), "utf8");
  assert.match(diagram, /Your phone/);
  assert.match(diagram, /Encrypted pairing/);
  assert.doesNotMatch(page, /FAQPage|What is ThumbGate\?/);
  assert.match(robots, /disallow: \["\/dashboard", "\/api\/"\]/);
  assert.match(robots, /https:\/\/thumbgate\.app\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/thumbgate\.app\//);
  assert.match(sitemap, /2026-07-22/);
  assert.match(llms, /Aggregate, content-free product analytics/);
  assert.match(llms, /## Direct answers/);
  assert.match(llms, /web dashboard for Hermes remote control/);
  assert.match(llms, /CloudCLI is a separate/);
  assert.doesNotMatch(page, /Igor|Ganapolsky/i);
  assert.doesNotMatch(`${layout}\n${robots}\n${sitemap}\n${llms}`, /Igor|Ganapolsky/i);
  assert.doesNotMatch(page, /codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(`${layout}\n${robots}\n${sitemap}\n${llms}`, /https:\/\/leash\.dev/);
});

test("keeps secrets server-side, redirects mutable, and device requests signed", async () => {
  const [dashboard, deviceAuth, callback, logout] = await Promise.all([
    readFile(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/device-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /WORKOS_API_KEY|STRIPE_SECRET_KEY|HERMES_CLOUD_RUNNER_TOKEN/);
  assert.match(deviceAuth, /crypto\.subtle\.verify/);
  assert.match(deviceAuth, /replayed device request/);
  assert.match(callback, /grant_type: "authorization_code"/);
  assert.match(callback, /return new Response\(null, \{/);
  assert.match(callback, /"set-cookie": sessionCookie\(sessionToken\)/);
  assert.doesNotMatch(callback, /Response\.redirect\([^;]+\);\s*\n\s*redirect\.headers\.append\("set-cookie"/);
  assert.doesNotMatch(logout, /Response\.redirect\(/);
  assert.match(logout, /"set-cookie": clearSessionCookie\(\)/);
  assert.doesNotMatch(callback, /localStorage|sessionStorage/);
});
