import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chrome = readFileSync(new URL("../app/LandingAuthChrome.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const surfaces = readFileSync(new URL("../app/StartSurfaces.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../app/checkout/route.ts", import.meta.url), "utf8");

test("entitled sessions open the dashboard instead of another $10 checkout wall", () => {
  assert.match(chrome, /hasHostedEntitlement/);
  assert.match(chrome, /Continue hosted Hermes/);
  assert.match(chrome, /Trial active · Open dashboard/);
  assert.match(chrome, /LandingPricingCtaPaid/);
  assert.match(chrome, /hasHostedEntitlement\(session\)/);
  // Paid CTA must branch to /dashboard when entitled.
  assert.match(chrome, /href="\/dashboard"[\s\S]*data-funnel-event="dashboard_open_click"/);
});

test("anonymous visitors still get the $10 hosted checkout CTA", () => {
  assert.match(chrome, /Start hosted Hermes — \$10\/mo/);
  assert.match(chrome, /<HostedCheckoutCta>/);
});

test("page and StartSurfaces route primary paid CTAs through session-aware LandingPricingCtaPaid", () => {
  assert.doesNotMatch(page, /import \{ HostedCheckoutCta \}/);
  assert.doesNotMatch(page, /<HostedCheckoutCta/);
  assert.match(page, /<LandingPricingCtaPaid/);
  assert.doesNotMatch(surfaces, /HostedCheckoutCta/);
  assert.match(surfaces, /LandingPricingCtaPaid/);
  assert.match(surfaces, /testId="start-browser"/);
});

test("GET /checkout only skips Stripe when the session already has cloud access", () => {
  assert.match(checkout, /hasCloudContinuationAccess/);
  assert.match(checkout, /Location: "\/dashboard"/);
  assert.match(checkout, /action="\/api\/billing\/checkout" method="POST"/);
});

test("hero does not claim You're on Pro for trial users", () => {
  assert.match(chrome, /Trial active · Open dashboard/);
  assert.match(chrome, /You&apos;re on \{session\.plan === "team" \? "Team" : "Pro"\} · Manage billing/);
  assert.match(chrome, /paid \? \(/);
  assert.match(chrome, /isPaidPlan/);
});

test("loading shows Checking session; entitled label ignores \$10 children", () => {
  assert.match(chrome, /Checking session…/);
  assert.match(chrome, /session\.mode === "loading"/);
  // Entitled return path hard-codes Continue — no children interpolation there.
  assert.match(
    chrome,
    /if \(hasHostedEntitlement\(session\)\) \{[\s\S]*?Continue hosted Hermes <span aria-hidden="true">→<\/span>[\s\S]*?\}\s*return \(/,
  );
});
