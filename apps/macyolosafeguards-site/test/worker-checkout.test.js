import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutTarget, checkoutRedirect } from "../src/worker.js";

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

const LINK = "https://buy.stripe.com/00weVegjK9lBeVN9I3f3a05";
const tagOf = (qs) => new URL(checkoutRedirect(LINK, new URLSearchParams(qs))).searchParams.get("client_reference_id");

test("?from= becomes client_reference_id so Stripe keeps the visitor source", () => {
  assert.equal(tagOf("from=app"), "app");
});

test("the source is cleaned to letters, digits, dash and underscore", () => {
  assert.equal(tagOf("from=hn post!"), "hnpost");
  assert.equal(tagOf("from=" + "a".repeat(300)).length, 200);
});

test("utm_source is used when from is missing", () => {
  assert.equal(tagOf("utm_source=chatgpt_ads"), "chatgpt_ads");
});

test("no source means no client_reference_id", () => {
  assert.equal(tagOf(""), null);
  assert.equal(tagOf("from=!!!"), null);
});
