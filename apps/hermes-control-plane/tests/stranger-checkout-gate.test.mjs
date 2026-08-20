import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const checkout = readFileSync(new URL("app/api/billing/checkout/route.ts", root), "utf8");
const webhook = readFileSync(new URL("app/api/billing/webhook/route.ts", root), "utf8");
const callback = readFileSync(new URL("app/api/auth/callback/route.ts", root), "utf8");
const health = readFileSync(new URL("app/api/health/route.ts", root), "utf8");
const sourceOfTruth = readFileSync(new URL("lib/hosted-source-of-truth.ts", root), "utf8");

test("unsigned stranger can start Stripe Checkout without a 401", () => {
  assert.match(checkout, /currentSession\(\)/);
  assert.doesNotMatch(checkout, /requireSession/);
  assert.doesNotMatch(checkout, /sign in required/);
  assert.match(checkout, /hosted-pending/);
  assert.match(checkout, /ensureGuestOrganization/);
  assert.match(checkout, /status: 303/);
  assert.match(checkout, /Location: url/);
  assert.match(checkout, /return Response\.json\(\{ url \}\)/);
  assert.doesNotMatch(checkout, /advertisePaid\s*:\s*true/);
  assert.doesNotMatch(checkout, /live\s*:\s*true/);
  assert.doesNotMatch(checkout, /HostingSelector|dual-route|route picker/);
  assert.doesNotMatch(checkout, /Continuity Cloud|pairComputerLabel/);
});

test("webhook binds guest checkout to payer email; login claims pending:email", () => {
  assert.match(webhook, /customer_details\?\.email/);
  assert.match(webhook, /pending:\$\{payerEmail\}/);
  assert.match(webhook, /name = 'hosted-pending'/);
  assert.match(callback, /pending:\$\{normalizedEmail\}/);
  assert.match(callback, /pendingPaid/);
});

test("health stays fail-closed: do not advertise paid while turningOn", () => {
  assert.match(health, /advertisePaid: hosted\.advertisePaid/);
  assert.match(health, /turningOn: hosted\.turningOn/);
  assert.match(sourceOfTruth, /return input\.runnerTrust === "verified" && input\.modelTrust === "verified"/);
  assert.match(sourceOfTruth, /if \(input\.cacheKnown === false\) return false/);
});
