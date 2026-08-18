import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

function read(rel) {
  const url = new URL(rel, root);
  assert.equal(existsSync(url), true, `${rel} must exist (live 404 otherwise)`);
  return readFileSync(url, "utf8");
}

test("primary $10 hosted Hermes CTAs start WorkOS login, not #pricing", () => {
  const page = read("app/page.tsx");
  const chrome = read("app/LandingAuthChrome.tsx");
  const surfaces = read("app/StartSurfaces.tsx");

  assert.equal(
    (page.match(/href="#pricing" className="button button-primary" data-funnel-event="cloud_continuity_click"/g) ?? []).length,
    0,
  );
  assert.equal(
    (page.match(/href="\/api\/auth\/login" className="button button-primary" data-funnel-event="cloud_continuity_click"/g) ?? []).length,
    3,
  );

  assert.match(
    chrome,
    /href="\/api\/auth\/login"\s+className="button button-primary"\s+data-funnel-event="cloud_continuity_click"/,
  );
  assert.doesNotMatch(chrome, /href="#pricing"\s+className="button button-primary"/);
  assert.match(chrome, /mode === "session" \? "\/dashboard" : "\/api\/auth\/login"/);

  assert.match(surfaces, /href="\/api\/auth\/login"/);
  assert.match(surfaces, /data-testid="start-browser"/);
  assert.doesNotMatch(surfaces, /href="#pricing"/);

  // See-pricing secondary stays a hash jump.
  assert.match(chrome, /href="#pricing" className="nav-link">Pricing<\/a>/);
  assert.match(chrome, /className="landing-action" href="#pricing"/);
});

test("signin, login, and checkout aliases 307 to WorkOS login (not 404)", () => {
  for (const rel of ["app/signin/route.ts", "app/login/route.ts", "app/checkout/route.ts"]) {
    const src = read(rel);
    assert.match(src, /status:\s*307/);
    assert.match(src, /\/api\/auth\/login\?return_to=\/dashboard/);
    assert.doesNotMatch(src, /status:\s*404/);
    assert.match(src, /export const HEAD = GET/);
  }
  const checkout = read("app/checkout/route.ts");
  assert.match(checkout, /currentSession/);
  assert.match(checkout, /Location: "\/dashboard"/);
});

test("Hermes Mobile /go/ios and /go/android stay store 302s", () => {
  const ios = read("app/go/ios/route.ts");
  const android = read("app/go/android/route.ts");
  assert.match(ios, /APP_STORE_URL/);
  assert.match(ios, /302/);
  assert.doesNotMatch(ios, /Location:\s*"\/"/);
  assert.match(android, /PLAY_STORE_URL/);
  assert.match(android, /302/);
  assert.doesNotMatch(android, /Location:\s*"\/"/);
});
