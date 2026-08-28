import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function read(rel) {
  const url = new URL(rel, root);
  assert.equal(existsSync(url), true, `${rel} must exist (live 404 otherwise)`);
  return readFileSync(url, "utf8");
}

test("primary $10 hosted Hermes CTAs POST Stripe Checkout, not WorkOS login", () => {
  const page = read("app/page.tsx");
  const chrome = read("app/LandingAuthChrome.tsx");
  const surfaces = read("app/StartSurfaces.tsx");
  const cta = read("app/HostedCheckoutCta.tsx");

  assert.match(cta, /action="\/api\/billing\/checkout"/);
  assert.match(cta, /method="POST"/);
  assert.match(cta, /funnelEvent = "hosted_checkout_click"/);
  assert.match(cta, /data-funnel-event=\{funnelEvent\}/);
  assert.doesNotMatch(cta, /\/api\/auth\/login/);

  assert.equal(
    (page.match(/href="#pricing" className="button button-primary" data-funnel-event="hosted_checkout_click"/g) ?? []).length,
    0,
  );
  assert.equal(
    (page.match(/href="\/api\/auth\/login" className="button button-primary" data-funnel-event="hosted_checkout_click"/g) ?? []).length,
    0,
  );
  // Page/StartSurfaces go through session-aware LandingPricingCtaPaid (anon → HostedCheckoutCta).
  assert.equal((page.match(/<LandingPricingCtaPaid/g) ?? []).length >= 2, true);
  assert.match(chrome, /<HostedCheckoutCta>/);
  assert.doesNotMatch(
    chrome,
    /href="\/api\/auth\/login"\s+className="button button-primary"\s+data-funnel-event="hosted_checkout_click"/,
  );
  assert.doesNotMatch(chrome, /href="#pricing"\s+className="button button-primary"/);
  assert.match(chrome, /session\.mode === "session" \? "\/dashboard" : "\/api\/auth\/login"/);

  assert.match(surfaces, /LandingPricingCtaPaid/);
  assert.match(surfaces, /testId="start-browser"/);
  assert.doesNotMatch(surfaces, /href="\/api\/auth\/login"/);
  assert.doesNotMatch(surfaces, /href="#pricing"/);

  // Pricing nav stays a hash jump. Sign-in stays WorkOS for strangers.
  assert.match(chrome, /href="#pricing" className="nav-link">Pricing<\/a>/);
  assert.match(chrome, /className="landing-action" href=\{isSession \? "\/dashboard" : "#pricing"\}/);
  assert.equal((chrome.match(/"sign_in_click"/g) ?? []).length, 1);
});

test("signin and login aliases 307 to WorkOS; /checkout auto-POSTs Stripe for strangers", () => {
  for (const rel of ["app/signin/route.ts", "app/login/route.ts"]) {
    const src = read(rel);
    assert.match(src, /status:\s*307/);
    assert.match(src, /\/api\/auth\/login\?return_to=\/dashboard/);
    assert.doesNotMatch(src, /status:\s*404/);
    assert.match(src, /export const HEAD = GET/);
  }
  const checkout = read("app/checkout/route.ts");
  assert.match(checkout, /currentSession/);
  assert.match(checkout, /hasCloudContinuationAccess/);
  assert.match(checkout, /Location: "\/dashboard"/);
  assert.match(checkout, /action="\/api\/billing\/checkout" method="POST"/);
  assert.doesNotMatch(checkout, /\/api\/auth\/login\?return_to=\/dashboard/);
  assert.doesNotMatch(checkout, /status:\s*404/);
  assert.match(checkout, /export const HEAD = GET/);
});

test("Hermes Mobile /go/ios and /go/android 301 to / (no store 302 on this host)", () => {
  const ios = read("app/go/ios/route.ts");
  const android = read("app/go/android/route.ts");
  assert.match(ios, /status:\s*301/);
  assert.match(ios, /Location:\s*"\/"/);
  assert.doesNotMatch(ios, /APP_STORE_URL|Response\.redirect/);
  assert.match(android, /status:\s*301/);
  assert.match(android, /Location:\s*"\/"/);
  assert.doesNotMatch(android, /PLAY_STORE_URL|Response\.redirect/);
});
