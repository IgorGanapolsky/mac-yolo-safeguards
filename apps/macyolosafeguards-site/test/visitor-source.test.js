import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import worker from "../src/worker.js";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const script = html.match(/<script>\s*(\/\/ Where a visitor came from[\s\S]*?)<\/script>/)[1];
const hrefs = [...html.matchAll(/<a [^>]*href="(\/go\/[^"]+)"/g)].map((m) => m[1]);

function page(search, referrer) {
  const banner = { hidden: true };
  const links = hrefs.map((href) => ({ href, getAttribute() { return this.href; }, setAttribute(_, v) { this.href = v; } }));
  vm.runInNewContext(script, {
    URL, URLSearchParams,
    location: { search },
    document: { referrer, getElementById: () => banner, querySelectorAll: () => links },
  });
  return { banner: !banner.hidden, links: Object.fromEntries(links.map((l, i) => [hrefs[i], l.href])) };
}

test("banner starts hidden and checkout links start untagged", () => {
  assert.match(html, /<p id="ph-welcome" class="welcome" hidden>/);
  assert.ok(hrefs.includes("/go/pro-once") && hrefs.includes("/go/dmg"));
});

test("the app's Pro notice tags paid checkout links, not downloads", () => {
  const p = page("?from=app_nudge", "");
  assert.equal(p.links["/go/pro-once"], "/go/pro-once?client_reference_id=app_nudge");
  assert.equal(p.links["/go/sprint"], "/go/sprint?client_reference_id=app_nudge");
  assert.equal(p.links["/go/dmg"], "/go/dmg");
  assert.equal(p.banner, false);
});

test("Product Hunt visitors see the welcome and their checkouts are tagged producthunt", () => {
  for (const p of [page("?ref=producthunt", ""), page("", "https://www.producthunt.com/posts/x")]) {
    assert.equal(p.banner, true);
    assert.equal(p.links["/go/pro-once"], "/go/pro-once?client_reference_id=producthunt");
  }
});

test("everyone else, and junk sources, change nothing", () => {
  for (const p of [page("", ""), page("?ref=github", "https://github.com/"), page("?from=<script>", ""), page("", "https://notproducthunt.com/")]) {
    assert.equal(p.banner, false);
    assert.equal(p.links["/go/pro-once"], "/go/pro-once");
  }
});

test("/pricing keeps the source when it redirects", async () => {
  const r = await worker.fetch(new Request("https://macyolosafeguards.io/pricing?from=app_nudge"), {});
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "https://macyolosafeguards.io/?from=app_nudge#pricing");
  const plain = await worker.fetch(new Request("https://macyolosafeguards.io/pricing"), {});
  assert.equal(plain.headers.get("location"), "https://macyolosafeguards.io/#pricing");
});

test("/go/pro passes client_reference_id through to Stripe", async () => {
  const r = await worker.fetch(new Request("https://macyolosafeguards.io/go/pro?client_reference_id=app_nudge"), {});
  assert.match(r.headers.get("location"), /^https:\/\/buy\.stripe\.com\/.+\?client_reference_id=app_nudge$/);
});
