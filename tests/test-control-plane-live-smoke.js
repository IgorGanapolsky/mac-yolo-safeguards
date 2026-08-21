#!/usr/bin/env node
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");

const smoke = readFileSync(new URL("../scripts/control-plane-live-smoke.sh", `file://${__filename}`), "utf8");

test("live smoke tracks the intentional guest checkout contract", () => {
  assert.match(smoke, /check "guest checkout starts" "200"/);
  assert.match(smoke, /check "guest checkout returns Stripe URL" "https:\/\/checkout\.stripe\.com\/\*"/);
  assert.doesNotMatch(smoke, /unauthenticated checkout rejected/);
  assert.doesNotMatch(smoke, /check "[^"]*checkout[^"]*" "401"/);
});

test("live smoke validates the response body instead of accepting any 200", () => {
  assert.match(smoke, /checkout_response=/);
  assert.match(smoke, /checkout_body=/);
  assert.match(smoke, /checkout_url=/);
  assert.match(smoke, /checkout\.stripe\.com/);
});
