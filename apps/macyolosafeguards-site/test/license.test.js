import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { activate, refresh, readLicense, signLicense, activatePage, PRO_PAYMENT_LINK } from "../src/license.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const SK = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const PK = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
const env = { STRIPE_RESTRICTED_KEY: "rk_test_x", LICENSE_SIGNING_KEY: SK };
const SID = "cs_live_a1B2c3D4e5F6g7H8";

function fakeStripe(routes) {
  return async (url, opts) => {
    assert.equal(opts.headers.Authorization, "Bearer rk_test_x");
    const path = url.replace("https://api.stripe.com/v1/", "");
    return path in routes ? { ok: true, json: async () => routes[path] } : { ok: false, json: async () => ({}) };
  };
}

const paid = { status: "complete", payment_status: "paid", payment_link: PRO_PAYMENT_LINK, subscription: "sub_123", customer_details: { email: "buyer@example.com" } };

test("signed key round-trips and a tampered key is rejected", async () => {
  const key = await signLicense(SK, { email: "a@b.c", sub: "sub_1" }, Date.UTC(2026, 10, 11));
  const lic = await readLicense(key, PK);
  assert.equal(lic.email, "a@b.c");
  assert.equal(lic.exp, Date.UTC(2026, 10, 11) / 1000 + 40 * 86400);
  const [body, sig] = key.split(".");
  assert.equal(await readLicense(`${body}x.${sig}`, PK), null);
  assert.equal(await readLicense("garbage", PK), null);
});

test("a paid Pro checkout gets a key", async () => {
  const r = await activate(env, SID, fakeStripe({ [`checkout/sessions/${SID}`]: paid }));
  assert.equal(r.ok, true);
  assert.equal(r.email, "buyer@example.com");
  const lic = await readLicense(r.key, PK);
  assert.equal(lic.sub, "sub_123");
  assert.match(activatePage(r), /macyolo:\/\/activate\?key=/);
});

test("unpaid, wrong-product and bad ids get no key", async () => {
  const unpaid = await activate(env, SID, fakeStripe({ [`checkout/sessions/${SID}`]: { ...paid, payment_status: "unpaid", status: "open" } }));
  assert.equal(unpaid.ok, false);
  const other = await activate(env, SID, fakeStripe({ [`checkout/sessions/${SID}`]: { ...paid, payment_link: "plink_other" } }));
  assert.equal(other.ok, false);
  assert.equal((await activate(env, "cs_live_<script>", fakeStripe({}))).ok, false);
  assert.equal((await activate(env, SID, fakeStripe({}))).ok, false);
  assert.doesNotMatch(activatePage(other), /macyolo:\/\//);
});

test("refresh renews only while the subscription is active", async () => {
  // refresh() checks against the embedded production public key, so sign with a key it trusts:
  // here we only check that a key signed by someone else is refused.
  const foreign = await signLicense(SK, { email: "a@b.c", sub: "sub_123" });
  const r = await refresh(env, foreign, fakeStripe({ "subscriptions/sub_123": { status: "active" } }));
  assert.equal(r.ok, false, "keys not signed by the production key are refused");
});

test("refresh renews an active subscription and refuses a cancelled one", async () => {
  const key = await signLicense(SK, { email: "a@b.c", sub: "sub_123" }, Date.UTC(2026, 0, 1));
  const ok = await refresh(env, key, fakeStripe({ "subscriptions/sub_123": { status: "active" } }), PK);
  assert.equal(ok.ok, true);
  assert.ok((await readLicense(ok.key, PK)).exp > Date.now() / 1000 + 39 * 86400);
  const gone = await refresh(env, key, fakeStripe({ "subscriptions/sub_123": { status: "canceled" } }), PK);
  assert.deepEqual(gone, { ok: false, reason: "subscription canceled" });
});
