import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutTarget } from "../src/worker.js";

test("production /go/pro goes to the live Pro checkout", () => {
  assert.match(checkoutTarget("pro", {}), /^https:\/\/buy\.stripe\.com\//);
});

test("staging never redirects to a live checkout", () => {
  const staging = { CHECKOUT_MODE: "test" };
  for (const slug of ["pro", "monthly", "diagnostic", "sprint", "pilot", "3000"]) {
    assert.equal(checkoutTarget(slug, staging), undefined, slug);
  }
});

test("staging Pro slugs use the test-mode checkout when one is configured", () => {
  const staging = { CHECKOUT_MODE: "test", PRO_CHECKOUT_URL: "https://buy.stripe.com/test_abc" };
  assert.equal(checkoutTarget("pro", staging), "https://buy.stripe.com/test_abc");
  assert.equal(checkoutTarget("diagnostic", staging), undefined);
});
