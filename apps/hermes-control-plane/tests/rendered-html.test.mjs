import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the public hosted Hermes landing page", async () => {
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
  assert.match(layout, /agent keeps running on a fenced VPS|Hermes that stays on/);
  assert.doesNotMatch(layout, /VPS failover for Hermes/);
  assert.doesNotMatch(layout, /When the Mac closes/);
  assert.match(page, /ThumbGate/);
  assert.match(page, /fenced cloud VPS|Fenced VPS|fenced VPS/i);
  assert.match(page, /Is this Continuity\?/);
  assert.doesNotMatch(page, /Self-Improving Firewall|self-improving firewall/);
  // Product truth: hosted Hermes on a fenced VPS — not Mac pairing as the marketed path.
  assert.doesNotMatch(page, /Sign in to pair free|Pair free →|Pair your Mac|when the Mac closes/);
  assert.match(page, /No Mac pair required|no Mac pairing/i);
  assert.match(page, /Hosted Hermes/);
  assert.match(page, /Sign in with email, Google, or Apple\. Approvals stay in this browser/);
  assert.doesNotMatch(page, /Continue with Google today/);
  assert.doesNotMatch(page, /more providers activate once configured/);
  assert.match(page, /LLM-as-a-Judge/);
  assert.match(page, /Fenced Cloud VPS|fenced VPS|fenced cloud VPS/i);
  assert.doesNotMatch(page, /still proving/);
  assert.doesNotMatch(page, /by ThumbGate/);
  assert.doesNotMatch(page, /id="mobile"/);
  assert.match(page, /Closed-system/);
  assert.match(page, /Flat \$10/);
  assert.doesNotMatch(page, /Phone Leash/);
  assert.doesNotMatch(page, /Pocket Leash|Why the store badges|ThumbGate\.app vs Hermes Mobile/);
  assert.doesNotMatch(page, /StoreBadgeRow/);
  assert.match(page, /Approvals in thumbgate\.app|Where do approvals happen/);
  assert.doesNotMatch(page, /Hermes Mobile/);
  assert.doesNotMatch(page, /store-link-badge/);
  // FAQ must not hardcode a false \$20 hosted price (live plan is \$10).
  assert.doesNotMatch(page, /\$20\/month/);
  const storeBadges = await readFile(new URL("../app/StoreBadges.tsx", import.meta.url), "utf8");
  assert.match(storeBadges, /href="\/go\/android"/);
  assert.match(storeBadges, /href="\/go\/ios"/);
  assert.match(storeBadges, /data-funnel-event="play_store_click"/);
  assert.match(storeBadges, /data-funnel-event="app_store_click"/);
  assert.match(storeBadges, /Google Play/);
  assert.match(storeBadges, /App Store/);
  assert.match(storeBadges, /GET IT ON/);
  assert.match(storeBadges, /Download on the/);
  assert.match(storeBadges, /store-badge-play/);
  assert.match(storeBadges, /store-badge-ios/);
  assert.match(storeBadges, /GooglePlayMark|EA4335/);
  assert.match(storeBadges, /AppleMark/);
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
  assert.match(page, /Fenced VPS execution with renewable leases/);
  assert.doesNotMatch(page, /\$29|price: "29"/);
  const failoverDemo = await readFile(new URL("../app/FailoverPathDemo.tsx", import.meta.url), "utf8");
  assert.match(failoverDemo, /Deny call/);
  assert.match(failoverDemo, /Approve call/);
  assert.match(failoverDemo, /Continue in cloud/);
  assert.match(failoverDemo, /needs_failover/);
  assert.match(failoverDemo, /offline_blocked/);
  assert.match(failoverDemo, /Interactive demo · no real tools run/);
  assert.match(failoverDemo, /Hosted Hermes wants to run this on the VPS/);
  assert.match(failoverDemo, /Running on hosted VPS/);
  assert.match(failoverDemo, /Hosted VPS · fenced lease/);
  assert.match(failoverDemo, /Hosted Hermes is executing on a fenced VPS/);
  assert.doesNotMatch(failoverDemo, /Continuity wants to run this on the VPS/);
  assert.doesNotMatch(failoverDemo, /Running on Continuity VPS/);
  assert.match(billingPlan, /\/api\/billing\/plan/);
  assert.match(billingPlan, /\$10/);
  assert.doesNotMatch(billingPlan, /Live price/);
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
  // Landing "Manage billing" is a GET link — must not 405.
  assert.match(portalRoute, /export async function GET/);
  assert.match(portalRoute, /export async function POST/);
  assert.match(portalRoute, /handlePortalRequest|isGet/);
  assert.match(dashboard, /\? manageBilling\(\) : subscribe\(\)/);
  assert.match(page, /Sign in\. Run on VPS\. Stay gated\./);
  assert.match(page, /Hosted Hermes/);
  // Pricing CTAs live in client chrome (static shell + /api/me personalization).
  const chrome = await readFile(new URL("../app/LandingAuthChrome.tsx", import.meta.url), "utf8");
  assert.match(chrome, /data-funnel-event="free_control_click"/);
  assert.match(chrome, /data-funnel-event="cloud_continuity_click"/);
  assert.match(chrome, /data-funnel-event="sign_in_click"/);
  assert.match(chrome, /Start hosted Hermes — \$10\/mo/);
  assert.match(chrome, /cancel anytime/);
  assert.match(chrome, /Team — \$49\/mo/);
  assert.match(chrome, /Start hosted Hermes — \$10\/mo/);
  assert.match(chrome, /Sign in/);
  assert.match(chrome, /Fenced cloud runner with 90s leases/);
  assert.doesNotMatch(chrome, /Sign in to pair free|Pair free →|Open pair/);
  assert.doesNotMatch(chrome, /still proving/);
  assert.equal((chrome.match(/"sign_in_click"/g) ?? []).length, 1);
  assert.equal((chrome.match(/fetch\("\/api\/me"/g) ?? []).length, 1);
  // Lease copy lives in steps + FailoverPathDemo (not the old stats-strip HTML).
  assert.match(page, /90-second renewable leases/);
  // Pinned model VERSIONS rot in public and read as abandonment.
  assert.doesNotMatch(page, /Claude\s*(?:(?:Sonnet|Opus|Haiku)\s*)?\d/i);
  assert.doesNotMatch(page, /GPT[-\s]*\d/i);
  assert.doesNotMatch(page, /Gemini\s*\d/i);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /RemoteControlDiagram/);
  const diagram = await readFile(new URL("../app/RemoteControlDiagram.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(diagram, /Hermes Mobile/);
  assert.match(diagram, /thumbgate\.app/);
  assert.match(diagram, /LLM-as-a-Judge/);
  assert.match(diagram, /Fenced VPS/);
  assert.match(llms, /not Mac pairing|no Mac-pair product path|without a Mac-pair/i);
  // AEO contract (config/thumbgate-aeo-prompts.json): landing must ship a
  // visible FAQ + FAQPage JSON-LD so answer engines can cite it.
  assert.match(page, /FAQPage/);
  assert.match(page, /id="faq"/);
  assert.match(page, /What is ThumbGate\?/);
  assert.match(page, /Why not just run another agent pilot/);
  assert.match(page, /Where do approvals happen\?/);
  assert.match(page, /What if the agent wants to kill a process or copy itself\?/);
  assert.match(page, /does not auto-run that/);
  assert.doesNotMatch(page, /id="mobile"/);
  assert.match(page, /id="pricing"/);
  assert.match(page, /data-testid="sleep-vs-vps"/);
  assert.match(page, /When the machine sleeps, the agent dies/);
  assert.match(page, /Your coding agent dies when the laptop sleeps/);
  assert.match(page, /Hosted on a fenced VPS\. Not a laptop process/);
  assert.match(page, /<h1>Hermes that stays on\.<\/h1>/);
  assert.match(page, /data-testid="qualifier"/);
  assert.match(page, /data-testid="one-offer"/);
  assert.match(page, /One offer · one clock · one number/);
  assert.match(page, /Keep one coding agent running 14 days|Keep one agent alive 14 days/);
  assert.match(page, /the trial failed/);
  assert.match(page, /Not a vault of n8n templates/);
  assert.doesNotMatch(page, /cash ROI refund|30-day ROI/i);
  assert.match(page, /cancel anytime/);
  assert.match(page, /14 days free/);
  assert.match(page, /Start hosted Hermes — \$10\/mo/);
  assert.match(page, /LandingPricingCtaTeam/);
  assert.match(page, /data-testid="price-card-free"/);
  assert.match(page, /data-testid="price-card-team"/);
  assert.doesNotMatch(page, /scope="row">Mac pair required/);
  assert.doesNotMatch(page, /Agent work on afenced/);
  assert.doesNotMatch(page, /AI expert/);
  assert.doesNotMatch(page, /more providers activate once configured/);
  // CoreWeave-style transparent capacity: public matrix + governance-aligned run caps.
  assert.match(page, /data-testid="continuity-capacity-matrix"/);
  assert.match(page, /Transparent hosted capacity/);
  assert.match(page, /Fenced VPS runs \/ 30d/);
  assert.match(page, /Surprise egress \/ idle fees/);
  assert.match(page, /from "@\/lib\/continuity-pricing"/);
  assert.match(page, /CONTINUITY_PRICE_TIERS/);
  assert.doesNotMatch(page, /CONTINUITY_EXECUTION_MODES/);
  assert.match(page, /CONTINUITY_ZERO_EGRESS/);
  assert.doesNotMatch(page, /data-testid="continuity-execution-modes"/);
  assert.match(page, /data-testid="continuity-zero-egress"/);
  assert.doesNotMatch(page, /data-mode=\{mode\.id\}/);
  assert.match(robots, /disallow: \["\/dashboard", "\/admin", "\/api\/"\]/);
  assert.match(robots, /https:\/\/thumbgate\.app\/sitemap\.xml/);
  assert.match(page, /href="\/privacy"/);
  assert.match(page, /href="\/terms"/);
  assert.match(sitemap, /https:\/\/thumbgate\.app\/privacy/);
  assert.match(sitemap, /https:\/\/thumbgate\.app\/terms/);
  assert.match(sitemap, /https:\/\/thumbgate\.app\//);
  assert.match(sitemap, /2026-07-22/);
  assert.match(llms, /# ThumbGate/);
  assert.match(llms, /Aggregate, content-free product analytics/);
  assert.match(llms, /## Direct answers/);
  assert.match(llms, /fenced VPS agent execution|fenced cloud VPS/i);
  assert.match(llms, /Do I pair my Mac\? No/);
  assert.match(llms, /Why not another laptop pilot/);
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
