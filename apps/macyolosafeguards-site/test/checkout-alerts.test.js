import { test } from "node:test";
import assert from "node:assert/strict";
import { findCheckoutAlerts, sendCheckoutAlerts, NTFY_URL } from "../src/checkout-alerts.js";

const NOW = Date.UTC(2026, 10, 12, 16, 7); // 11:07 AM ET; slice is 10:30-11:00 AM ET
const END = Math.floor(NOW / 1000 / 1800) * 1800;
const PILOT = "plink_1UX2foGGBpd520QYJpfjYKge";

function fakeFetch({ open = [], expired = [] }, sent = []) {
  return async (url, opts) => {
    if (url === NTFY_URL) { sent.push(opts); return { ok: true, json: async () => ({}) }; }
    const q = new URL(url).searchParams;
    const gte = Number(q.get("created[gte]")), lt = Number(q.get("created[lt]") || Infinity);
    const pool = q.get("status") === "open" ? open : expired;
    return { ok: true, json: async () => ({ data: pool.filter((s) => s.created >= gte && s.created < lt) }) };
  };
}

test("an open $3,000 checkout an hour old alerts once, without the buyer's email", async () => {
  const s = { id: "cs_live_1", created: END - 3600 - 600, amount_total: 300000, currency: "usd", payment_link: PILOT, payment_intent: "pi_9", customer_details: { email: "buyer@example.com" } };
  const a = await findCheckoutAlerts({}, NOW, fakeFetch({ open: [s] }));
  assert.equal(a.length, 1);
  assert.equal(a[0].title, "$3,000.00 Partner Pilot checkout open for an hour, not paid");
  assert.match(a[0].body, /AM ET\. The buyer left an email/);
  assert.equal(a[0].click, "https://dashboard.stripe.com/acct_1RNcJ1GGBpd520QY/payments/pi_9");
  assert.ok(!JSON.stringify(a).includes("buyer@example.com"));
  // The next slice does not repeat it.
  assert.equal((await findCheckoutAlerts({}, NOW + 1800 * 1000, fakeFetch({ open: [s] }))).length, 0);
});

test("small checkouts and ones that expired outside the slice are ignored", async () => {
  const expired = [
    { id: "cs_live_a", created: END - 86400, expires_at: END - 600, amount_total: 300000, currency: "usd" },
    { id: "cs_live_b", created: END - 86400, expires_at: END - 3000, amount_total: 300000, currency: "usd" },
    { id: "cs_live_c", created: END - 86400, expires_at: END - 600, amount_total: 1900, currency: "usd" },
  ];
  const a = await findCheckoutAlerts({}, NOW, fakeFetch({ expired, open: [{ id: "cs_live_d", created: END - 4000, amount_total: 1900 }] }));
  assert.deepEqual(a.map((x) => [x.sessionId, x.kind]), [["cs_live_a", "expired"]]);
  assert.equal(a[0].title, "$3,000.00 checkout expired unpaid");
  assert.match(a[0].body, /No email was entered/);
});

test("sends to ntfy with a live key and stays silent with a test key", async () => {
  const s = { id: "cs_live_1", created: END - 3600 - 60, amount_total: 50000, currency: "usd" };
  const sent = [];
  await sendCheckoutAlerts({ STRIPE_RESTRICTED_KEY: "rk_live_x" }, NOW, fakeFetch({ open: [s] }, sent));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers.Title, "$500.00 checkout open for an hour, not paid");
  const quiet = [];
  assert.deepEqual(await sendCheckoutAlerts({ STRIPE_RESTRICTED_KEY: "sk_test_x" }, NOW, fakeFetch({ open: [s] }, quiet)), []);
  assert.equal(quiet.length, 0);
});
