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
  assert.match(layout, /agent observability/);
  assert.match(page, /Leash/);
  assert.match(page, /by ThumbGate/);
  assert.match(page, /Your Hermes work/);
  assert.match(page, /Free control\. Paid continuity\./);
  assert.match(page, /Web Control/);
  assert.match(page, /Cloud Continuity/);
  assert.match(page, /Continue with Google or Apple/);
  assert.match(page, /<BillingPlan \/>/);
  assert.doesNotMatch(page, /\$29|price: "29"/);
  assert.match(billingPlan, /\/api\/billing\/plan/);
  assert.match(billingPlanRoute, /STRIPE_PRICE_ID/);
  assert.match(billingPlanRoute, /unitAmount: price\.unit_amount/);
  assert.doesNotMatch(billingPlanRoute, /["']STRIPE_SECRET_KEY["']\s*:/);
  assert.match(checkoutRoute, /billing\.checkout\.created/);
  assert.match(checkoutRoute, /billing\.checkout\.failed/);
  assert.match(checkoutRoute, /subscription already active; use billing management/);
  assert.match(portalRoute, /subscription\.metadata\?\.organization_id === session\.organizationId/);
  assert.match(portalRoute, /\/v1\/billing_portal\/sessions/);
  assert.match(portalRoute, /billing\.portal\.created/);
  assert.match(dashboard, /\? manageBilling\(\) : subscribe\(\)/);
  assert.match(page, /100 cloud continuations/);
  assert.match(page, /Run one installer/);
  assert.match(page, /data-funnel-event="free_control_click"/);
  assert.match(page, /data-funnel-event="cloud_continuity_click"/);
  assert.match(page, /90s<\/strong><span>execution lease/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /SoftwareApplication/);
  assert.match(robots, /disallow: \["\/dashboard", "\/api\/"\]/);
  assert.match(robots, /https:\/\/thumbgate\.app\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/thumbgate\.app\//);
  assert.match(llms, /Aggregate, content-free product analytics/);
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
