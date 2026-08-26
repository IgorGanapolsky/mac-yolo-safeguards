import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds the public hosted Hermes landing page", async () => {
  const [page, detailPage, faqContent, billingPlan, billingPlanRoute, checkoutRoute, portalRoute, dashboard, layout, robots, sitemap, llms] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/how-it-works/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/landing-content.ts", import.meta.url), "utf8"),
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
  const publicContent = `${page}\n${detailPage}\n${faqContent}`;
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
  assert.match(publicContent, /ThumbGate/);
  assert.match(publicContent, /fenced cloud VPS|Fenced VPS|fenced VPS/i);
  assert.match(publicContent, /Is this a memory or session-handoff plugin\?/);
  assert.doesNotMatch(publicContent, /Is this Continuity\?/);
  assert.doesNotMatch(publicContent, /Self-Improving Firewall|self-improving firewall/);
  // Product truth: hosted Hermes on a fenced VPS — not Mac pairing as the marketed path.
  assert.doesNotMatch(publicContent, /Sign in to pair free|Pair free →|Pair your Mac|when the Mac closes/);
  assert.doesNotMatch(publicContent, /Do I need to pair a Mac\?/);
  assert.match(publicContent, /No laptop required/i);
  assert.match(publicContent, /Hosted Hermes/);
  assert.match(publicContent, /Sign in with email, Google, or Apple\.[\s\S]{0,60}Approvals stay in this browser/);
  assert.doesNotMatch(publicContent, /Continue with Google today/);
  assert.doesNotMatch(publicContent, /more providers activate once configured/);
  assert.match(publicContent, /LLM-as-a-Judge/);
  assert.match(publicContent, /Fenced Cloud VPS|fenced VPS|fenced cloud VPS/i);
  assert.doesNotMatch(publicContent, /still proving/);
  assert.doesNotMatch(publicContent, /by ThumbGate/);
  assert.doesNotMatch(publicContent, /id="mobile"/);
  assert.match(publicContent, /Closed-system/);
  assert.match(publicContent, /Flat \$10/);
  assert.doesNotMatch(publicContent, /Phone Leash/);
  assert.doesNotMatch(publicContent, /Pocket Leash|Why the store badges|ThumbGate\.app vs Hermes Mobile/);
  assert.doesNotMatch(publicContent, /StoreBadgeRow/);
  assert.match(publicContent, /Approvals in thumbgate\.app|Where do approvals happen/);
  assert.doesNotMatch(publicContent, /Hermes Mobile/);
  assert.doesNotMatch(publicContent, /store-link-badge/);
  // FAQ must not hardcode a false \$20 hosted price (live plan is \$10).
  assert.doesNotMatch(publicContent, /\$20\/month/);
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
  assert.match(androidGo, /status:\s*301/);
  assert.match(iosGo, /status:\s*301/);
  assert.match(androidGo, /Location:\s*"\/"/);
  assert.match(iosGo, /Location:\s*"\/"/);
  assert.doesNotMatch(androidGo, /PLAY_STORE_URL|Response\.redirect/);
  assert.doesNotMatch(iosGo, /APP_STORE_URL|Response\.redirect/);
  assert.doesNotMatch(publicContent, /Sign in with AuthKit \(Google, Apple, Microsoft, GitHub/);
  assert.match(publicContent, /<BillingPlan \/>/);
  assert.match(publicContent, /LandingAuthHero|LandingAuthNav/);
  assert.doesNotMatch(publicContent, /currentSession\(/);
  assert.match(publicContent, /<FailoverPathDemo \/>/);
  assert.match(publicContent, /Fenced VPS execution with renewable leases/);
  assert.doesNotMatch(publicContent, /\$29|price: "29"/);
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
  assert.match(portalRoute, /\/\^\(ThumbGate\|Leash\|Hosted Hermes\)\\b\/i\.test\(productName\)/);
  assert.match(portalRoute, /\/v1\/billing_portal\/sessions/);
  assert.match(portalRoute, /billing\.portal\.created/);
  // Landing "Manage billing" is a GET link — must not 405.
  assert.match(portalRoute, /export async function GET/);
  assert.match(portalRoute, /export async function POST/);
  assert.match(portalRoute, /handlePortalRequest|isGet/);
  assert.match(dashboard, /\? manageBilling\(\) : subscribe\(\)/);
  assert.match(publicContent, /Sign in\. Start on VPS\. Stay gated\./);
  assert.match(publicContent, /Hosted Hermes/);
  // Pricing CTAs live in client chrome (static shell + /api/me personalization).
  const chrome = await readFile(new URL("../app/LandingAuthChrome.tsx", import.meta.url), "utf8");
  const hostedCta = await readFile(new URL("../app/HostedCheckoutCta.tsx", import.meta.url), "utf8");
  assert.match(chrome, /data-funnel-event="free_control_click"/);
  assert.match(hostedCta, /funnelEvent = "hosted_checkout_click"/);
  assert.match(hostedCta, /data-funnel-event=\{funnelEvent\}/);
  assert.match(chrome, /<HostedCheckoutCta>/);
  assert.match(chrome, /data-funnel-event="sign_in_click"/);
  assert.match(chrome, /Start hosted Hermes — \$10\/mo/);
  assert.match(chrome, /cancel anytime/);
  assert.doesNotMatch(chrome, /Team — \$49\/mo/);
  assert.doesNotMatch(chrome, /LandingPricingCtaTeam/);
  assert.match(chrome, /Start hosted Hermes — \$10\/mo/);
  assert.match(chrome, /Sign in/);
  assert.match(chrome, /Fenced cloud runner with 90s leases/);
  assert.doesNotMatch(chrome, /Sign in to pair free|Pair free →|Open pair/);
  assert.doesNotMatch(chrome, /still proving/);
  assert.equal((chrome.match(/"sign_in_click"/g) ?? []).length, 1);
  assert.equal((chrome.match(/fetch\("\/api\/me"/g) ?? []).length, 1);
  // Lease copy lives in steps + FailoverPathDemo (not the old stats-strip HTML).
  assert.match(publicContent, /90-second renewable leases/);
  // Pinned model VERSIONS rot in public and read as abandonment.
  assert.doesNotMatch(publicContent, /Claude\s*(?:(?:Sonnet|Opus|Haiku)\s*)?\d/i);
  assert.doesNotMatch(publicContent, /GPT[-\s]*\d/i);
  assert.doesNotMatch(publicContent, /Gemini\s*\d/i);
  assert.match(publicContent, /application\/ld\+json/);
  assert.match(publicContent, /SoftwareApplication/);
  assert.match(publicContent, /RemoteControlDiagram/);
  const diagram = await readFile(new URL("../app/RemoteControlDiagram.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(diagram, /Hermes Mobile|HERMES MOBILE|phone chassis/i);
  assert.doesNotMatch(diagram, /width="58" height="112"/);
  assert.match(diagram, /thumbgate\.app/);
  assert.match(diagram, /LLM-as-a-Judge/);
  assert.match(diagram, /Fenced VPS/);
  assert.match(llms, /not Mac pairing|no Mac-pair product path|without a Mac-pair/i);
  // AEO contract (config/thumbgate-aeo-prompts.json): landing must ship a
  // visible FAQ + FAQPage JSON-LD so answer engines can cite it.
  assert.match(publicContent, /FAQPage/);
  assert.match(publicContent, /id="faq"/);
  assert.match(publicContent, /id="example-tasks"/);
  assert.match(publicContent, /Give hosted Hermes a job/);
  assert.match(publicContent, /How do I give it a job\?/);
  assert.match(publicContent, /What is ThumbGate\?/);
  assert.match(publicContent, /Why not just run another agent pilot/);
  assert.match(publicContent, /Can I use the AI plan I already pay for instead\?/);
  assert.match(publicContent, /use the plan you already pay for/);
  assert.match(publicContent, /Codex-sub-on-laptop path is not this product/);
  assert.match(publicContent, /Where do approvals happen\?/);
  assert.match(publicContent, /What if the agent wants to kill a process or copy itself\?/);
  assert.match(publicContent, /does not auto-run that/);
  assert.doesNotMatch(publicContent, /id="mobile"/);
  assert.match(publicContent, /id="pricing"/);
  assert.match(publicContent, /data-testid="sleep-vs-vps"/);
  assert.match(publicContent, /When the machine sleeps, the agent dies/);
  assert.match(publicContent, /Your coding agent dies when the laptop sleeps/);
  assert.match(publicContent, /Hosted on a fenced VPS\. Not a laptop process/);
  assert.match(publicContent, /<h1>Hermes that stays on\.<\/h1>/);
  assert.match(publicContent, /data-testid="qualifier"/);
  assert.match(publicContent, /data-testid="one-offer"/);
  assert.match(publicContent, /One offer · one clock · one number/);
  assert.match(publicContent, /Keep one coding agent running 14 days|Keep one agent alive 14 days/);
  assert.match(publicContent, /the trial failed/);
  assert.match(publicContent, /Not a vault of n8n templates/);
  assert.doesNotMatch(publicContent, /cash ROI refund|30-day ROI/i);
  assert.match(publicContent, /cancel anytime/);
  assert.match(publicContent, /14 days free/);
  assert.match(publicContent, /Start hosted Hermes — \$10\/mo/);
  assert.doesNotMatch(publicContent, /LandingPricingCtaTeam/);
  assert.match(publicContent, /data-testid="price-card-free"/);
  assert.doesNotMatch(publicContent, /data-testid="price-card-team"/);
  assert.doesNotMatch(publicContent, /Team &amp; Enterprise/);
  assert.doesNotMatch(publicContent, /scope="row">Mac pair required/);
  assert.doesNotMatch(publicContent, /Agent work on afenced/);
  assert.doesNotMatch(publicContent, /AI expert/);
  assert.doesNotMatch(publicContent, /more providers activate once configured/);
  // CoreWeave-style transparent capacity: public matrix + governance-aligned run caps.
  assert.match(publicContent, /data-testid="hosted-capacity-matrix"/);
  assert.doesNotMatch(publicContent, /data-testid="continuity-capacity-matrix"/);
  assert.match(publicContent, /Transparent hosted capacity/);
  assert.match(publicContent, /Fenced VPS runs \/ 30d/);
  assert.match(publicContent, /Surprise egress \/ idle fees/);
  assert.match(publicContent, /from "@\/lib\/continuity-pricing"/);
  assert.doesNotMatch(publicContent, /Is this Continuity/);
  assert.doesNotMatch(publicContent, /\$49<small>\/month<\/small>/);
  assert.match(publicContent, /CONTINUITY_PRICE_TIERS/);
  assert.doesNotMatch(publicContent, /CONTINUITY_EXECUTION_MODES/);
  assert.match(publicContent, /CONTINUITY_ZERO_EGRESS/);
  assert.doesNotMatch(publicContent, /data-testid="continuity-execution-modes"/);
  assert.match(publicContent, /data-testid="hosted-zero-egress"/);
  assert.doesNotMatch(publicContent, /data-testid="continuity-zero-egress"/);
  assert.doesNotMatch(publicContent, /data-mode=\{mode\.id\}/);
  assert.match(robots, /disallow: \["\/dashboard", "\/admin", "\/api\/"\]/);
  assert.match(robots, /https:\/\/thumbgate\.app\/sitemap\.xml/);
  assert.match(publicContent, /href="\/privacy"/);
  assert.match(publicContent, /href="\/terms"/);
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
  assert.match(llms, /Is Codex-sub-on-laptop the \$10 offer\? No/);
  assert.match(llms, /Do not wrap ChatGPT Plus into thumbgate\.app/);
  assert.doesNotMatch(publicContent, /Igor|Ganapolsky/i);
  assert.doesNotMatch(`${layout}\n${robots}\n${sitemap}\n${llms}`, /Igor|Ganapolsky/i);
  assert.doesNotMatch(publicContent, /codex-preview|react-loading-skeleton/);
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

test("public legal pages use hosted Hermes, not Continuity", async () => {
  const [privacy, terms] = await Promise.all([
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(privacy, /title: "Privacy — ThumbGate hosted Hermes"/);
  assert.match(privacy, /Hosted Hermes runs on thumbgate\.app/);
  assert.match(privacy, /not on a phone leash/);
  assert.doesNotMatch(privacy, /Continuity/);
  assert.match(terms, /title: "Terms — ThumbGate hosted Hermes"/);
  assert.match(terms, /Hosted Hermes is the product/);
  assert.match(terms, /Hosted Hermes is a fenced VPS runner/);
  assert.match(terms, /no phone leash/);
  assert.doesNotMatch(terms, /Continuity/);
});

test("conversion e2e: auth aliases, public health, no store 302, no invented traction", async () => {
  const [signin, login, checkout, health, catalog, expertiseData, expertiseClient] = await Promise.all([
    readFile(new URL("../app/signin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/checkout/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/.well-known/ai-catalog.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/expertise-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/expertise/ExpertiseClient.tsx", import.meta.url), "utf8"),
  ]);
  for (const [name, src] of [["signin", signin], ["login", login]]) {
    assert.match(src, /status:\s*307/, name);
    assert.match(src, /\/api\/auth\/login\?return_to=\/dashboard/, name);
    assert.doesNotMatch(src, /status:\s*404/, name);
  }
  assert.match(checkout, /status:\s*307/);
  assert.match(checkout, /currentSession\(/);
  assert.match(checkout, /action="\/api\/billing\/checkout" method="POST"/);
  assert.match(checkout, /Location:\s*"\/dashboard"/);
  assert.doesNotMatch(health, /service:\s*"leash-control"/);
  assert.doesNotMatch(health, /LEASH_DATABASE_UNAVAILABLE/);
  assert.match(health, /currentAdminSession/);
  assert.match(health, /hosted-hermes/);
  assert.match(health, /if \(!\(await isAdmin\(\)\)\)/);
  assert.match(health, /usersTotal/);
  assert.match(health, /advertisePaid/);
  assert.match(health, /publicHealthFromCache/);
  assert.doesNotMatch(catalog, /SignedMachinePairing|Leash/);
  assert.doesNotMatch(expertiseData, /147 cloud|99\.3%|40% faster|closing the lid|Igor|Ganapolsky/i);
  assert.match(expertiseData, /caseStudies: \[\]/);
  assert.doesNotMatch(expertiseClient, /Author:|cs\.author\.name|147|99\.3%|40% faster/i);
  assert.doesNotMatch(`${signin}\n${login}\n${checkout}\n${health}\n${catalog}`, /Igor|Ganapolsky/i);
});
