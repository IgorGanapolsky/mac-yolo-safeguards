import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const homeUrl = new URL("../app/page.tsx", import.meta.url);
const detailUrl = new URL("../app/how-it-works/page.tsx", import.meta.url);

function sectionCount(source) {
  return (source.match(/<section\b/g) ?? []).length;
}

test("homepage is a concise decision page and links to the full product tour", () => {
  assert.equal(existsSync(detailUrl), true, "/how-it-works must preserve the detailed product tour");

  const home = readFileSync(homeUrl, "utf8");
  const detail = readFileSync(detailUrl, "utf8");
  const lede = home.match(/<p className="hero-lede">([\s\S]*?)<\/p>/)?.[1]
    .replace(/\s+/g, " ")
    .trim();

  assert.ok(lede, "homepage must keep a clear hero promise");
  assert.ok(lede.length <= 320, `hero promise is ${lede.length} characters; keep it scannable`);
  assert.ok(sectionCount(home) <= 4, `homepage still renders ${sectionCount(home)} sections`);
  assert.ok(sectionCount(detail) > sectionCount(home), "long-form detail belongs off the homepage");

  assert.match(home, /<LandingAuthHero \/>/);
  assert.match(home, /href="\/how-it-works" className="button button-secondary"/);
  assert.match(home, /id="pricing"/);
  assert.match(home, /id="expertise"/);
  assert.doesNotMatch(home, /<FailoverPathDemo \/>/);
  assert.doesNotMatch(home, /data-testid="(?:example-tasks|give-work-loop|qualifier|one-offer|sleep-vs-vps)"/);
  assert.doesNotMatch(home, /<section[^>]+id="(?:setup|closed-system|faq)"/);

  assert.match(detail, /<FailoverPathDemo \/>/);
  assert.match(detail, /data-testid="example-tasks"/);
  assert.match(detail, /data-testid="give-work-loop"/);
  assert.match(detail, /data-testid="qualifier"/);
  assert.match(detail, /data-testid="one-offer"/);
  assert.match(detail, /data-testid="sleep-vs-vps"/);
  assert.match(detail, /id="setup"/);
  assert.match(detail, /id="closed-system"/);
  assert.match(detail, /id="faq"/);
  assert.match(detail, /href="\/#pricing"/);
});
