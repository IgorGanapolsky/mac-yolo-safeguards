import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import worker, { goEvent } from "../src/worker.js";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const script = html.match(/<script>\s*(\/\/ Privacy-light analytics[\s\S]*?)<\/script>/)[1];
const AD = "?utm_source=chatgpt&utm_medium=cpc&utm_campaign=nov26-test&utm_content=macyolo";

function page(search) {
  const sent = [];
  const mk = (href) => ({ href, handlers: [], getAttribute(n) { return n === "href" ? this.href : ""; }, setAttribute(_, v) { this.href = v; }, addEventListener(_, f) { this.handlers.push(f); } });
  const links = ["/go/dmg", "/go/pkg", "/go/pro-once", "/go/diagnostic"].map(mk);
  vm.runInNewContext(script, {
    URLSearchParams, JSON, Math, encodeURIComponent, Object, Array,
    location: { search, pathname: "/" },
    document: { referrer: "https://chatgpt.com/", title: "t", querySelectorAll: () => links },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: (_u, o) => { sent.push(JSON.parse(o.body)); return Promise.resolve(); },
  });
  return { sent, links, click: (i) => links[i].handlers.forEach((h) => h.call(links[i], {})) };
}

test("pageview carries product=macyolo and the ad utm params, with no person profile", () => {
  const { sent } = page(AD);
  assert.equal(sent[0].event, "pageview");
  assert.equal(sent[0].properties.product, "macyolo");
  assert.equal(sent[0].properties.utm_source, "chatgpt");
  assert.equal(sent[0].properties.utm_campaign, "nov26-test");
  assert.equal(sent[0].properties.utm_content, "macyolo");
  assert.equal(sent[0].properties.$process_person_profile, false);
});

test("download and Pro clicks are counted with plan, price and utm", () => {
  const p = page(AD);
  p.click(0); p.click(1); p.click(2); p.click(3);
  const ev = p.sent.slice(1).map((e) => [e.event, e.properties.format || e.properties.plan, e.properties.price, e.properties.utm_source]);
  assert.deepEqual(ev, [["download_click", "dmg", undefined, "chatgpt"], ["download_click", "pkg", undefined, "chatgpt"], ["pro_click", "pro", 29, "chatgpt"], ["team_click", "investigation", 499, "chatgpt"]]);
});

test("an explicit ?from= source is kept alongside utm_source", () => {
  const sc = script;
  const links = [{ href: "/go/pro-once?client_reference_id=app_nudge", getAttribute() { return this.href; }, setAttribute(_, v) { this.href = v; }, addEventListener() {} }];
  vm.runInNewContext(sc, { URLSearchParams, JSON, Math, encodeURIComponent, Object, location: { search: AD, pathname: "/" }, document: { referrer: "", title: "t", querySelectorAll: () => links }, sessionStorage: { getItem: () => null, setItem() {} }, fetch: () => Promise.resolve() });
  assert.match(links[0].href, /&from=app_nudge$/);
});

test("a utm value that is cut mid-emoji does not break the script", () => {
  const p = page("?utm_source=" + encodeURIComponent("a".repeat(99) + "\u{1F600}"));
  assert.equal(p.sent[0].event, "pageview");
  assert.equal(p.sent[0].properties.utm_source.length, 101);
});

test("utm params are copied onto /go links; plain visits leave links untouched", () => {
  assert.equal(page(AD).links[2].href, "/go/pro-once" + AD);
  assert.equal(page("").links[2].href, "/go/pro-once");
});

test("worker counts /go hits server-side without a cookie or a user id", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, o) => { calls.push([u, JSON.parse(o.body)]); return Promise.resolve(new Response("{}")); };
  const waits = [];
  try {
    const req = new Request("https://macyolosafeguards.io/go/pro-once" + AD, { headers: { "user-agent": "Mozilla/5.0 Safari" } });
    const res = await worker.fetch(req, {}, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /client_reference_id=chatgpt/);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://us.i.posthog.com/capture/");
  const b = calls[0][1];
  assert.equal(b.event, "go_redirect");
  assert.equal(b.properties.product, "macyolo");
  assert.equal(b.properties.utm_source, "chatgpt");
  assert.equal(b.properties.price, 29);
  assert.equal(b.properties.likely_bot, false);
  assert.equal(b.properties.$ip, null);
});

test("curl is flagged as a likely bot", () => {
  const e = goEvent("dmg", new URL("https://x/go/dmg"), new Request("https://x/go/dmg", { headers: { "user-agent": "curl/8" } }));
  assert.equal(e.event, "go_redirect");
  assert.equal(e.properties.format, "dmg");
  assert.equal(e.properties.likely_bot, true);
});

test("staging (test-mode checkout) sends no analytics", async () => {
  let n = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { n++; return Promise.resolve(new Response("{}")); };
  try {
    const res = await worker.fetch(new Request("https://x/go/pro-once"), { CHECKOUT_MODE: "test", PRO_CHECKOUT_URL: "https://buy.stripe.com/test_x" }, { waitUntil() {} });
    assert.equal(res.status, 302);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(n, 0);
});
