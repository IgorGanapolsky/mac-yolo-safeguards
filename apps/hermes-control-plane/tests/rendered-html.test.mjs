import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the public Leash subscription landing page", async () => {
  const [page, layout, robots, sitemap, llms] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /metadataBase: new URL\("https:\/\/leash\.dev"\)/);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(layout, /agent observability/);
  assert.match(page, /Leash/);
  assert.match(page, /by ThumbGate/);
  assert.match(page, /Your Hermes work/);
  assert.match(page, /Free control\. Paid continuity\./);
  assert.match(page, /Web Control/);
  assert.match(page, /Cloud Continuity/);
  assert.match(page, /Continue with Google or Apple/);
  assert.match(page, /\$29/);
  assert.match(page, /100 cloud continuations/);
  assert.match(page, /Run one installer/);
  assert.match(page, /data-funnel-event="free_control_click"/);
  assert.match(page, /data-funnel-event="cloud_continuity_click"/);
  assert.match(page, /90s<\/strong><span>execution lease/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /SoftwareApplication/);
  assert.match(robots, /disallow: \["\/dashboard", "\/api\/"\]/);
  assert.match(robots, /https:\/\/leash\.dev\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/leash\.dev\//);
  assert.match(llms, /Aggregate, content-free product analytics/);
  assert.match(llms, /CloudCLI is a separate/);
  assert.doesNotMatch(page, /Igor|Ganapolsky/i);
  assert.doesNotMatch(`${layout}\n${robots}\n${sitemap}\n${llms}`, /Igor|Ganapolsky/i);
  assert.doesNotMatch(page, /codex-preview|react-loading-skeleton/);
});

test("keeps secrets server-side and device requests signed", async () => {
  const [dashboard, deviceAuth, callback] = await Promise.all([
    readFile(new URL("../app/dashboard/DashboardClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/device-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/callback/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /WORKOS_API_KEY|STRIPE_SECRET_KEY|HERMES_CLOUD_RUNNER_TOKEN/);
  assert.match(deviceAuth, /crypto\.subtle\.verify/);
  assert.match(deviceAuth, /replayed device request/);
  assert.match(callback, /grant_type: "authorization_code"/);
  assert.match(callback, /return new Response\(null, \{/);
  assert.match(callback, /"set-cookie": sessionCookie\(sessionToken\)/);
  assert.doesNotMatch(callback, /Response\.redirect\([^;]+\);\s*\n\s*redirect\.headers\.append\("set-cookie"/);
  assert.doesNotMatch(callback, /localStorage|sessionStorage/);
});
